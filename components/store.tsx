"use client";

// The shared sales book, kept in Firestore. Signs people in with Google, checks they are a member of the shop,
// listens to the documents the pages need, and turns them into one SaleBookState. Every change goes straight to
// Firestore; its local cache shows the change at once (also offline) and sends it when the connection allows.
// Pages use useSaleBook() and never touch Firestore themselves.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where, type Firestore, type QuerySnapshot } from "firebase/firestore";
import * as dbw from "@/lib/db";
import type { HistoryAct, HistoryDoc, Log, MemberDoc, MonthDoc, NoteDoc, OrderDoc, PriceDoc, SettingsDoc, SettlementDoc, WeekDoc } from "@/lib/db";
import { firebase } from "@/lib/firebase";
import { prefixOf } from "@/lib/format";
import {
  KIND,
  findNote,
  findOrder,
  monthOfId,
  noteFields,
  noteTitle,
  orderFields,
  orderTitle,
  pick as pickFields,
  priceFields,
  priceTitle,
  same,
} from "@/lib/history";
import { bookMonths, emptyState, findMonth, isLoaded, martLabel, monthId, monthLabel, monthPayout, picked, weekEnd, weekLabel, weekRange } from "@/lib/periods";
import { loadSample } from "@/lib/sample";
import { ordersOf, trashEntries } from "@/lib/trash";
import { loginError, shownName, usernameEmail, usernameOf } from "@/lib/usernames";
import type { Note, Order, PayoutEntry, PriceItem, SaleBookState, Seller, SettlementRow, TrashRef, Week } from "@/lib/types";

export type Role = MemberDoc["role"];
// locked = signed in, but the database refuses to say who is a member (its security rules are not published yet).
export type AccessStatus = "loading" | "signedOut" | "unclaimed" | "noAccess" | "locked" | "member";
export interface Access {
  status: AccessStatus;
  user: User | null;
  email: string; // lower case
  role: Role | null;
  seller?: string; // a viewer limited to one seller: that seller's code
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
  // A username login (made on the account page, for any role); resolves to an error to show, or "" once signed in.
  signInWithUsername: (username: string, password: string) => Promise<string>;
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

  // ----- «បានលុបថ្មីៗ» (recently deleted) -----
  // Deleting a month, a week or a mart moves it there, with its orders, notes and payouts; restoring brings it all back.
  // Mart 1 and Mart 2 stay; another mart goes with its orders in every week.
  deleteMonth: (monthId: string) => void;
  deleteWeek: (monthId: string, no: number) => void;
  deleteMart: (id: string) => void;
  restore: (ref: TrashRef) => void;
  // Removes it and everything it holds for good (asks the server, so it fails offline and shows why); false = failed.
  purge: (ref: TrashRef) => Promise<boolean>;
  // How many orders it holds, cancelled ones too (asks the server).
  trashOrders: (ref: TrashRef) => Promise<number>;

  // ----- Marts, sellers, rate -----
  // Returns the new mart's id: the next number up (deleted marts' numbers too, so they can come back), skipping one
  // whose "Mart N" is already another mart's name.
  addMart: () => string;
  renameMart: (id: string, name: string) => void;
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

  // ----- «តម្លៃលក់» (sale prices); the list itself comes from usePrices() -----
  // Returns the new item's id at once.
  addPrice: (item: Omit<PriceItem, "id">) => string;
  // was = the item as the page shows it, for its line in the history.
  updatePrice: (was: PriceItem, patch: Partial<Omit<PriceItem, "id">>) => void;
  deletePrice: (item: PriceItem) => void;

  // ----- Payout, monthly summary, month-end -----
  setPayout: (weekKey: string, seller: string, patch: Partial<PayoutEntry>) => void;
  setMonthDeduct: (monthId: string, seller: string, value: string) => void;
  setSettlementRow: (monthId: string, seller: string, row: SettlementRow) => void;

