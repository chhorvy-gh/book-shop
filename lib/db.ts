// The book in Firestore: what each document holds, how documents become the state the pages use, and every write.
//
//   settings/shop          rate, share, marts, martNames, sellers
//   months/{monthId}       y, m, weeks {no: {date, end}}, extraPay, closed, historyOnly, sample
//   weeks/{weekKey}        monthId, no, codeFloor, adjustments {mart: [{no, code, amount}]}, payout {seller: entry}
//   orders/{id}            weekKey, monthId, mart, no, code, cost, sale, status, items, at, by
//   notes/{id}             weekKey, monthId, no, code, due, amount, note, collected, flagged, at, by
//   settlements/{monthId}  closed, rows {seller: {advance, debt, note}}, deduct {seller: amount}
//   members/{email}        role ("owner" | "member"), name, addedBy, at
//   meta/bootstrap         owner: the email that claimed the shop
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
  type Firestore,
} from "firebase/firestore";
import type { Item, Month, Note, Order, PayoutEntry, SettlementRow, Status, Week, WeekPay } from "./types";

// ---------- Document shapes ----------

export interface SettingsDoc {
  rate: number;
  share: number;
  marts: string[];
  martNames: Record<string, string>;
  sellers: { name: string; code: string }[];
}
export interface MonthDoc {
  y: number;
  m: number;
  weeks?: Record<string, { date: string; end?: string }>;
  extraPay?: WeekPay;
  closed?: { pay: WeekPay; weeks: number; at: number };
  historyOnly?: boolean;
  sample?: boolean;
}
export interface WeekDoc {
  monthId: string;
  no: number;
  codeFloor?: Record<string, number>;
  adjustments?: Record<string, { no: number; code: string; amount: number }[]>;
  payout?: Record<string, PayoutEntry>;
}
export interface OrderDoc {
  weekKey: string;
  monthId: string;
  mart: string;
  no: number;
  code: string;
  cost: number;
  sale: number;
  status: Status;
  items: Item[];
  at: number; // when it was added (ms), for a steady order
  by?: string;
}
export interface NoteDoc {
  weekKey: string;
  monthId: string;
  no: number | "—";
  code: string;
  due: string;
  amount: number;
  note: string;
  collected: boolean;
  flagged: boolean;
  at: number;
  by?: string;
}
export interface SettlementDoc {
  closed?: boolean;
  rows?: Record<string, SettlementRow>;
  deduct?: Record<string, string>;
}
export interface MemberDoc {
  role: "owner" | "member";
  name?: string;
  addedBy?: string;
  at?: number;
}

export const DEFAULT_SETTINGS: SettingsDoc = { rate: 0.00068, share: 25, marts: ["1", "2"], martNames: {}, sellers: [] };

// "2026-10-3" → { monthId: "2026-10", no: 3 }
export const splitWeekKey = (key: string) => {
  const i = key.lastIndexOf("-");
  return { monthId: key.slice(0, i), no: Number(key.slice(i + 1)) };
};

export function toMonth(d: MonthDoc): Month {
  const weeks: Week[] = Object.entries(d.weeks ?? {})
    .map(([no, w]) => ({ no: Number(no), date: w.date, ...(w.end ? { end: w.end } : {}) }))
    .sort((a, b) => a.no - b.no);
  return { y: d.y, m: d.m, weeks, extraPay: d.extraPay, closed: d.closed, historyOnly: d.historyOnly, sample: d.sample };
}
export const toOrder = (id: string, d: OrderDoc): Order => ({
  id,
  no: d.no,
  code: d.code,
  cost: d.cost,
  sale: d.sale,
  status: d.status,
  items: d.items ?? [],
});
export const toNote = (id: string, d: NoteDoc): Note => ({
  id,
  no: d.no,
  code: d.code,
  due: d.due,
  amount: d.amount,
  note: d.note,
  collected: d.collected,
  flagged: d.flagged,
});

// ---------- Writes ----------

const now = () => Date.now();

// The first person to sign in to an empty shop claims it.
export async function claimShop(db: Firestore, email: string, name: string) {
  const b = writeBatch(db);
  b.set(doc(db, "members", email), { role: "owner", name, addedBy: email, at: now() } satisfies MemberDoc);
  b.set(doc(db, "meta", "bootstrap"), { owner: email, at: now() });
  await b.commit();
  await setDoc(doc(db, "settings", "shop"), DEFAULT_SETTINGS, { merge: true });
}

export const setSettings = (db: Firestore, patch: Partial<SettingsDoc>) => setDoc(doc(db, "settings", "shop"), patch, { merge: true });
export const addSeller = (db: Firestore, seller: { name: string; code: string }) =>
  updateDoc(doc(db, "settings", "shop"), { sellers: arrayUnion({ name: seller.name, code: seller.code }) });
export const addMart = (db: Firestore, id: string) => updateDoc(doc(db, "settings", "shop"), { marts: arrayUnion(id) });
export const renameMart = (db: Firestore, id: string, name: string) =>
  setDoc(doc(db, "settings", "shop"), { martNames: { [id]: name.trim() ? name.trim() : deleteField() } }, { merge: true });

