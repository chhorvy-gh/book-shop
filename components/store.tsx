"use client";

// The shared sales book, kept in Firestore. Signs people in with Google, checks they are a member of the shop,
// listens to the documents the pages need, and turns them into one SaleBookState. Every change goes straight to
// Firestore; its local cache shows the change at once (also offline) and sends it when the connection allows.
// Pages use useSaleBook() and never touch Firestore themselves.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query, where, type Firestore, type QuerySnapshot } from "firebase/firestore";
import * as dbw from "@/lib/db";
import type { MemberDoc, MonthDoc, NoteDoc, OrderDoc, SettingsDoc, SettlementDoc, WeekDoc } from "@/lib/db";
import { firebase } from "@/lib/firebase";
import { bookMonths, emptyState, isLoaded, monthId, monthPayout, picked } from "@/lib/periods";
import { loadSample } from "@/lib/sample";
import type { Note, Order, PayoutEntry, SaleBookState, Seller, SettlementRow, Week } from "@/lib/types";

export type Role = "owner" | "member";
// locked = signed in, but the database refuses to say who is a member (its security rules are not published yet).
export type AccessStatus = "loading" | "signedOut" | "unclaimed" | "noAccess" | "locked" | "member";
export interface Access {
  status: AccessStatus;
  user: User | null;
  email: string; // lower case
  role: Role | null;
  detail?: string; // why the database could not be used ("locked")
}

export interface SaleBook {
  state: SaleBookState;
  // False until the first data has arrived; pages render inside <BookReady>, so they never see it false.
  ready: boolean;
  access: Access;
  // The last save that failed (shown by the shell), and a way to clear it.
  error: string;
  clearError: () => void;

  // ----- Signing in -----
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  claimShop: () => Promise<void>;

  // ----- The month and week on screen (this device only); week null = the whole month -----
  setPick: (month: string, week: number | null) => void;

  // ----- Months and weeks -----
  // Makes the month with its first week; resolves to the month id, or null when the month is there already.
  addMonth: (y: number, m: number, first: Week) => Promise<string | null>;
  addWeek: (monthId: string, week: Week) => void;
  setWeekDates: (monthId: string, no: number, date: string, end: string) => void;
  // Keeps each seller's weekly payouts on the month, so the month's history no longer needs its orders.
  closeMonth: (monthId: string) => void;

  // ----- Marts, sellers, rate -----
  // Returns the new mart's id: the next number up, skipping one whose "Mart N" is already another mart's name.
  addMart: () => string;
  renameMart: (id: string, name: string) => void;
  // Mart 1 and Mart 2 stay; another mart goes with its orders in every week.
  removeMart: (id: string) => Promise<void>;
  // A mart's orders over every week (asks the server): count incl. cancelled, weeks, sale excl. cancelled.
  martStats: (id: string) => Promise<{ orders: number; weeks: number; sale: number }>;
  addSeller: (seller: Seller) => void;
  setRate: (rate: number) => void;

  // ----- Orders (by weekKey + mart) -----
  // Returns the new order's id at once.
  addOrder: (weekKey: string, martId: string, order: Omit<Order, "id">) => string;
  updateOrder: (id: string, patch: Partial<Omit<Order, "id">>) => void;
  deleteOrder: (id: string) => void;

  // ----- Pay-later notes -----
  addNote: (weekKey: string, note: Omit<Note, "id">) => string;
  updateNote: (id: string, patch: Partial<Omit<Note, "id">>) => void;

  // ----- Payout, monthly summary, month-end -----
  setPayout: (weekKey: string, seller: string, patch: Partial<PayoutEntry>) => void;
  setMonthDeduct: (monthId: string, seller: string, value: string) => void;
  setSettlementRow: (monthId: string, seller: string, row: SettlementRow) => void;

  // ----- Data -----
  loadSample: () => Promise<void>;
}

const Ctx = createContext<SaleBook | null>(null);

export function useSaleBook() {
  const book = useContext(Ctx);
  if (!book) throw new Error("useSaleBook() must be used inside <SaleBookProvider>");
  return book;
}

const PICK_KEY = "salebook.pick";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Docs<T> = { id: string; data: T }[];
const rows = <T,>(snap: QuerySnapshot) => snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));

