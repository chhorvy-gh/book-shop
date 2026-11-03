// «ប្រវត្តិកែប្រែ» (change history) for the pages: what each line is called, where in the book it happened, and what
// changed, in the book's own words. The lines are saved together with the changes (db.ts); the store makes them.
import type { Tone } from "@/components/ui";
import { splitWeekKey, type HistoryAct, type HistoryDoc, type HistoryKind } from "./db";
import { fmt, num } from "./format";
import { dueInfo } from "./logic/due";
import { STATUS } from "./orders";
import { martLabel, monthLabel, weekLabel } from "./periods";
import { TRASH_NAME } from "./trash";
import type { Item, Note, Order, SaleBookState, Status } from "./types";

export const HISTORY_NAME = "ប្រវត្តិកែប្រែ";

export const ACT: Record<HistoryAct, { label: string; tone: Tone }> = {
  add: { label: "បន្ថែម", tone: "success" },
  edit: { label: "កែ", tone: "accent" },
  delete: { label: "លុប", tone: "danger" },
  purge: { label: "លុបជារៀងរហូត", tone: "danger" },
  restore: { label: "ស្តារវិញ", tone: "warning" },
  close: { label: "បិទខែ", tone: "default" },
};

export const KIND: Record<HistoryKind, string> = {
  order: "ការបញ្ជាទិញ",
  note: "កំណត់ចំណាំ",
  month: "ខែ",
  week: "អាទិត្យ",
  mart: "Mart",
  seller: "អ្នកលក់",
  rate: "អត្រាប្តូរ",
  payout: "ទូទាត់ប្រចាំអាទិត្យ",
  deduct: "សង្ខេបប្រចាំខែ",
  settlement: "ទូទាត់ចុងខែ",
  member: "អ្នកប្រើ",
  sample: "ទិន្នន័យគំរូ",
};

// The page's filters: what kind of thing, and what was done to it.
export type KindFilter = "all" | "order" | "note" | "pay" | "other";
export const KIND_FILTERS: [KindFilter, string][] = [
  ["all", "ទាំងអស់"],
  ["order", "ការបញ្ជាទិញ"],
  ["note", "កំណត់ចំណាំ"],
  ["pay", "ទូទាត់"],
  ["other", "ផ្សេងៗ"],
];
const KIND_FILTER: Record<HistoryKind, Exclude<KindFilter, "all">> = {
  order: "order",
  note: "note",
  payout: "pay",
  deduct: "pay",
  settlement: "pay",
  rate: "pay",
  month: "other",
  week: "other",
  mart: "other",
  seller: "other",
  member: "other",
  sample: "other",
};
export type ActFilter = "all" | "add" | "edit" | "delete";
export const ACT_FILTERS: [ActFilter, string][] = [
  ["all", "ទាំងអស់"],
  ["add", "បន្ថែម"],
  ["edit", "កែ"],
  ["delete", "លុប"],
];
const ACT_FILTER: Record<HistoryAct, Exclude<ActFilter, "all">> = {
  add: "add",
  edit: "edit",
  restore: "edit",
  close: "edit",
  delete: "delete",
  purge: "delete",
};
export const kindIs = (e: HistoryDoc, f: KindFilter) => f === "all" || KIND_FILTER[e.kind] === f;
export const actIs = (e: HistoryDoc, f: ActFilter) => f === "all" || ACT_FILTER[e.act] === f;

// ---------- Making the lines (the store) ----------

// The same value, for plain data: maps compare field by field, whatever order their keys come in.
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
// The given fields of a thing; one it does not have is saved as null ("nothing").
export const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

export const orderTitle = (o: Pick<Order, "no" | "code">) => `#${o.no}${o.code ? ` · ${o.code}` : ""}`;
export const noteTitle = (n: Pick<Note, "no" | "code">) => (n.no === "—" ? n.code || "—" : orderTitle({ no: n.no, code: n.code }));
// Everything an order or note holds, for the line of an add or a delete.
export const orderFields = ({ no, code, cost, sale, status, items }: Omit<Order, "id">) => ({ no, code, cost, sale, status, items });
export const noteFields = ({ no, code, due, amount, note, collected, flagged }: Omit<Note, "id">) => ({ no, code, due, amount, note, collected, flagged });

// Where an order or note is in the book, from what is loaded.
export function findOrder(s: SaleBookState, id: string) {
  for (const [weekKey, marts] of Object.entries(s.sheets))
    for (const [mart, list] of Object.entries(marts)) {
      const order = list.find((o) => o.id === id);
      if (order) return { order, weekKey, mart, monthId: splitWeekKey(weekKey).monthId };
    }
  return null;
}
export function findNote(s: SaleBookState, id: string) {
  for (const [weekKey, list] of Object.entries(s.notes)) {
    const note = list.find((n) => n.id === id);
    if (note) return { note, weekKey, monthId: splitWeekKey(weekKey).monthId };
  }
  return null;
}

// ---------- Reading the lines (the history page) ----------

