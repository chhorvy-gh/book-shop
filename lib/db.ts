// The book in Firestore: what each document holds, how documents become the state the pages use, and every write.
//
//   settings/shop          rate, share, marts, martNames, sellers, deletedMarts {id: {at, by}}
//   months/{monthId}       y, m, weeks {no: {date, end, deleted}}, extraPay, closed, historyOnly, sample, deleted {at, by}
//   weeks/{weekKey}        monthId, no, codeFloor, adjustments {mart: [{no, code, amount}]}, payout {seller: entry}
//   orders/{id}            weekKey, monthId, mart, no, code, cost, sale, status, items, at, by
//   notes/{id}             weekKey, monthId, no, code, due, amount, note, collected, flagged, at, by
//   settlements/{monthId}  closed, rows {seller: {advance, debt, note}}, deduct {seller: amount}
//   members/{email}        role ("owner" | "member" | "viewer"), name, addedBy, at
//   meta/bootstrap         owner: the email that claimed the shop
//   history/{id}           at, saved, by, act, kind, target, title, monthId, weekKey, mart, before, after, last
//
// A deleted month, week or mart only gets `deleted`: its orders, notes and payouts stay where they are, and the store
// leaves them out of the book. Restoring takes `deleted` off; deleting for good removes the documents.
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from "firebase/firestore";
import type { Deleted, Item, Month, Note, Order, PayoutEntry, SettlementRow, Status, Week, WeekPay } from "./types";

// ---------- Document shapes ----------

export interface SettingsDoc {
  rate: number;
  share: number;
  marts: string[];
  martNames: Record<string, string>;
  sellers: { name: string; code: string }[];
  deletedMarts?: Record<string, Deleted>; // marts in «បានលុបថ្មីៗ», no longer in marts
}
export interface MonthDoc {
  y: number;
  m: number;
  weeks?: Record<string, { date: string; end?: string; deleted?: Deleted }>;
  extraPay?: WeekPay;
  closed?: { pay: WeekPay; weeks: number; at: number };
  historyOnly?: boolean;
  sample?: boolean;
  deleted?: Deleted;
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
  // viewer: sees the sales sheet only, and changes nothing (firestore.rules refuses its writes).
  role: "owner" | "member" | "viewer";
  // A viewer limited to one seller: that seller's code ("ហេង"), whose orders are all they see. None = every seller.
  seller?: string;
  name?: string;
  addedBy?: string;
  at?: number;
}

// ---------- History (ប្រវត្តិកែប្រែ) ----------
// Each change made in the app leaves one line: who, when, and the fields as they were and as they became. The line is
// saved in the same batch as the change, so one never lands without the other. Nobody can change or remove a line
// afterwards (firestore.rules); only typing on in the same box moves that person's own line on for a while (`last`).
export type HistoryAct = "add" | "edit" | "delete" | "restore" | "purge" | "close";
export type HistoryKind =
  | "order"
  | "note"
  | "month"
  | "week"
  | "mart"
  | "seller"
  | "rate"
  | "payout"
  | "deduct"
  | "settlement"
  | "member"
  | "sample";
export interface HistoryDoc {
  at: number; // when it was done (ms, the device's clock: a change made offline keeps its own time)
  saved: Timestamp; // when the server took it in; the rules check it, and limit how long the line can move on
  by: string; // email
  act: HistoryAct;
  kind: HistoryKind;
  target: string; // order or note id, month id, week key, mart id, seller code, email; "weekKey|seller", "monthId|seller"
  title: string; // what it was called then: "#12 · ហេង3", "ខែតុលា 2026", a seller's name …
  monthId?: string;
  weekKey?: string;
  mart?: string;
  before?: Record<string, unknown>; // the changed fields as they were; everything, for a delete
  after?: Record<string, unknown>; // the changed fields as they became; everything, for an add
  last?: number; // when it last changed: typing on in the same box keeps one line
}
// A line to save with a change. continues: this person's line for the same box, being typed in; only after and last move.
export interface Log {
  id: string;
  continues: boolean;
  entry: Omit<HistoryDoc, "saved">;
}