// A mart goes with its orders in every week (in batches, as a batch holds at most 500 writes).
export async function removeMart(db: Firestore, id: string, weekKeysWithAdjustments: string[]) {
  const snap = await getDocs(query(collection(db, "orders"), where("mart", "==", id)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const b = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  for (const key of weekKeysWithAdjustments) {
    await setDoc(doc(db, "weeks", key), { adjustments: { [id]: deleteField() } }, { merge: true });
  }
  await setDoc(doc(db, "settings", "shop"), { marts: arrayRemove(id), martNames: { [id]: deleteField() } }, { merge: true });
}

// A mart's orders over every week: how many (cancelled ones too), in how many weeks, and their sale (cancelled left out).
export async function martStats(db: Firestore, id: string) {
  const snap = await getDocs(query(collection(db, "orders"), where("mart", "==", id)));
  const weeks = new Set<string>();
  let sale = 0;
  snap.docs.forEach((d) => {
    const o = d.data() as OrderDoc;
    weeks.add(o.weekKey);
    if (o.status !== "x") sale += o.sale;
  });
  return { orders: snap.size, weeks: weeks.size, sale };
}

export const addMonth = (db: Firestore, id: string, y: number, m: number, first: Week) =>
  setDoc(doc(db, "months", id), { y, m, weeks: { [first.no]: { date: first.date, ...(first.end ? { end: first.end } : {}) } } } satisfies MonthDoc);
// A new week, or new dates for a week.
export const setWeek = (db: Firestore, monthId: string, w: Week) =>
  setDoc(doc(db, "months", monthId), { weeks: { [w.no]: { date: w.date, ...(w.end ? { end: w.end } : {}) } } }, { merge: true });
export const closeMonth = async (db: Firestore, monthId: string, pay: WeekPay, weeks: number) => {
  const b = writeBatch(db);
  b.set(doc(db, "months", monthId), { closed: { pay, weeks, at: now() } }, { merge: true });
  b.set(doc(db, "settlements", monthId), { closed: true }, { merge: true });
  await b.commit();
};
// Keeps a closed month's saved totals in step when its orders change after closing.
export const resaveClosed = (db: Firestore, monthId: string, pay: WeekPay) =>
  setDoc(doc(db, "months", monthId), { closed: { pay } }, { merge: true });

// The new order's id is known at once, so the page can mark it; write settles when the server has it (or refuses it).
export function addOrder(db: Firestore, weekKey: string, mart: string, o: Omit<Order, "id">, by: string) {
  const ref = doc(collection(db, "orders"));
  const data: OrderDoc = { ...o, weekKey, monthId: splitWeekKey(weekKey).monthId, mart, at: now(), by };
  return { id: ref.id, write: setDoc(ref, data) };
}
export const updateOrder = (db: Firestore, id: string, patch: Partial<Omit<Order, "id">>, by: string) =>
  updateDoc(doc(db, "orders", id), { ...patch, by });
export const deleteOrder = (db: Firestore, id: string) => deleteDoc(doc(db, "orders", id));

export function addNote(db: Firestore, weekKey: string, n: Omit<Note, "id">, by: string) {
  const ref = doc(collection(db, "notes"));
  const data: NoteDoc = { ...n, weekKey, monthId: splitWeekKey(weekKey).monthId, at: now(), by };
  return { id: ref.id, write: setDoc(ref, data) };
}
export const updateNote = (db: Firestore, id: string, patch: Partial<Omit<Note, "id">>, by: string) =>
  updateDoc(doc(db, "notes", id), { ...patch, by });

export const setPayout = (db: Firestore, weekKey: string, seller: string, patch: Partial<PayoutEntry>) =>
  setDoc(doc(db, "weeks", weekKey), { ...splitWeekKey(weekKey), payout: { [seller]: patch } }, { merge: true });

export const setSettlementRow = (db: Firestore, monthId: string, seller: string, row: SettlementRow) =>
  setDoc(doc(db, "settlements", monthId), { rows: { [seller]: row } }, { merge: true });
export const setMonthDeduct = (db: Firestore, monthId: string, seller: string, value: string) =>
  setDoc(doc(db, "settlements", monthId), { deduct: { [seller]: value } }, { merge: true });

export const setMember = (db: Firestore, email: string, role: MemberDoc["role"], by: string) =>
  setDoc(doc(db, "members", email.trim().toLowerCase()), { role, addedBy: by, at: now() }, { merge: true });
export const removeMember = (db: Firestore, email: string) => deleteDoc(doc(db, "members", email));

// Writes many documents in small batches. The security rules look up the writer's membership once per write,
// and a batch may make only 20 such lookups, so 10 writes per batch stays well inside that. Every batch is queued at
// once, in order: Firestore keeps queued writes on the device, so leaving or reloading the page does not lose them.
export async function writeMany(db: Firestore, writes: { path: [string, string]; data: object; merge?: boolean }[]) {
  const commits: Promise<void>[] = [];
  for (let i = 0; i < writes.length; i += 10) {
    const b = writeBatch(db);
    writes.slice(i, i + 10).forEach((w) => b.set(doc(db, w.path[0], w.path[1]), w.data, { merge: !!w.merge }));
    commits.push(b.commit());
  }
  await Promise.all(commits);
}
