// Months, weeks, marts and the numbers worked out from a week's orders. Pure functions over the book state.
import { num, prefixOf, toDollars } from "./format";
import type { Mart, Month, Order, SaleBookState, SettlementRow, Week, WeekPay } from "./types";

export const MONTH_NAMES = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------- Months and weeks ----------
export const monthId = (mo: Pick<Month, "y" | "m">) => `${mo.y}-${pad2(mo.m)}`;
// "ខែតុលា 2026"
export const monthLabel = (mo: Pick<Month, "y" | "m">) => `ខែ${MONTH_NAMES[mo.m - 1]} ${mo.y}`;
// "ខែវិច្ឆិកា 2026" after ខែតុលា 2026.
export const nextMonthLabel = (mo: Pick<Month, "y" | "m">) => monthLabel({ y: mo.y + (mo.m === 12 ? 1 : 0), m: (mo.m % 12) + 1 });
// "អាទិត្យទី 3"
export const weekLabel = (w: Pick<Week, "no">) => `អាទិត្យទី ${w.no}`;
// "2026-10-3": the key a week's orders, notes and payout are kept under.
export const weekKey = (mo: Pick<Month, "y" | "m">, w: Pick<Week, "no">) => `${monthId(mo)}-${w.no}`;

// "03-10-2026" + n days
export function addDays(d: string, n: number) {
  const [dd, mm, yy] = d.split("-").map(Number);
  const x = new Date(yy, mm - 1, dd + n);
  return `${pad2(x.getDate())}-${pad2(x.getMonth() + 1)}-${x.getFullYear()}`;
}
export const weekEnd = (w: Week) => w.end || addDays(w.date, 6);
// "03-10 – 09-10-2026", with both years when the week crosses into a new year.
export function weekRange(w: Week) {
  const end = weekEnd(w);
  return `${w.date.slice(-4) === end.slice(-4) ? w.date.slice(0, 5) : w.date} – ${end}`;
}
// Short form for tabs: "03-10 – 09-10".
export const weekShort = (w: Week) => `${w.date.slice(0, 5)} – ${weekEnd(w).slice(0, 5)}`;
// "03-10-2026" ⇄ "2026-10-03" (date input format)
export const flipDate = (d: string) => d.split("-").reverse().join("-");

// Date inputs use "2026-10-03" (which sorts like a date). shiftDay("2026-10-03", 6) → "2026-10-09".
export function shiftDay(value: string, n: number) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// Days from one date input value to another, both counted.
export const dayCount = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 864e5) + 1;
// Where the next week usually starts: the day after this one ends (date input format).
export const dayAfter = (w: Week) => shiftDay(flipDate(weekEnd(w)), 1);

export const findMonth = (s: SaleBookState, id: string) => s.months.find((mo) => monthId(mo) === id) ?? null;
// The months that can be picked: every month but the past ones kept only as totals.
export const bookMonths = (s: SaleBookState) => s.months.filter((mo) => !mo.historyOnly);

// Every week of every month, oldest first.
export function allWeeks(s: SaleBookState) {
  return bookMonths(s).flatMap((mo) => mo.weeks.map((w) => ({ mo, w, key: weekKey(mo, w) })));
}
export const findWeek = (s: SaleBookState, key: string) => allWeeks(s).find((x) => x.key === key) ?? null;

// A week in any month that shares a day with from–to (date input format); except = the week whose dates are being changed.
export function weekOverlapping(s: SaleBookState, from: string, to: string, except?: { month: string; no: number }) {
  for (const mo of bookMonths(s)) {
    const w = mo.weeks.find(
      (x) =>
        !(except && except.month === monthId(mo) && except.no === x.no) && flipDate(x.date) <= to && flipDate(weekEnd(x)) >= from,
    );
    if (w) return { mo, w };
  }
  return null;
}