export const DEFAULT_SETTINGS: SettingsDoc = { rate: 0.00068, share: 25, marts: ["1", "2"], martNames: {}, sellers: [] };

// "2026-10-3" → { monthId: "2026-10", no: 3 }
export const splitWeekKey = (key: string) => {
  const i = key.lastIndexOf("-");
  return { monthId: key.slice(0, i), no: Number(key.slice(i + 1)) };
};

const toWeek = (no: string, w: { date: string; end?: string }): Week => ({ no: Number(no), date: w.date, ...(w.end ? { end: w.end } : {}) });

// The month with its weeks, deleted weeks left out.
export function toMonth(d: MonthDoc): Month {
  const weeks: Week[] = Object.entries(d.weeks ?? {})
    .filter(([, w]) => !w.deleted)
    .map(([no, w]) => toWeek(no, w))
    .sort((a, b) => a.no - b.no);
  return { y: d.y, m: d.m, weeks, extraPay: d.extraPay, closed: d.closed, historyOnly: d.historyOnly, sample: d.sample };
}
// The month's weeks that are in «បានលុបថ្មីៗ».
export const deletedWeeks = (d: MonthDoc) =>
  Object.entries(d.weeks ?? {}).flatMap(([no, w]) => (w.deleted ? [{ week: toWeek(no, w), deleted: w.deleted }] : []));
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

// A new document id, known before anything is written.
export const newId = (db: Firestore, coll: "orders" | "notes" | "history") => doc(collection(db, coll)).id;

// Saves a change in one batch, with its line in the history when there is one: both land, or neither does.
function save(db: Firestore, log: Log | undefined, write: (b: WriteBatch) => void) {
  const b = writeBatch(db);
  write(b);
  if (log) {
    const ref = doc(db, "history", log.id);
    if (log.continues) b.update(ref, { after: log.entry.after ?? {}, last: log.entry.last ?? log.entry.at });
    else b.set(ref, { ...log.entry, saved: serverTimestamp() });
  }
  return b.commit();
}
// A line in the history on its own, for a change saved some other way (the sample data).
export const addLog = (db: Firestore, log: Log) => save(db, log, () => {});

// The first person to sign in to an empty shop claims it.
export async function claimShop(db: Firestore, email: string, name: string) {
  const b = writeBatch(db);
  b.set(doc(db, "members", email), { role: "owner", name, addedBy: email, at: now() } satisfies MemberDoc);
  b.set(doc(db, "meta", "bootstrap"), { owner: email, at: now() });
  await b.commit();
  // Settings start at the defaults only in a shop that has none yet; a shop that already holds data keeps its sellers.
  const settings = doc(db, "settings", "shop");
  if (!(await getDoc(settings)).exists()) await setDoc(settings, DEFAULT_SETTINGS);
}

const shop = (db: Firestore) => doc(db, "settings", "shop");

export const setSettings = (db: Firestore, patch: Partial<SettingsDoc>, log?: Log) =>
  save(db, log, (b) => b.set(shop(db), patch, { merge: true }));
export const addSeller = (db: Firestore, seller: { name: string; code: string }, log?: Log) =>
  save(db, log, (b) => b.update(shop(db), { sellers: arrayUnion({ name: seller.name, code: seller.code }) }));
export const addMart = (db: Firestore, id: string, log?: Log) => save(db, log, (b) => b.update(shop(db), { marts: arrayUnion(id) }));
export const renameMart = (db: Firestore, id: string, name: string, log?: Log) =>
  save(db, log, (b) => b.set(shop(db), { martNames: { [id]: name.trim() ? name.trim() : deleteField() } }, { merge: true }));

// ---------- «បានលុបថ្មីៗ» (recently deleted) ----------
// Deleting moves a month, week or mart there: only a `deleted` mark is written, so restoring brings everything back.