export function SaleBookProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<Access>({ status: "loading", user: null, email: "", role: null });
  const [error, setError] = useState("");
  const [pick, setPickState] = useState<{ month: string; week: number | null }>({ month: "", week: null });

  // Raw documents, as they arrive.
  const [settings, setSettings] = useState<SettingsDoc | null>(null);
  const [months, setMonths] = useState<Docs<MonthDoc> | null>(null);
  const [weeks, setWeeks] = useState<Docs<WeekDoc> | null>(null);
  const [notes, setNotes] = useState<Docs<NoteDoc> | null>(null);
  const [settlements, setSettlements] = useState<Docs<SettlementDoc> | null>(null);
  const [unpaid, setUnpaid] = useState<Docs<OrderDoc> | null>(null);
  // Orders of the loaded months; for = which months they are, server = they came from the server, not only the cache.
  const [orders, setOrders] = useState<{ for: string; docs: Docs<OrderDoc>; server: boolean } | null>(null);

  const run = useCallback((p: Promise<unknown>) => {
    p.catch((e) => setError(message(e)));
  }, []);

  // ----- Who is signed in, and are they a member? -----
  useEffect(() => {
    const { auth, db } = firebase();
    let stopMember: (() => void) | null = null;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopMember?.();
      stopMember = null;
      if (!user) {
        setAccess({ status: "signedOut", user: null, email: "", role: null });
        return;
      }
      const email = (user.email ?? "").toLowerCase();
      // Listening to their own member document lets access appear the moment an owner adds them. A member document
      // still waiting to be saved (just claimed) does not count yet: the server would refuse the book until it lands.
      stopMember = onSnapshot(
        doc(db, "members", email),
        { includeMetadataChanges: true },
        async (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          const set = (next: Access) =>
            setAccess((was) => (was.status === next.status && was.role === next.role && was.user === next.user ? was : next));
          if (snap.exists()) {
            set({ status: "member", user, email, role: (snap.data() as MemberDoc).role });
            return;
          }
          // "Not a member" is only believed from the server, never from what this device happens to have cached.
          if (snap.metadata.fromCache) return;
          const boot = await getDoc(doc(db, "meta", "bootstrap")).catch(() => null);
          set({ status: boot?.exists() ? "noAccess" : "unclaimed", user, email, role: null });
        },
        // Reading your own member document is always allowed by firestore.rules, so a refusal here means the database
        // itself is not set up: the rules are not published yet, or the app points at a database that is not there.
        (e) => setAccess({ status: "locked", user, email, role: null, detail: `${(e as { code?: string }).code ?? ""} · ${message(e)}` }),
      );
    });
    return () => {
      stopMember?.();
      stopAuth();
    };
  }, []);

  // The month and week picked last on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PICK_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
      if (saved && typeof saved.month === "string") setPickState({ month: saved.month, week: typeof saved.week === "number" ? saved.week : null });
    } catch {
      /* nothing saved */
    }
  }, []);

  const member = access.status === "member";

  // ----- The book's documents (members only) -----
  useEffect(() => {
    if (!member) return;
    const { db } = firebase();
    const fail = (e: Error) => setError(message(e));
    const stops = [
      onSnapshot(doc(db, "settings", "shop"), (s) => setSettings((s.data() as SettingsDoc | undefined) ?? dbw.DEFAULT_SETTINGS), fail),
      onSnapshot(collection(db, "months"), (s) => setMonths(rows<MonthDoc>(s)), fail),
      onSnapshot(collection(db, "weeks"), (s) => setWeeks(rows<WeekDoc>(s)), fail),
      onSnapshot(collection(db, "notes"), (s) => setNotes(rows<NoteDoc>(s)), fail),
      onSnapshot(collection(db, "settlements"), (s) => setSettlements(rows<SettlementDoc>(s)), fail),
      // Unpaid orders of every month, for the pay-later notes page (most months are not loaded in full).
      onSnapshot(query(collection(db, "orders"), where("status", "==", "u")), (s) => setUnpaid(rows<OrderDoc>(s)), fail),
    ];
    return () => stops.forEach((stop) => stop());
  }, [member]);

  const monthList = useMemo(
    () => (months ?? []).map((d) => ({ id: d.id, mo: dbw.toMonth(d.data) })).sort((a, b) => a.mo.y - b.mo.y || a.mo.m - b.mo.m),
    [months],
  );

  // Months whose orders are loaded: the month on screen and every month not closed yet. A closed month keeps its totals.
  const loadIds = useMemo(() => {
    const open = monthList.filter((x) => !x.mo.historyOnly && !x.mo.closed).map((x) => x.id);
    const pickable = monthList.filter((x) => !x.mo.historyOnly);
    const shown = pickable.find((x) => x.id === pick.month)?.id ?? pickable[pickable.length - 1]?.id;
    return Array.from(new Set([...open, ...(shown ? [shown] : [])])).sort().slice(-30);
  }, [monthList, pick.month]);
  const loadKey = loadIds.join(",");

  useEffect(() => {
    if (!member || months === null) return;
    const { db } = firebase();
    if (!loadIds.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to listen to: an empty book
      setOrders({ for: "", docs: [], server: true });
      return;
    }
    return onSnapshot(
      query(collection(db, "orders"), where("monthId", "in", loadIds)),
      { includeMetadataChanges: true },
      (s) => setOrders({ for: loadKey, docs: rows<OrderDoc>(s), server: !s.metadata.fromCache }),
      (e) => setError(message(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadKey stands for loadIds
  }, [member, months === null, loadKey]);

  const ready = member && settings !== null && months !== null && weeks !== null && notes !== null && settlements !== null && unpaid !== null && orders !== null;

  // ----- Documents → the state the pages use -----
  const state = useMemo<SaleBookState>(() => {
    const s = emptyState();
    if (settings) {
      s.rate = settings.rate ?? s.rate;
      s.share = settings.share ?? s.share;
      s.marts = settings.marts?.length ? settings.marts : s.marts;
      s.martNames = settings.martNames ?? {};
      s.sellers = settings.sellers ?? [];
    }
    s.months = monthList.map((x) => x.mo);
    s.pick = pick;
    s.loaded = orders?.for ? orders.for.split(",") : [];
    for (const { id, data } of weeks ?? []) {
      if (data.codeFloor) s.codeFloor[id] = data.codeFloor;
      if (data.payout) s.payout[id] = data.payout;
      if (data.adjustments) {
        s.adjustments[id] = Object.fromEntries(
          Object.entries(data.adjustments).map(([mart, list]) => [mart, list.map((a) => [a.no, a.code, a.amount] as [number, string, number])]),
        );
      }
    }
    // Loaded months' orders plus the unpaid ones of other months, each order once.
    const all = new Map<string, OrderDoc>();
    for (const { id, data } of unpaid ?? []) all.set(id, data);
    for (const { id, data } of orders?.docs ?? []) all.set(id, data);
    for (const [id, o] of all) {
      const week = (s.sheets[o.weekKey] ??= {});
      (week[o.mart] ??= []).push(dbw.toOrder(id, o));
    }
    for (const week of Object.values(s.sheets)) for (const list of Object.values(week)) list.sort((a, b) => a.no - b.no);
    const sortedNotes = [...(notes ?? [])].sort((a, b) => a.data.at - b.data.at);
    for (const { id, data } of sortedNotes) (s.notes[data.weekKey] ??= []).push(dbw.toNote(id, data));
    for (const { id, data } of settlements ?? []) {
      s.settlement[id] = { closed: !!data.closed, rows: data.rows ?? {} };
      if (data.deduct) s.monthDeduct[id] = data.deduct;
    }
    return s;
  }, [settings, monthList, pick, orders, weeks, unpaid, notes, settlements]);

  // A closed month's saved totals follow later changes to its orders (only from server data, never a partial cache).
  const lastResave = useRef("");
  useEffect(() => {
    if (!ready || !orders?.server) return;
    const { db } = firebase();
    for (const mo of state.months) {
      if (!mo.closed || mo.historyOnly || !isLoaded(state, mo)) continue;
      const pay = monthPayout(state, mo);
      const was = JSON.stringify(mo.closed.pay);
      const now = JSON.stringify(pay);
      if (was !== now && lastResave.current !== monthId(mo) + now) {
        lastResave.current = monthId(mo) + now;
        run(dbw.resaveClosed(db, monthId(mo), pay));
      }
    }
  }, [ready, orders?.server, state, run]);

  const book = useMemo<SaleBook>(() => {
    const db = (): Firestore => firebase().db;
    const by = access.email;
    return {
      state,
      ready,
      access,
      error,
      clearError: () => setError(""),

      signIn: async () => {
        try {
          await signInWithPopup(firebase().auth, new GoogleAuthProvider());
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setError(message(e));
        }
      },
      signOut: () => fbSignOut(firebase().auth),
      claimShop: async () => {
        try {
          await dbw.claimShop(db(), access.email, access.user?.displayName ?? "");
        } catch (e) {
          setError(message(e));
        }
      },

      setPick: (month, week) => {
        setPickState({ month, week });
        try {
          localStorage.setItem(PICK_KEY, JSON.stringify({ month, week }));
        } catch {
          /* private window: the pick lasts until the page is closed */
        }
      },

      addMonth: async (y, m, first) => {
        const id = monthId({ y, m });
        if (state.months.some((mo) => monthId(mo) === id)) return null;
        run(dbw.addMonth(db(), id, y, m, first));
        return id;
      },
      addWeek: (id, week) => run(dbw.setWeek(db(), id, week)),
      setWeekDates: (id, no, date, end) => run(dbw.setWeek(db(), id, { no, date, end })),
      closeMonth: (id) => {
        const mo = state.months.find((x) => monthId(x) === id);
        if (!mo) return;
        run(dbw.closeMonth(db(), id, monthPayout(state, mo), Math.max(4, mo.weeks.length)));
      },

      addMart: () => {
        const taken = new Set(state.marts.map((x) => (state.martNames[x] || `Mart ${x}`).toLowerCase()));
        let n = Math.max(...state.marts.map(Number)) + 1;
        while (taken.has(`mart ${n}`)) n += 1;
        const id = String(n);
        run(dbw.addMart(db(), id));
        return id;
      },
      renameMart: (id, name) => run(dbw.renameMart(db(), id, name)),
      removeMart: async (id) => {
        if (id === "1" || id === "2") return;
        const keys = Object.entries(state.adjustments)
          .filter(([, marts]) => id in marts)
          .map(([k]) => k);
        try {
          await dbw.removeMart(db(), id, keys);
        } catch (e) {
          setError(message(e));
        }
      },
      martStats: (id) => dbw.martStats(db(), id),
      addSeller: (seller) => run(dbw.addSeller(db(), seller)),
      setRate: (rate) => {
        if (rate > 0) run(dbw.setSettings(db(), { rate }));
      },

      addOrder: (key, mart, order) => {
        const { id, write } = dbw.addOrder(db(), key, mart, order, by);
        run(write);
        return id;
      },
      updateOrder: (id, patch) => run(dbw.updateOrder(db(), id, patch, by)),
      deleteOrder: (id) => run(dbw.deleteOrder(db(), id)),

      addNote: (key, note) => {
        const { id, write } = dbw.addNote(db(), key, note, by);
        run(write);
        return id;
      },
      updateNote: (id, patch) => run(dbw.updateNote(db(), id, patch, by)),

      setPayout: (key, seller, patch) => run(dbw.setPayout(db(), key, seller, patch)),
      setMonthDeduct: (id, seller, value) => run(dbw.setMonthDeduct(db(), id, seller, value)),
      setSettlementRow: (id, seller, row) => run(dbw.setSettlementRow(db(), id, seller, row)),

      loadSample: async () => {
        try {
          const id = await loadSample(db(), by, { sellers: state.sellers, marts: state.marts });
          setPickState({ month: id, week: 3 });
          localStorage.setItem(PICK_KEY, JSON.stringify({ month: id, week: 3 }));
        } catch (e) {
          setError(message(e));
        }
      },
    };
  }, [state, ready, access, error, run]);

  return <Ctx.Provider value={book}>{children}</Ctx.Provider>;
}

// The shop's members, for owners (the account page).
export function useMembers(enabled: boolean) {
  const [list, setList] = useState<{ email: string; data: MemberDoc }[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(collection(firebase().db, "members"), (s) =>
      setList(s.docs.map((d) => ({ email: d.id, data: d.data() as MemberDoc })).sort((a, b) => a.email.localeCompare(b.email))),
    );
  }, [enabled]);
  return list;
}

// True once the book has at least one month that can be picked.
export const bookHasMonths = (s: SaleBookState) => bookMonths(s).length > 0;
// The month and week on screen, for components that only need the ids.
export const pickedIds = (s: SaleBookState) => {
  const { month, week } = picked(s);
  return { month: monthId(month), week: week?.no ?? null };
};
