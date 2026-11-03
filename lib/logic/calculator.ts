// The quick calculator's lists: ① with cost prices, ② with sale prices, one item per line, pasted from Telegram.
// Pure functions, so the reading and matching can be tested without the page.
import { fmt, latinDigits, prefixOf } from "@/lib/format";

// A line with no number at all: shown in the table, never added up.
export interface TextLine {
  kind: "text";
  raw: string;
  note?: string;
}

export interface ItemLine {
  kind: "item";
  raw: string;
  name: string;
  qty: number | null;
  unit: string;
  amount: number | undefined; // the price on the line (cost in ①); undefined for an item only in ②
  sale: number | undefined; // a second price on the same line ("44000 49000")
  bare: boolean; // the line is numbers only
  key: string; // name + quantity + which one of them it is ("មាន់ស្រែ|2ក្បាល#1"), for matching ② to ①
  listSale?: number; // the sale price from list ② (or the line itself)
  note?: string;
}

export type Line = TextLine | ItemLine;

export interface ParsedList {
  title: string | null;
  written: { cost: number; sale: number | undefined } | null;
  rows: Line[];
}

export interface CalcView {
  title: string | null;
  written: { cost?: number; sale?: number };
  rows: Line[];
}

// Sale prices typed in the table (by row key), and the markup % with its rounding step for the rest.
export interface Pricing {
  sales: Record<string, number>;
  markup: number | null;
  step: number;
}

export interface CalcTotals {
  count: number;
  cost: number;
  sale: number;
  missing: number; // items still without a sale price
  noCost: number; // items only in list ②
  typed: number; // sale prices typed in the table
  profit: number | null; // null while a price is missing
}

// "44,000" and "44.000" are thousands; "1.5" stays a decimal.
const toNumber = (s: string) => parseFloat(/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(/,/g, ""));
const NUM = /\d[\d,.]*\d|\d/g;
const trimSep = (s: string) => s.replace(/^[\s:=x×*\-–]+|[\s:=x×*\-–]+$/g, "");
const PAIR = /[/→>]/;

// One line → an item or plain text.
//   "ឆ្អឹងគោសាច់ 4គីឡូ 44000 50000" → name, quantity + unit, cost, sale
//   "ស្លឹកគ្រៃ 7000 8000" or "7000/8000" → cost + sale;  "ជើងមាន់ 2គីឡូ 14000" → quantity + price
// A line starting with - or «ដក» takes money off.
export function readLine(raw: string): Line {
  const line = latinDigits(raw).trim();
  const nums = Array.from(line.matchAll(NUM));
  if (!nums.length) return { kind: "text", raw: line };
  const n = nums.length;
  const at = (i: number) => nums[i].index ?? 0;
  const val = (i: number) => toNumber(nums[i][0]);
  const gap = (i: number) => line.slice(at(i) + nums[i][0].length, at(i + 1));

  let qty: number | null = null;
  let unit = "";
  let amount: number;
  let sale: number | undefined;
  if (n >= 3) {
    qty = val(0);
    unit = trimSep(gap(0));
    amount = val(n - 2);
    sale = val(n - 1);
  } else if (n === 2 && (PAIR.test(gap(0)) || (!trimSep(gap(0)) && val(0) >= 100))) {
    amount = val(0);
    sale = val(1);
  } else if (n === 2) {
    qty = val(0);
    unit = trimSep(gap(0));
    amount = val(1);
  } else {
    amount = val(0);
  }
  if (/^(-|–|ដក)/.test(line)) {
    amount = -amount;
    if (sale !== undefined) sale = -sale;
  }
  return {
    kind: "item",
    raw: line,
    name: trimSep(line.slice(0, at(0)).replace(/^ដក/, "")),
    qty,
    unit,
    amount,
    sale,
    bare: /^[-–]?[\d,.\s/→>]+(៛|រៀល)?$/.test(line),
    key: "",
  };
}

// "2គីឡូ", "1.5គីឡូ"
export const qtyText = (l: ItemLine) => (l.qty === null ? "" : (Number.isInteger(l.qty) ? fmt(l.qty) : String(l.qty)) + l.unit);

// One pasted list → its title, written total and lines. Items get a key (name + quantity) for matching.
// codes: the seller codes, so a first line like "ហេង23" is read as the list's title.
export function parse(text: string, codes: ReadonlySet<string>): ParsedList {
  const lines = text
    .split("\n")
    .filter((l) => l.trim())
    .map(readLine);
  const plain = (l: Line | undefined): l is ItemLine => !!l && l.kind === "item" && l.bare && l.qty === null;
  let title: string | null = null;
  let written: ParsedList["written"] = null;

  // A first line that is a small number, a seller code ("ហេង23") or plain text names the list.
  const first = lines[0];
  if (
    first &&
    lines.length > 1 &&
    (first.kind === "text" ||
      (plain(first) && first.sale === undefined && (first.amount ?? 0) > 0 && (first.amount ?? 0) < 1000) ||
      (first.kind === "item" && first.qty === null && first.sale === undefined && codes.has(prefixOf(first.raw))))
  ) {
    title = first.raw;
    lines.shift();
  }

  // A last line of numbers only ("101000" or "101000 116000"), at least as big as any one item,
  // is the total someone wrote down.
  const end = lines[lines.length - 1];
  const before = lines.slice(0, -1).filter((l): l is ItemLine => l.kind === "item");
  if (plain(end) && before.length >= 2 && (end.amount ?? 0) >= Math.max(...before.map((l) => Math.abs(l.amount ?? 0)))) {
    lines.pop();
    written = { cost: end.amount ?? 0, sale: end.sale };
  }

  const seen: Record<string, number> = {};
  const rows = lines.map((l) => {
    if (l.kind !== "item") return l;
    const base = `${l.name}|${qtyText(l)}`;
    seen[base] = (seen[base] ?? 0) + 1;
    return { ...l, key: `${base}#${seen[base]}` };
  });
  return { title, written, rows };
}