export const deleteMonth = (db: Firestore, id: string, deleted: Deleted, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "months", id), { deleted }, { merge: true }));
export const restoreMonth = (db: Firestore, id: string, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "months", id), { deleted: deleteField() }, { merge: true }));
export const deleteWeek = (db: Firestore, monthId: string, no: number, deleted: Deleted, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "months", monthId), { weeks: { [no]: { deleted } } }, { merge: true }));
export const restoreWeek = (db: Firestore, monthId: string, no: number, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "months", monthId), { weeks: { [no]: { deleted: deleteField() } } }, { merge: true }));
// A deleted mart leaves the list of marts; its name stays, for the recently deleted page and for restoring.
export const deleteMart = (db: Firestore, id: string, deleted: Deleted, log?: Log) =>
  save(db, log, (b) => b.set(shop(db), { marts: arrayRemove(id), deletedMarts: { [id]: deleted } }, { merge: true }));
export const restoreMart = (db: Firestore, id: string, log?: Log) =>
  save(db, log, (b) => b.set(shop(db), { marts: arrayUnion(id), deletedMarts: { [id]: deleteField() } }, { merge: true }));

// How many orders a month, week or mart has (cancelled ones too), counted on the server.
export const countOrders = async (db: Firestore, field: "monthId" | "weekKey" | "mart", value: string) =>
  (await getCountFromServer(query(collection(db, "orders"), where(field, "==", value)))).data().count;

// Deleting for good. The documents are found on the server (never from what this device has cached, which could miss
// some), removed ten to a batch like writeMany, and the month, week or mart itself goes last: if something fails on
// the way, it is still in the recently deleted list to try again.
const refsWhere = async (db: Firestore, coll: "orders" | "notes", field: string, value: string) =>
  (await getDocsFromServer(query(collection(db, coll), where(field, "==", value)))).docs.map((d) => d.ref);
async function deleteMany(db: Firestore, refs: DocumentReference[]) {
  const commits: Promise<void>[] = [];
  for (let i = 0; i < refs.length; i += 10) {
    const b = writeBatch(db);
    refs.slice(i, i + 10).forEach((r) => b.delete(r));
    commits.push(b.commit());
  }
  await Promise.all(commits);
}

// A month: its orders, notes, week sheets (payouts, adjustments), month-end sheet, then the month (with its history line).
export async function purgeMonth(db: Firestore, id: string, log?: Log) {
  const [orders, notes] = await Promise.all([refsWhere(db, "orders", "monthId", id), refsWhere(db, "notes", "monthId", id)]);
  const weeks = [1, 2, 3, 4, 5].map((no) => doc(db, "weeks", `${id}-${no}`));
  await deleteMany(db, [...orders, ...notes, ...weeks, doc(db, "settlements", id)]);
  await save(db, log, (b) => b.delete(doc(db, "months", id)));
}
// A week: its orders, notes and week sheet, then the week in its month.
export async function purgeWeek(db: Firestore, monthId: string, no: number, log?: Log) {
  const key = `${monthId}-${no}`;
  const [orders, notes] = await Promise.all([refsWhere(db, "orders", "weekKey", key), refsWhere(db, "notes", "weekKey", key)]);
  await deleteMany(db, [...orders, ...notes, doc(db, "weeks", key)]);
  await save(db, log, (b) => b.set(doc(db, "months", monthId), { weeks: { [no]: deleteField() } }, { merge: true }));
}
// A mart: its orders in every week and its adjustments on the week sheets that have some, then the mart and its name.
export async function purgeMart(db: Firestore, id: string, weekKeysWithAdjustments: string[], log?: Log) {
  await deleteMany(db, await refsWhere(db, "orders", "mart", id));
  await writeMany(
    db,
    weekKeysWithAdjustments.map((key) => ({ path: ["weeks", key] as [string, string], data: { adjustments: { [id]: deleteField() } }, merge: true })),
  );
  await save(db, log, (b) => b.set(shop(db), { deletedMarts: { [id]: deleteField() }, martNames: { [id]: deleteField() } }, { merge: true }));
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

export const addMonth = (db: Firestore, id: string, y: number, m: number, first: Week, log?: Log) =>
  save(db, log, (b) =>
    b.set(doc(db, "months", id), { y, m, weeks: { [first.no]: { date: first.date, ...(first.end ? { end: first.end } : {}) } } } satisfies MonthDoc),
  );
// A new week, or new dates for a week.
export const setWeek = (db: Firestore, monthId: string, w: Week, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "months", monthId), { weeks: { [w.no]: { date: w.date, ...(w.end ? { end: w.end } : {}) } } }, { merge: true }));
export const closeMonth = (db: Firestore, monthId: string, pay: WeekPay, weeks: number, log?: Log) =>
  save(db, log, (b) => {
    b.set(doc(db, "months", monthId), { closed: { pay, weeks, at: now() } }, { merge: true });
    b.set(doc(db, "settlements", monthId), { closed: true }, { merge: true });
  });