// The month and week on screen; week null = the whole month. Needs at least one month (see hasMonths).
export function picked(s: SaleBookState): { month: Month; week: Week | null } {
  const months = bookMonths(s);
  const month = months.find((mo) => monthId(mo) === s.pick.month) ?? months[months.length - 1];
  const week = month.weeks.find((w) => w.no === s.pick.week) ?? null;
  return { month, week };
}
export const hasMonths = (s: SaleBookState) => bookMonths(s).length > 0;
// For pages that always show one week: a whole-month pick shows that month's last week (null when it has none).
export function pickedWeek(s: SaleBookState): { month: Month; week: Week | null } {
  const { month, week } = picked(s);
  return { month, week: week ?? month.weeks[month.weeks.length - 1] ?? null };
}

// ---------- Marts ----------
export const martLabel = (s: SaleBookState, id: string) => s.martNames[id] || `Mart ${id}`;
// "Mart 1, Mart 2 និង Mart 3"
export function martList(s: SaleBookState, ids = s.marts) {
  const names = ids.map((id) => martLabel(s, id));
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} និង ${names[names.length - 1]}`;
}

// ---------- A week's orders ----------
export const weekSheets = (s: SaleBookState, mo: Month, w: Week) => s.sheets[weekKey(mo, w)] ?? {};
// The week's sheets as marts with their labels, in mart order.
export function weekMarts(s: SaleBookState, mo: Month, w: Week): Mart[] {
  const sheets = weekSheets(s, mo, w);
  return s.marts.map((id) => ({ id, label: martLabel(s, id), orders: sheets[id] ?? [] }));
}
// Every order of a week with its mart, Mart 1 first.
export function weekOrders(s: SaleBookState, mo: Month, w: Week): (Order & { mart: string })[] {
  const sheets = weekSheets(s, mo, w);
  return s.marts.flatMap((id) => (sheets[id] ?? []).map((o) => ({ ...o, mart: id })));
}
// Seller code → seller name.
export const sellerByCode = (s: SaleBookState) => new Map(s.sellers.map((x) => [x.code, x.name]));
// The seller of an order code, or "" when no seller has its letters.
export const sellerOf = (s: SaleBookState, code: string) => sellerByCode(s).get(prefixOf(code)) ?? "";

export interface SellerLine {
  mart: string;
  no: number;
  code: string;
  profit: number;
}

// Each seller's order lines and profit in one week (cancelled orders left out).
// { name: { lines: [{ mart, no, code, profit }], profit } }
export function bySeller(s: SaleBookState, mo: Month, w: Week) {
  const out: Record<string, { lines: SellerLine[]; profit: number }> = {};
  for (const x of s.sellers) out[x.name] = { lines: [], profit: 0 };
  const names = sellerByCode(s);
  for (const o of weekOrders(s, mo, w)) {
    const name = names.get(prefixOf(o.code));
    if (!name || o.status === "x") continue;
    out[name].lines.push({ mart: o.mart, no: o.no, code: o.code, profit: o.sale - o.cost });
    out[name].profit += o.sale - o.cost;
  }
  return out;
}

export interface PayoutRow {
  name: string;
  code: string;
  profit: number;
  share: number; // the shop's share of the profit
  amount: number; // profit − share: what is left for the seller
  deduct: number;
  add: number;
  paid: boolean;
  pay: number; // amount − deduct + add: what the seller is paid this week
}

// One row per seller for a week's payout, in seller order.
export function payoutRows(s: SaleBookState, mo: Month, w: Week): PayoutRow[] {
  const per = bySeller(s, mo, w);
  const sheet = s.payout[weekKey(mo, w)] ?? {};
  return s.sellers.map(({ name, code }) => {
    const profit = per[name].profit;
    const share = Math.round((profit * s.share) / 100);
    const e = sheet[name] ?? { deduct: 0, add: 0, paid: false };
    const amount = profit - share;
    return { name, code, profit, share, amount, deduct: e.deduct, add: e.add, paid: e.paid, pay: amount - e.deduct + e.add };
  });
}

export const isLoaded = (s: SaleBookState, mo: Month) => s.loaded.includes(monthId(mo));

// What each seller is paid in weeks 1–5 of a month: { name: [five amounts, null where the week is not there] }.
// A closed month whose orders are not loaded gives what was saved when it was closed. Otherwise: the payouts written
// down without sheets (extraPay), then each week's payout rows.
export function monthPayout(s: SaleBookState, mo: Month): WeekPay {
  const out: WeekPay = {};
  const saved = mo.closed && !isLoaded(s, mo) ? mo.closed.pay : null;
  for (const { name } of s.sellers) {
    const from = saved?.[name] ?? (saved ? [null, null, null, null, null] : mo.extraPay?.[name]);
    out[name] = [0, 1, 2, 3, 4].map((k) => from?.[k] ?? null);
  }
  if (saved) return out;
  for (const w of mo.weeks) {
    if (w.no < 1 || w.no > 5) continue;
    for (const r of payoutRows(s, mo, w)) out[r.name][w.no - 1] = r.pay;
  }
  return out;
}

// Totals of each of the five weeks over every seller (null = the week is not there yet), and how many weeks are in.
export function weekTotals(pay: WeekPay) {
  const totals = [0, 1, 2, 3, 4].map((k) => {
    const vals = Object.values(pay)
      .map((ws) => ws[k])
      .filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, v) => a + v, 0) : null;
  });
  return { totals, done: totals.filter((v) => v !== null).length, sum: totals.reduce<number>((a, v) => a + (v ?? 0), 0) };
}

export interface MonthTotal {
  y: number;
  m: number;
  name: string; // "តុលា"
  weeks: number; // weeks the month has (4 or 5)
  done: number; // weeks paid out so far
  sample: boolean; // made from the sample data
  totals: Record<string, number>; // seller name → paid in the month
  month: Month;
}

// Every month, oldest first, with what each seller is paid in it so far.
export function monthHistory(s: SaleBookState): MonthTotal[] {
  return s.months.map((mo) => {
    const pay = monthPayout(s, mo);
    const totals = Object.fromEntries(Object.entries(pay).map(([name, ws]) => [name, ws.reduce<number>((a, v) => a + (v ?? 0), 0)]));
    const weeks = mo.closed?.weeks ?? 5;
    const done = mo.historyOnly ? weeks : weekTotals(pay).done;
    return { y: mo.y, m: mo.m, name: MONTH_NAMES[mo.m - 1], weeks, done, sample: !!mo.sample, totals, month: mo };
  });
}

// ---------- Month-end ----------

export interface SettlementLine extends SettlementRow {
  name: string;
  month: number; // the month's weekly payouts added up (riel)
  grand: number; // the same in whole dollars: «លក់ 5 អាទិត្យ»
  total: number; // grand − advance − debt, in dollars to the cent: «សរុប»
}

// The month-end sheet of a month, in dollars: one line per seller with what was typed in. missing = week numbers
// (1–5) not paid out yet; while any are missing the numbers will still change.
export function settlementSheet(s: SaleBookState, mo: Month) {
  const pay = monthPayout(s, mo);
  const saved = s.settlement[monthId(mo)];
  const lines: SettlementLine[] = s.sellers.map(({ name }) => {
    const row: SettlementRow = saved?.rows[name] ?? { advance: "", debt: "", note: "" };
    const month = (pay[name] ?? []).reduce<number>((a, v) => a + (v ?? 0), 0);
    const grand = toDollars(month, s.rate);
    // Rounded to the cent so typing 0.1 + 0.2 never shows a long tail.
    const total = Math.round((grand - num(row.advance) - num(row.debt)) * 100) / 100;
    return { name, ...row, month, grand, total };
  });
  const done = weekTotals(pay).totals;
  return { closed: !!saved?.closed, missing: [1, 2, 3, 4, 5].filter((no) => done[no - 1] === null), lines };
}

// ---------- An empty book ----------
export function emptyState(): SaleBookState {
  return {
    months: [],
    pick: { month: "", week: null },
    marts: ["1", "2"],
    martNames: {},
    sellers: [],
    sheets: {},
    adjustments: {},
    codeFloor: {},
    notes: {},
    payout: {},
    settlement: {},
    monthDeduct: {},
    rate: 0.00068,
    share: 25,
    loaded: [],
    trash: { months: [], weeks: [], marts: [] },
  };
}