  // ----- People (owners) -----
  addMember: (email: string, role: Role, seller?: string) => Promise<void>; // seller: a viewer limited to one seller
  removeMember: (email: string, role: Role) => Promise<void>;
  // A viewer's seller, changed later: seller "" = every seller; was = the seller before.
  setViewerSeller: (email: string, seller: string, was: string) => Promise<void>;

  // ----- Data -----
  loadSample: () => Promise<void>;
}

// Every change above leaves a line in «ប្រវត្តិកែប្រែ» (useHistory). Changes to the same fields of the same thing, each
// within TYPING_GAP of the one before, make one line: an amount typed key by key, a status clicked round to the one
// wanted. A line keeps moving on for at most TYPING_MAX (firestore.rules allow its author an hour).
const TYPING_GAP = 30_000;
const TYPING_MAX = 10 * 60_000;
type Place = Pick<HistoryDoc, "kind" | "target" | "title" | "monthId" | "weekKey" | "mart">;

const Ctx = createContext<SaleBook | null>(null);

export function useSaleBook() {
  const book = useContext(Ctx);
  if (!book) throw new Error("useSaleBook() must be used inside <SaleBookProvider>");
  return book;
}

// A viewer only looks at the sales sheet: the pages hide everything that changes the book.
export const useReadOnly = () => useSaleBook().access.role === "viewer";
// Where a login limited to some pages lands, and goes when it opens any other page: the sales sheet.
export const SALES_HOME = "/sales";
// A member who signs in with a username (made on the account page) works on the quick calculator and the sales sheet
// only, with every right there; firestore.rules keep them to what those two pages change.
export const salesOnly = (access: Access) => access.role === "member" && usernameOf(access.email) !== null;
// The pages a login may open, or null for every page.
export const pagesOf = (access: Access): string[] | null =>
  access.role === "viewer" ? [SALES_HOME] : salesOnly(access) ? ["/calculator", SALES_HOME] : null;