// Keeps a closed month's saved totals in step when its orders change after closing.
export const resaveClosed = (db: Firestore, monthId: string, pay: WeekPay) =>
  setDoc(doc(db, "months", monthId), { closed: { pay } }, { merge: true });

// The new order's id comes from newId(), so the page can mark it at once; the write settles when the server has it.
export function addOrder(db: Firestore, id: string, weekKey: string, mart: string, o: Omit<Order, "id">, by: string, log?: Log) {
  const data: OrderDoc = { ...o, weekKey, monthId: splitWeekKey(weekKey).monthId, mart, at: now(), by };
  return save(db, log, (b) => b.set(doc(db, "orders", id), data));
}
export const updateOrder = (db: Firestore, id: string, patch: Partial<Omit<Order, "id">>, by: string, log?: Log) =>
  save(db, log, (b) => b.update(doc(db, "orders", id), { ...patch, by }));
export const deleteOrder = (db: Firestore, id: string, log?: Log) => save(db, log, (b) => b.delete(doc(db, "orders", id)));

export function addNote(db: Firestore, id: string, weekKey: string, n: Omit<Note, "id">, by: string, log?: Log) {
  const data: NoteDoc = { ...n, weekKey, monthId: splitWeekKey(weekKey).monthId, at: now(), by };
  return save(db, log, (b) => b.set(doc(db, "notes", id), data));
}
export const updateNote = (db: Firestore, id: string, patch: Partial<Omit<Note, "id">>, by: string, log?: Log) =>
  save(db, log, (b) => b.update(doc(db, "notes", id), { ...patch, by }));

export const setPayout = (db: Firestore, weekKey: string, seller: string, patch: Partial<PayoutEntry>, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "weeks", weekKey), { ...splitWeekKey(weekKey), payout: { [seller]: patch } }, { merge: true }));

export const setSettlementRow = (db: Firestore, monthId: string, seller: string, row: SettlementRow, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "settlements", monthId), { rows: { [seller]: row } }, { merge: true }));
export const setMonthDeduct = (db: Firestore, monthId: string, seller: string, value: string, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "settlements", monthId), { deduct: { [seller]: value } }, { merge: true }));

export const setMember = (db: Firestore, email: string, role: MemberDoc["role"], by: string, log?: Log, seller?: string) =>
  save(db, log, (b) =>
    b.set(doc(db, "members", email.trim().toLowerCase()), { role, seller: seller || deleteField(), addedBy: by, at: now() }, { merge: true }),
  );
// Which seller a viewer sees ("" = every seller); nothing else of the member changes.
export const setMemberSeller = (db: Firestore, email: string, seller: string, log?: Log) =>
  save(db, log, (b) => b.set(doc(db, "members", email), { seller: seller || deleteField() }, { merge: true }));
export const removeMember = (db: Firestore, email: string, log?: Log) => save(db, log, (b) => b.delete(doc(db, "members", email)));

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