// Put the two lists side by side: same name + quantity first, then whatever is left in line order.
export function combine(costList: ParsedList, saleList: ParsedList): CalcView {
  const saleItems = saleList.rows.filter((l): l is ItemLine => l.kind === "item");
  const byKey = new Map(saleItems.map((s) => [s.key, s]));
  const used = new Set<ItemLine>();
  const rows: Line[] = costList.rows.map((l) => {
    if (l.kind !== "item") return l;
    const s = byKey.get(l.key);
    if (s) used.add(s);
    return { ...l, listSale: s ? s.amount : l.sale };
  });
  const spare = saleItems.filter((s) => !used.has(s));
  for (const r of rows) {
    if (r.kind !== "item" || r.listSale !== undefined || !spare.length) continue;
    const s = spare.shift() as ItemLine;
    r.listSale = s.amount;
    r.note = `ផ្គូផ្គងតាមលំដាប់ជាមួយ «${s.name || s.raw}» ក្នុងប្រអប់ ②`;
  }
  for (const s of spare) rows.push({ ...s, amount: undefined, listSale: s.amount, key: `sale:${s.key}`, note: "មិនមានក្នុងប្រអប់ ①" });
  for (const l of saleList.rows) if (l.kind === "text") rows.push({ ...l, note: "ប្រអប់ ②" });

  const cw = costList.written;
  const sw = saleList.written;
  return {
    title: costList.title || saleList.title,
    written: { cost: cw?.cost, sale: cw?.sale !== undefined ? cw.sale : sw?.cost },
    rows,
  };
}

// The markup box: a number of 0 or more, or null when empty or unreadable.
export function markupOf(text: string) {
  const p = parseFloat(text);
  return isNaN(p) || p < 0 ? null : p;
}

// Sale price: typed in the table, else from list ② (or the line itself), else cost + markup % rounded.
export function saleOf(l: ItemLine, p: Pricing): number | undefined {
  if (p.sales[l.key] !== undefined) return p.sales[l.key];
  if (l.listSale !== undefined) return l.listSale;
  if (p.markup === null || !(l.amount !== undefined && l.amount > 0)) return undefined;
  return Math.round((l.amount * (100 + p.markup)) / 100 / p.step) * p.step;
}

export const itemsOf = (rows: Line[]) => rows.filter((l): l is ItemLine => l.kind === "item");

export function totals(rows: Line[], p: Pricing): CalcTotals {
  const items = itemsOf(rows);
  const cost = items.reduce((a, l) => a + (l.amount || 0), 0);
  const sale = items.reduce((a, l) => a + (saleOf(l, p) || 0), 0);
  // A discount line (cost below 0) does not need its own sale price.
  const missing = items.filter((l) => saleOf(l, p) === undefined && l.amount !== undefined && l.amount > 0).length;
  const noCost = items.filter((l) => l.amount === undefined).length;
  const typed = items.filter((l) => p.sales[l.key] !== undefined).length;
  return { count: items.length, cost, sale, missing, noCost, typed, profit: missing || noCost ? null : sale - cost };
}

// The written total(s) next to what the lines add up to: [label, written, added up].
export function writtenCheck(written: CalcView["written"], t: CalcTotals): [string, number, number][] {
  const parts: [string, number, number][] = [];
  if (written.cost !== undefined && !t.noCost) parts.push(["លុយដើម", written.cost, t.cost]);
  if (written.sale !== undefined && t.profit !== null) parts.push(["លុយលក់", written.sale, t.sale]);
  return parts;
}

// "name qty cost / sale" per line, so a copied list can be pasted back into box ①.
export function listText(view: CalcView, p: Pricing) {
  const t = totals(view.rows, p);
  const withSale = t.sale > 0;
  const lines = itemsOf(view.rows).map((l) => {
    const s = saleOf(l, p);
    const cost = l.amount === undefined ? "—" : fmt(l.amount);
    return [l.name, qtyText(l), cost + (withSale && s !== undefined ? ` / ${fmt(s)}` : "")].filter(Boolean).join(" ");
  });
  const sum = withSale
    ? [`លុយដើម ${fmt(t.cost)}`, `លុយលក់ ${fmt(t.sale)}${t.missing ? ` (នៅខ្វះ ${t.missing} មុខ)` : ""}`, ...(t.profit === null ? [] : [`ចំណេញ ${fmt(t.profit)}`])]
    : [`សរុប ${fmt(t.cost)}`];
  return `${view.title ? `${view.title}\n` : ""}${lines.join("\n")}\n${sum.join("\n")}`;
}