const PICK_KEY = "salebook.pick";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Docs<T> = { id: string; data: T }[];
const rows = <T,>(snap: QuerySnapshot) => snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));
const NONE: Docs<never> = [];

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
  // The history line being typed into (see TYPING_GAP); before = the fields as they were when the typing began.
  const typing = useRef<{ key: string; id: string; at: number; last: number; before: Record<string, unknown> } | null>(null);

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
            setAccess((was) =>
              was.status === next.status && was.role === next.role && was.seller === next.seller && was.user === next.user ? was : next,
            );
          if (snap.exists()) {
            const d = snap.data() as MemberDoc;
            set({ status: "member", user, email, role: d.role, seller: d.role === "viewer" && d.seller ? d.seller : undefined });
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
  const viewer = access.role === "viewer";
  // A viewer limited to one seller sees that seller's orders only: the book is built without anyone else's.
  const onlySeller = viewer ? (access.seller ?? "") : "";
  // Viewers and sales-only members: only what the sales sheet needs is loaded (the database refuses them the rest).
  const sheetOnly = viewer || salesOnly(access);

  // ----- The book's documents (members only) -----
  useEffect(() => {
    if (!member) return;
    const { db } = firebase();
    const fail = (e: Error) => setError(message(e));
    const stops = [
      onSnapshot(doc(db, "settings", "shop"), (s) => setSettings((s.data() as SettingsDoc | undefined) ?? dbw.DEFAULT_SETTINGS), fail),
      onSnapshot(collection(db, "months"), (s) => setMonths(rows<MonthDoc>(s)), fail),
      onSnapshot(collection(db, "weeks"), (s) => setWeeks(rows<WeekDoc>(s)), fail),
    ];
    // Viewers and sales-only members use the sales sheet only; the database does not let them read notes or
    // month-end settlements.
    if (!sheetOnly) {
      stops.push(
        onSnapshot(collection(db, "notes"), (s) => setNotes(rows<NoteDoc>(s)), fail),
        onSnapshot(collection(db, "settlements"), (s) => setSettlements(rows<SettlementDoc>(s)), fail),
        // Unpaid orders of every month, for the pay-later notes page (most months are not loaded in full).
        onSnapshot(query(collection(db, "orders"), where("status", "==", "u")), (s) => setUnpaid(rows<OrderDoc>(s)), fail),
      );
    }
    return () => stops.forEach((stop) => stop());
  }, [member, sheetOnly]);

  // The months in the book (deleted ones left out), oldest first.
  const monthList = useMemo(
    () =>
      (months ?? [])
        .filter((d) => !d.data.deleted)
        .map((d) => ({ id: d.id, mo: dbw.toMonth(d.data) }))
        .sort((a, b) => a.mo.y - b.mo.y || a.mo.m - b.mo.m),
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

  // What is never loaded for them counts as none.
  const noteDocs = sheetOnly ? NONE : notes;
  const settlementDocs = sheetOnly ? NONE : settlements;
  const unpaidDocs = sheetOnly ? NONE : unpaid;
  const ready =
    member && settings !== null && months !== null && weeks !== null && noteDocs !== null && settlementDocs !== null && unpaidDocs !== null && orders !== null;

  // ----- Documents → the state the pages use -----
  const state = useMemo<SaleBookState>(() => {
    const s = emptyState();
    if (settings) {
      s.rate = settings.rate ?? s.rate;
      s.share = settings.share ?? s.share;
      // In number order, so a restored mart goes back to its place among the tabs.
      s.marts = settings.marts?.length ? [...settings.marts].sort((a, b) => Number(a) - Number(b)) : s.marts;
      s.martNames = settings.martNames ?? {};
      s.sellers = (settings.sellers ?? []).filter((x) => !onlySeller || x.code === onlySeller);
    }
    const shown = (code: string) => !onlySeller || prefixOf(code) === onlySeller;
    s.months = monthList.map((x) => x.mo);
    s.pick = pick;
    s.loaded = orders?.for ? orders.for.split(",") : [];

    // «បានលុបថ្មីៗ»: deleted months, deleted weeks of the months still here, deleted marts; latest first.
    const latest = (a: { deleted: { at: number } }, b: { deleted: { at: number } }) => b.deleted.at - a.deleted.at;
    for (const { data } of months ?? []) {
      const month = dbw.toMonth(data);
      if (data.deleted) s.trash.months.push({ month, deleted: data.deleted });
      else s.trash.weeks.push(...dbw.deletedWeeks(data).map((x) => ({ month, ...x })));
    }
    s.trash.months.sort(latest);
    s.trash.weeks.sort(latest);
    s.trash.marts = Object.entries(settings?.deletedMarts ?? {})
      .map(([id, deleted]) => ({ id, deleted }))
      .sort(latest);
    // What they hold stays out of the book.
    const goneMonths = new Set(s.trash.months.map((t) => monthId(t.month)));
    const goneWeeks = new Set(s.trash.weeks.map((t) => `${monthId(t.month)}-${t.week.no}`));
    const goneMarts = new Set(s.trash.marts.map((t) => t.id));
    const gone = (weekKey: string) => goneWeeks.has(weekKey) || goneMonths.has(dbw.splitWeekKey(weekKey).monthId);

    for (const { id, data } of weeks ?? []) {
      if (gone(id)) continue;
      if (data.codeFloor) s.codeFloor[id] = data.codeFloor;
      if (data.payout && !viewer) s.payout[id] = data.payout;
      if (data.adjustments) {
        s.adjustments[id] = Object.fromEntries(
          Object.entries(data.adjustments)
            .filter(([mart]) => !goneMarts.has(mart))
            .map(([mart, list]) => [mart, list.filter((a) => shown(a.code)).map((a) => [a.no, a.code, a.amount] as [number, string, number])]),
        );
      }
    }
    // Loaded months' orders plus the unpaid ones of other months, each order once.
    const all = new Map<string, OrderDoc>();
    for (const { id, data } of unpaidDocs ?? []) all.set(id, data);
    for (const { id, data } of orders?.docs ?? []) all.set(id, data);
    for (const [id, o] of all) {
      if (gone(o.weekKey) || goneMarts.has(o.mart) || !shown(o.code)) continue;
      const week = (s.sheets[o.weekKey] ??= {});
      (week[o.mart] ??= []).push(dbw.toOrder(id, o));
    }
    for (const week of Object.values(s.sheets)) for (const list of Object.values(week)) list.sort((a, b) => a.no - b.no);
    const sortedNotes = [...(noteDocs ?? [])].filter((n) => !gone(n.data.weekKey)).sort((a, b) => a.data.at - b.data.at);
    for (const { id, data } of sortedNotes) (s.notes[data.weekKey] ??= []).push(dbw.toNote(id, data));
    for (const { id, data } of settlementDocs ?? []) {
      if (goneMonths.has(id)) continue;
      s.settlement[id] = { closed: !!data.closed, rows: data.rows ?? {} };
      if (data.deduct) s.monthDeduct[id] = data.deduct;
    }
    return s;
  }, [settings, months, monthList, pick, orders, weeks, unpaidDocs, noteDocs, settlementDocs, viewer, onlySeller]);

  // A closed month's saved totals follow later changes to its orders (only from server data, never a partial cache).
  const lastResave = useRef("");
  useEffect(() => {
    // Not for a viewer (they cannot save, and may see only some of the orders) nor a sales-only member (they have
    // no notes to work the totals out with, and the database keeps them from the month's saved totals).
    if (!ready || !orders?.server || sheetOnly) return;
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
  }, [ready, orders?.server, state, run, sheetOnly]);

  const book = useMemo<SaleBook>(() => {
    const db = (): Firestore => firebase().db;
    const by = access.email;

    // ----- Lines in the history -----
    // A line of its own; it also ends any typing, so the next keystroke starts a new line.
    const line = (place: Place, act: HistoryAct, data: Pick<HistoryDoc, "before" | "after"> = {}): Log => {
      typing.current = null;
      const at = Date.now();
      return { id: dbw.newId(db(), "history"), continues: false, entry: { ...place, act, at, last: at, by, ...data } };
    };
    // An edit: just the fields that change, as they were and as they become; nothing changes → no line.
    const edit = (place: Place, was: Record<string, unknown>, patch: Record<string, unknown>): Log | undefined => {
      const fields = Object.keys(patch)
        .filter((k) => patch[k] !== undefined && !same(was[k] ?? null, patch[k]))
        .sort();
      if (!fields.length) return undefined;
      const key = [by, place.kind, place.target, ...fields].join("|");
      const at = Date.now();
      const after = pickFields(patch, fields);
      const t = typing.current;
      if (t && t.key === key && at - t.last < TYPING_GAP && at - t.at < TYPING_MAX) {
        t.last = at;
        return { id: t.id, continues: true, entry: { ...place, act: "edit", at: t.at, last: at, by, before: t.before, after } };
      }
      const before = pickFields(was, fields);
      const id = dbw.newId(db(), "history");
      typing.current = { key, id, at, last: at, before };
      return { id, continues: false, entry: { ...place, act: "edit", at, last: at, by, before, after } };
    };
    const monthPlace = (id: string): Place => ({ kind: "month", target: id, title: monthLabel(monthOfId(id)), monthId: id });
    const weekTitle = (w: Week) => `${weekLabel(w)} · ${weekRange(w)}`;
    const weekPlace = (id: string, no: number, title: string): Place => ({ kind: "week", target: `${id}-${no}`, title, monthId: id, weekKey: `${id}-${no}` });
    const bookWeek = (id: string, no: number) => findMonth(state, id)?.weeks.find((w) => w.no === no) ?? null;
    const martPlace = (id: string): Place => ({ kind: "mart", target: id, title: martLabel(state, id), mart: id });
    // A month, week or mart in «បានលុបថ្មីៗ», by the name it has there.
    const trashPlace = (ref: TrashRef): Place => {
      const title = trashEntries(state).find((e) => same(e.ref, ref))?.title;
      const named = (p: Place) => (title ? { ...p, title } : p);
      if (ref.kind === "month") return named(monthPlace(ref.month));
      if (ref.kind === "week") return weekPlace(ref.month, ref.no, title ?? weekLabel({ no: ref.no }));
      return named(martPlace(ref.id));
    };
    const orderPlace = (id: string, f: ReturnType<typeof findOrder>): Place => ({
      kind: "order",
      target: id,
      title: f ? orderTitle(f.order) : "",
      monthId: f?.monthId,
      weekKey: f?.weekKey,
      mart: f?.mart,
    });

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
      signInWithUsername: async (username, password) => {
        try {
          await signInWithEmailAndPassword(firebase().auth, usernameEmail(username), password);
          return "";
        } catch (e) {
          return loginError(e);
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
        // A deleted month keeps its id (and its orders) until it is deleted for good.
        if ([...state.months, ...state.trash.months.map((t) => t.month)].some((mo) => monthId(mo) === id)) return null;
        run(dbw.addMonth(db(), id, y, m, first, line(monthPlace(id), "add", { after: { date: first.date, end: weekEnd(first) } })));
        return id;
      },
      addWeek: (id, week) =>
        run(dbw.setWeek(db(), id, week, line(weekPlace(id, week.no, weekTitle(week)), "add", { after: { date: week.date, end: weekEnd(week) } }))),
      setWeekDates: (id, no, date, end) => {
        const w = bookWeek(id, no);
        const log = edit(weekPlace(id, no, w ? weekTitle(w) : weekLabel({ no })), w ? { date: w.date, end: weekEnd(w) } : {}, {
          date,
          end: weekEnd({ no, date, end }),
        });
        run(dbw.setWeek(db(), id, { no, date, end }, log));
      },
      closeMonth: (id) => {
        const mo = state.months.find((x) => monthId(x) === id);
        if (!mo) return;
        run(dbw.closeMonth(db(), id, monthPayout(state, mo), Math.max(4, mo.weeks.length), line(monthPlace(id), "close")));
      },

      // ----- «បានលុបថ្មីៗ» -----
      deleteMonth: (id) => run(dbw.deleteMonth(db(), id, { at: Date.now(), by }, line(monthPlace(id), "delete"))),
      deleteWeek: (id, no) => {
        const w = bookWeek(id, no);
        run(dbw.deleteWeek(db(), id, no, { at: Date.now(), by }, line(weekPlace(id, no, w ? weekTitle(w) : weekLabel({ no })), "delete")));
      },
      deleteMart: (id) => {
        if (id === "1" || id === "2") return;
        run(dbw.deleteMart(db(), id, { at: Date.now(), by }, line(martPlace(id), "delete")));
      },
      restore: (ref) => {
        const log = line(trashPlace(ref), "restore");
        if (ref.kind === "month") run(dbw.restoreMonth(db(), ref.month, log));
        else if (ref.kind === "week") run(dbw.restoreWeek(db(), ref.month, ref.no, log));
        else run(dbw.restoreMart(db(), ref.id, log));
      },
      purge: async (ref) => {
        // Saved with the last step, once everything it held is gone.
        const log = line(trashPlace(ref), "purge");
        try {
          if (ref.kind === "month") await dbw.purgeMonth(db(), ref.month, log);
          else if (ref.kind === "week") await dbw.purgeWeek(db(), ref.month, ref.no, log);
          else {
            // Week sheets with adjustments on the mart's sheet (the book leaves those out, so they are read from the documents).
            const keys = (weeks ?? []).filter((w) => w.data.adjustments && ref.id in w.data.adjustments).map((w) => w.id);
            await dbw.purgeMart(db(), ref.id, keys, log);
          }
          return true;
        } catch (e) {
          setError(message(e));
          return false;
        }
      },
      trashOrders: (ref) => dbw.countOrders(db(), ...ordersOf(ref)),

      addMart: () => {
        const label = (x: string) => (state.martNames[x] || `Mart ${x}`).toLowerCase();
        const deleted = state.trash.marts.map((t) => t.id);
        const taken = new Set([...state.marts, ...deleted].map(label));
        let n = Math.max(...[...state.marts, ...deleted].map(Number)) + 1;
        while (taken.has(`mart ${n}`)) n += 1;
        const id = String(n);
        run(dbw.addMart(db(), id, line({ kind: "mart", target: id, title: `Mart ${id}`, mart: id }, "add")));
        return id;
      },
      renameMart: (id, name) => run(dbw.renameMart(db(), id, name, edit(martPlace(id), { name: state.martNames[id] ?? "" }, { name: name.trim() }))),
      martStats: (id) => dbw.martStats(db(), id),
      addSeller: (seller) =>
        run(dbw.addSeller(db(), seller, line({ kind: "seller", target: seller.code, title: seller.name }, "add", { after: { name: seller.name, code: seller.code } }))),
      setRate: (rate) => {
        if (rate > 0) run(dbw.setSettings(db(), { rate }, edit({ kind: "rate", target: "rate", title: KIND.rate }, { rate: state.rate }, { rate })));
      },

      addOrder: (key, mart, order) => {
        const id = dbw.newId(db(), "orders");
        const place: Place = { kind: "order", target: id, title: orderTitle(order), monthId: dbw.splitWeekKey(key).monthId, weekKey: key, mart };
        run(dbw.addOrder(db(), id, key, mart, order, by, line(place, "add", { after: orderFields(order) })));
        return id;
      },
      updateOrder: (id, patch) => {
        const f = findOrder(state, id);
        run(dbw.updateOrder(db(), id, patch, by, edit(orderPlace(id, f), f ? { ...f.order } : {}, patch)));
      },
      deleteOrder: (id) => {
        const f = findOrder(state, id);
        run(dbw.deleteOrder(db(), id, line(orderPlace(id, f), "delete", f ? { before: orderFields(f.order) } : {})));
      },

      addNote: (key, note) => {
        const id = dbw.newId(db(), "notes");
        const place: Place = { kind: "note", target: id, title: noteTitle(note), monthId: dbw.splitWeekKey(key).monthId, weekKey: key };
        run(dbw.addNote(db(), id, key, note, by, line(place, "add", { after: noteFields(note) })));
        return id;
      },
      updateNote: (id, patch) => {
        const f = findNote(state, id);
        const place: Place = { kind: "note", target: id, title: f ? noteTitle(f.note) : "", monthId: f?.monthId, weekKey: f?.weekKey };
        run(dbw.updateNote(db(), id, patch, by, edit(place, f ? { ...f.note } : {}, patch)));
      },

      addPrice: (item) => {
        const id = dbw.newId(db(), "prices");
        run(dbw.addPrice(db(), id, item, by, line({ kind: "price", target: id, title: priceTitle(item) }, "add", { after: priceFields(item) })));
        return id;
      },
      updatePrice: (was, patch) =>
        run(dbw.updatePrice(db(), was.id, patch, by, edit({ kind: "price", target: was.id, title: priceTitle(was) }, { ...was }, patch))),
      deletePrice: (item) =>
        run(dbw.deletePrice(db(), item.id, line({ kind: "price", target: item.id, title: priceTitle(item) }, "delete", { before: priceFields(item) }))),

      setPayout: (key, seller, patch) => {
        // A seller's entry is saved a field at a time, so any field may still be missing.
        const saved: Partial<PayoutEntry> | undefined = state.payout[key]?.[seller];
        const was: Record<string, unknown> = { deduct: 0, add: 0, paid: false, ...saved };
        const place: Place = { kind: "payout", target: `${key}|${seller}`, title: seller, monthId: dbw.splitWeekKey(key).monthId, weekKey: key };
        run(dbw.setPayout(db(), key, seller, patch, edit(place, was, patch)));
      },
      setMonthDeduct: (id, seller, value) => {
        const place: Place = { kind: "deduct", target: `${id}|${seller}`, title: seller, monthId: id };
        run(dbw.setMonthDeduct(db(), id, seller, value, edit(place, { value: state.monthDeduct[id]?.[seller] ?? "" }, { value })));
      },
      setSettlementRow: (id, seller, row) => {
        const saved: Partial<SettlementRow> | undefined = state.settlement[id]?.rows[seller];
        const was: Record<string, unknown> = { advance: "", debt: "", note: "", ...saved };
        const place: Place = { kind: "settlement", target: `${id}|${seller}`, title: seller, monthId: id };
        run(dbw.setSettlementRow(db(), id, seller, row, edit(place, was, { ...row })));
      },

      addMember: (email, role, seller) =>
        dbw.setMember(db(), email, role, by, line({ kind: "member", target: email, title: shownName(email) }, "add", { after: seller ? { role, seller } : { role } }), seller),
      setViewerSeller: (email, seller, was) =>
        dbw.setMemberSeller(
          db(),
          email,
          seller,
          line({ kind: "member", target: email, title: shownName(email) }, "edit", { before: { seller: was }, after: { seller } }),
        ),
      removeMember: (email, role) => dbw.removeMember(db(), email, line({ kind: "member", target: email, title: shownName(email) }, "delete", { before: { role } })),

      loadSample: async () => {
        try {
          const id = await loadSample(db(), by, { sellers: state.sellers, marts: state.marts });
          run(dbw.addLog(db(), line({ kind: "sample", target: "sample", title: KIND.sample, monthId: id }, "add")));
          setPickState({ month: id, week: 3 });
          localStorage.setItem(PICK_KEY, JSON.stringify({ month: id, week: 3 }));
        } catch (e) {
          setError(message(e));
        }
      },
    };
  }, [state, weeks, ready, access, error, run]);

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

// «តម្លៃលក់», by name, for owners and members (firestore.rules keep cost prices from viewers, as the sales sheet does).
// Listened to only while the page is open; error = why the database refused it.
export function usePrices(enabled: boolean) {
  const [list, setList] = useState<PriceItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(firebase().db, "prices"),
      (s) => {
        const items = s.docs.map((d) => dbw.toPrice(d.id, d.data() as PriceDoc));
        setList(items.sort((a, b) => a.name.localeCompare(b.name, "km") || a.unit.localeCompare(b.unit, "km")));
        setError("");
      },
      (e) => setError(message(e)),
    );
  }, [enabled]);
  return { list, error };
}