// The fields each kind of line can show, in the order they show, with their names on the pages.
const FIELDS: Record<HistoryKind, Record<string, string>> = {
  order: { no: "លេខ", code: "កូដ", cost: "លុយដើម", sale: "លុយលក់", status: "ស្ថានភាព", items: "មុខទំនិញ" },
  note: { no: "លេខ", code: "កូដ", due: "ថ្ងៃកំណត់", amount: "ចំនួនលុយ", note: "កំណត់ចំណាំ", collected: "ស្ថានភាព", flagged: "ពណ៌លឿង" },
  payout: { deduct: "ដក", add: "បូក", paid: "បានបើក" },
  deduct: { value: "ដក" },
  settlement: { advance: "ដកមុន", debt: "កាត់បុងជំពាក់", note: "កំណត់ចំណាំ" },
  rate: { rate: "1 = $" },
  month: { date: "អាទិត្យទី 1 ចាប់ពី", end: "ដល់" },
  week: { date: "ចាប់ពី", end: "ដល់" },
  mart: { name: "ឈ្មោះ" },
  seller: { code: "កូដ" },
  member: { role: "សិទ្ធិ", seller: "មើលតែអ្នកលក់" },
  sample: {},
};
// What an add or a delete shows of the thing: enough to know it again (its name is the line's title already).
const SUMMARY: Partial<Record<HistoryKind, string[]>> = {
  order: ["cost", "sale", "status", "items"],
  note: ["amount", "due", "note"],
};
const ROLE: Record<string, string> = { owner: "ម្ចាស់ហាង", member: "អ្នកប្រើ", viewer: "អ្នកមើល" };

// "2026-10" → { y: 2026, m: 10 }
export const monthOfId = (id: string) => ({ y: Number(id.slice(0, 4)), m: Number(id.slice(5, 7)) });

// One value as the pages show it: riel with commas, dollars as typed, statuses and roles by name.
function shown(e: HistoryDoc, field: string, v: unknown): string {
  if (field === "collected") return v ? "បានប្រមូល" : "មិនទាន់ប្រមូល";
  if (field === "flagged") return v ? "សម្គាល់" : "មិនសម្គាល់";
  if (field === "paid") return v ? "បានបើក" : "មិនទាន់បើក";
  if (v === null || v === undefined || v === "") return "—";
  switch (field) {
    case "cost":
    case "sale":
    case "amount":
    case "deduct":
    case "add":
    case "value":
      return fmt(num(v as string | number));
    case "advance":
    case "debt":
      return `$${v}`;
    case "status":
      return STATUS[v as Status]?.label ?? String(v);
    case "items":
      return `${(v as Item[]).length} មុខ`;
    case "due":
      return e.monthId ? dueInfo(String(v), monthOfId(e.monthId), new Date()).label : String(v);
    case "role":
      return ROLE[String(v)] ?? String(v);
    case "no":
      return `#${v}`;
    case "note":
    case "name":
      return `«${v}»`;
    default:
      return String(v);
  }
}

export interface Change {
  label: string;
  before?: string; // left out for an add
  after?: string; // left out for a delete
}

// What the line says changed: each changed field before → after; what was added or deleted; or nothing to add.
export function changes(e: HistoryDoc): Change[] {
  const names = FIELDS[e.kind];
  const before = e.before ?? {};
  const after = e.after ?? {};
  if (e.act === "edit") {
    return Object.keys(names)
      .filter((k) => (k in before || k in after) && !same(before[k] ?? null, after[k] ?? null))
      .map((k) => ({ label: names[k], before: shown(e, k, before[k]), after: shown(e, k, after[k]) }));
  }
  if (e.act === "add" || e.act === "delete") {
    const data = e.act === "add" ? after : before;
    const keys = (SUMMARY[e.kind] ?? Object.keys(names)).filter((k) => k in data && data[k] !== null && data[k] !== "");
    return keys.map((k) => ({ label: names[k], [e.act === "add" ? "after" : "before"]: shown(e, k, data[k]) }));
  }
  return [];
}
// An edit that ended where it began (a number typed and then put back): it changed nothing, so the page leaves it out.
export const changedNothing = (e: HistoryDoc) => e.act === "edit" && changes(e).length === 0;

// A word on what happened to a month, week or mart, beyond its fields.
export function remark(e: HistoryDoc): string {
  if (e.act === "delete" && (e.kind === "month" || e.kind === "week" || e.kind === "mart")) return `ទៅ «${TRASH_NAME}» · ស្តារវិញបាន`;
  if (e.act === "restore") return `ពី «${TRASH_NAME}»`;
  if (e.act === "purge") return "ជាមួយការបញ្ជាទិញ និងអ្វីៗរបស់វាទាំងអស់";
  if (e.act === "close") return "រក្សាទុកការទូទាត់ប្រចាំអាទិត្យរបស់ខែ";
  return "";
}

// Where in the book: "ការបញ្ជាទិញ · Mart 1 · អាទិត្យទី 3 · ខែតុលា 2026".
// The kind is left out when it is the line's title already (the rate, the sample data).
export function placeOf(s: SaleBookState, e: HistoryDoc) {
  const parts = e.title === KIND[e.kind] ? [] : [KIND[e.kind]];
  if (e.mart && e.kind !== "mart") parts.push(martLabel(s, e.mart));
  if (e.weekKey && e.kind !== "week") parts.push(weekLabel({ no: splitWeekKey(e.weekKey).no }));
  if (e.monthId && e.kind !== "month") parts.push(monthLabel(monthOfId(e.monthId)));
  return parts.join(" · ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
export const timeOf = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// The day a line falls in, day first like the book's dates: "ថ្ងៃនេះ · 03-11-2026", "ម្សិលមិញ · 02-11-2026", "01-11-2026".
export function dayOf(at: number, now = new Date()) {
  const d = new Date(at);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dateOf(d) === dateOf(now)) return `ថ្ងៃនេះ · ${dateOf(d)}`;
  if (dateOf(d) === dateOf(yesterday)) return `ម្សិលមិញ · ${dateOf(d)}`;
  return dateOf(d);
}

// Everything a search can match on a line.
export const searchText = (s: SaleBookState, e: HistoryDoc) =>
  [e.title, placeOf(s, e), e.by, ...changes(e).flatMap((c) => [c.before ?? "", c.after ?? ""])].join(" ").toLowerCase();