// «ប្រវត្តិកែប្រែ», newest first, for owners and members (viewers cannot read it): the latest HISTORY_PAGE lines, and
// HISTORY_PAGE more each time older ones are asked for.
const HISTORY_PAGE = 100;
export function useHistory(enabled: boolean) {
  const [size, setSize] = useState(HISTORY_PAGE);
  const [got, setGot] = useState<{ size: number; list: Docs<HistoryDoc> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(firebase().db, "history"), orderBy("at", "desc"), limit(size)),
      (s) => {
        setGot({ size, list: rows<HistoryDoc>(s) });
        setError("");
      },
      (e) => setError(message(e)),
    );
  }, [enabled, size]);
  return {
    list: got?.list ?? null,
    // There may be older lines: the last answer was full.
    more: !!got && got.list.length >= got.size,
    loadingMore: !!got && got.size !== size,
    loadMore: () => setSize((n) => n + HISTORY_PAGE),
    error,
  };
}

// True once the book has at least one month that can be picked.
export const bookHasMonths = (s: SaleBookState) => bookMonths(s).length > 0;
// The month and week on screen, for components that only need the ids.
export const pickedIds = (s: SaleBookState) => {
  const { month, week } = picked(s);
  return { month: monthId(month), week: week?.no ?? null };
};
