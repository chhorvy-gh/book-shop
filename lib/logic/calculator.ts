// The quick calculator's lists: ① with cost prices, ② with sale prices, one item per line, pasted from Telegram.
// Pure functions, so the reading and matching can be tested without the page.
import { fmt, latinDigits, prefixOf } from "@/lib/format";
import { NOTE_MAX, tidyNote } from "@/lib/orders";
import type { Item, PriceItem } from "@/lib/types";

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
  amount: number | undefined; // the price on the line (cost in ①); undefined for an item only in ② or a line with a quantity only
  sale: number | undefined; // a second price on the same line ("44000 49000")
  bare: boolean; // the line is numbers only
  key: string; // name + quantity + which one of them it is ("មាន់ស្រែ|2ក្បាល#1"), for matching ② to ①
  listSale?: number; // the sale price from list ② (or the line itself)
  fromList?: boolean; // that sale price came from «តម្លៃលក់», not typed
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

// A number followed by a word ("2Kg", "4 គីឡូ") is a quantity; «រៀល» / riel after it is still money.
const UNIT_AFTER = /^\s*\p{L}/u;
const MONEY_AFTER = /^\s*(រៀល|riel)/i;

// One line → an item or plain text.
//   "ឆ្អឹងគោសាច់ 4គីឡូ 44000 50000" → name, quantity + unit, cost, sale
//   "ស្លឹកគ្រៃ 7000 8000" or "7000/8000" → cost + sale;  "ជើងមាន់ 2គីឡូ 14000" → quantity + price
//   "test 2Kg" → quantity only, no price yet;  "test1 =" → nothing after "=" yet: quantity 1, no price
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
  let amount: number | undefined;
  let sale: number | undefined;
  const after = line.slice(at(n - 1) + nums[n - 1][0].length);
  const eq = line.lastIndexOf("=");
  if (eq > at(n - 1)) {
    qty = val(0);
    unit = trimSep(line.slice(at(0) + nums[0][0].length, eq));
  } else if (n === 1 && UNIT_AFTER.test(after) && !MONEY_AFTER.test(after)) {
    qty = val(0);
    unit = trimSep(after);
  } else if (n >= 3) {
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
    if (amount !== undefined) amount = -amount;
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
    return { ...l, listSale: s ? s.amount : l.sale, fromList: s?.fromList };
  });
  const spare = saleItems.filter((s) => !used.has(s));
  for (const r of rows) {
    if (r.kind !== "item" || r.listSale !== undefined || !spare.length) continue;
    const s = spare.shift() as ItemLine;
    r.listSale = s.amount;
    r.fromList = s.fromList;
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

// A line without its price (the last number), for the sale price to be typed after it:
// "សាច់គោ1គីឡូ32500" → "សាច់គោ1គីឡូ", "test=1200" → "test=". A line with no price ("test 2Kg") or that would be left
// with no name stays as it is.
function withoutPrice(raw: string): string {
  const read = readLine(raw);
  if (read.kind !== "item" || read.amount === undefined) return raw;
  const line = raw.trim();
  const nums = Array.from(latinDigits(line).matchAll(NUM));
  const last = nums[nums.length - 1];
  if (!last) return raw;
  const head = line.slice(0, last.index).trimEnd();
  return trimSep(head.replace(/^ដក/, "")) ? head : raw;
}

export type ListPrice = Pick<PriceItem, "name" | "unit" | "cost" | "sale">;

// A name or unit for matching: any case, one space between words.
const norm = (s: string) => latinDigits(s).trim().replace(/\s+/g, " ").toLowerCase();

// The «តម្លៃលក់» item called `name` with this unit; with no unit, the one item of that name (or its one without a unit).
function priceItem<P extends ListPrice>(prices: readonly P[], name: string, unit: string) {
  const same = prices.filter((p) => norm(p.name) === norm(name));
  return same.find((p) => norm(p.unit) === norm(unit)) ?? (!unit && same.length === 1 ? same[0] : undefined);
}

// The «តម្លៃលក់» item a line is, and how many of its unit the line has; undefined when the item is not there.
//   "test1=200" → the item «test1» × 1;  "ឆ្អឹងគោសាច់4គីឡូ44000" → «ឆ្អឹងគោសាច់ · គីឡូ» × 4
function listItem<P extends ListPrice>(l: ItemLine, prices: readonly P[]): { item: P; times: number } | undefined {
  if (!prices.length) return undefined;
  const whole = trimSep(withoutPrice(l.raw));
  const named = whole !== l.name ? priceItem(prices, whole, "") : undefined;
  if (named) return { item: named, times: 1 };
  const item = priceItem(prices, l.name, l.unit);
  return item ? { item, times: l.qty ?? 1 } : undefined;
}

// A line's sale price from «តម្លៃលក់» (its price per unit × the quantity), or undefined when the item is not there.
// A discount line gets none.
export function listPrice(l: ItemLine, prices: readonly ListPrice[]): number | undefined {
  if (l.amount !== undefined && l.amount <= 0) return undefined;
  const found = listItem(l, prices);
  return found ? Math.round(found.times * found.item.sale) : undefined;
}

// A line whose cost in box ① is not the cost on «តម្លៃលក់» (its cost per unit × the quantity): that item, how many of
// its unit the line has, and the cost it gives. Undefined when they agree, the item is not there or has no cost there,
// or the line has no cost (a discount line included).
export function costGap<P extends ListPrice>(l: ItemLine, prices: readonly P[]): { item: P; times: number; cost: number } | undefined {
  if (l.amount === undefined || l.amount <= 0) return undefined;
  const found = listItem(l, prices);
  if (!found || !found.item.cost) return undefined;
  const cost = Math.round(found.times * found.item.cost);
  return cost === l.amount ? undefined : { ...found, cost };
}

// A line without its price, with the sale price from «តម្លៃលក់» after it when the item is there.
function saleLine(raw: string, prices: readonly ListPrice[]): string {
  const head = withoutPrice(raw);
  const read = readLine(raw);
  const sale = read.kind === "item" ? listPrice(read, prices) : undefined;
  if (sale === undefined) return head;
  const end = head.trimEnd();
  return `${end}${/[=:]$/.test(end) ? "" : " "}${sale}`;
}

// What box ② shows until something is typed in it: box ①'s lines without their prices, each with its sale price from
// «តម្លៃលក់» when the item is there, the title kept and the written total left out. Empty when ① already has both
// prices on its lines. With no prices given, the lines are left blank for the sale prices to be typed.
export function saleTemplate(text: string, codes: ReadonlySet<string>, prices: readonly ListPrice[] = []): string {
  const list = parse(text, codes);
  if (list.rows.some((l) => l.kind === "item" && l.sale !== undefined)) return "";
  const lines = text.split("\n");
  const filled = lines.flatMap((l, i) => (l.trim() ? [i] : []));
  const title = list.title !== null ? filled[0] : -1;
  const total = list.written ? filled[filled.length - 1] : -1;
  return lines
    .map((l, i) => (i === total ? null : i === title ? l : saleLine(l, prices)))
    .filter((l): l is string => l !== null)
    .join("\n");
}

// Box ② without the lines still as the blank saleTemplate (no prices given) wrote them: those have no sale price yet.
export function filledLines(saleText: string, template: string) {
  const blank = new Set(template.split("\n").map((l) => l.trim()).filter(Boolean));
  return saleText.split("\n").filter((l) => !blank.has(l.trim())).join("\n");
}

// A box ② line with no price yet, typed or pasted: its sale price from «តម្លៃលក់», when the item is there.
//   "test1 =" or "test1" → the item «test1»;  "ឆ្អឹងគោសាច់4គីឡូ" → «ឆ្អឹងគោសាច់ · គីឡូ» × 4
// A line with a price, a discount line or a line naming nothing there gets none.
function unpricedSale(raw: string, prices: readonly ListPrice[]): number | undefined {
  const line = latinDigits(raw).trim();
  const head = line.replace(/\s*=\s*$/, "").trim();
  if (!head || /^(-|–|ដក)/.test(head)) return undefined;
  // The whole line is an item's name: any number in it is part of the name, not a price.
  const named = priceItem(prices, head, "");
  if (named) return named.sale;
  const read = readLine(line);
  if (read.kind !== "item" || read.amount !== undefined || read.sale !== undefined) return undefined;
  const item = priceItem(prices, read.name, read.unit);
  return item ? Math.round((read.qty ?? 1) * item.sale) : undefined;
}

// List ② as the table reads it: box ② with each line that has no price yet given its sale price from «តម្លៃលក់»
// ("test1 =" → "test1 =12000"; the box itself keeps what was typed), without the lines still blank. Lines priced from
// «តម្លៃលក់», here or by saleTemplate (`template`, against the `blank` one), are marked fromList.
export function saleListOf(shown: string, blank: string, template: string, prices: readonly ListPrice[], codes: ReadonlySet<string>): ParsedList {
  const fromList = new Set<string>();
  const blanks = new Set(blank.split("\n").map((l) => l.trim()).filter(Boolean));
  for (const l of template.split("\n")) if (l.trim() && !blanks.has(l.trim())) fromList.add(latinDigits(l).trim());
  const text = shown
    .split("\n")
    .map((raw) => {
      const sale = prices.length ? unpricedSale(raw, prices) : undefined;
      if (sale === undefined) return raw;
      const end = latinDigits(raw).trim();
      const line = `${end}${/[=:]$/.test(end) ? "" : " "}${sale}`;
      fromList.add(line);
      return line;
    })
    .join("\n");
  const list = parse(filledLines(text, blank), codes);
  return { ...list, rows: list.rows.map((r) => (r.kind === "item" && fromList.has(r.raw) ? { ...r, fromList: true } : r)) };
}

// What comes after "=" ("test 1 = 20000") is the price, and must be numbers only: digits (Khmer ones too), spaces, and
// "," "." in a number or "/" between two prices. Nothing after it is fine: the price is still to be typed.
const PRICE_ONLY = /^[\d\s,./]*$/;
export function badPrice(line: string): boolean {
  const at = line.lastIndexOf("=");
  return at >= 0 && !PRICE_ONLY.test(latinDigits(line.slice(at + 1)));
}

// A box's lines whose price is not numbers only: [line number, counting from 1, and the line].
export const badLines = (text: string): [number, string][] =>
  text.split("\n").flatMap((l, i): [number, string][] => (l.trim() && badPrice(l) ? [[i + 1, l.trim()]] : []));

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

// The lines as an order's item list, for the order made from the totals; a missing price counts 0, as in the totals.
export const orderItems = (view: CalcView, p: Pricing): Item[] =>
  itemsOf(view.rows).map((l) => ({ name: l.name, qty: l.qty ?? "", unit: l.unit, cost: l.amount ?? 0, sale: saleOf(l, p) ?? 0 }));

// A line's cost that is not the cost on «តម្លៃលក់», as the order's note says it:
// "test1: លុយដើម 2,000 · «តម្លៃលក់» 1,000 (ថ្លៃជាង 1,000)"
export function gapText(name: string, typed: number, listed: number) {
  return `${name}: លុយដើម ${fmt(typed)} · «តម្លៃលក់» ${fmt(listed)} (${typed > listed ? "ថ្លៃជាង" : "ថោកជាង"} ${fmt(Math.abs(typed - listed))})`;
}

// The order's note: the lines with no number at all ("ដឹកថ្ងៃស្អែក") and a title like that, then each cost that is not
// the cost on «តម្លៃលក់». Each once, joined by " · ", as many as fit (… when some do not). A title such as 23 or ហេង23
// names the list and stays out.
export function orderNote(view: CalcView, prices: readonly ListPrice[] = []): string {
  const texts = [
    ...(view.title && readLine(view.title).kind === "text" ? [view.title] : []),
    ...view.rows.filter((l): l is TextLine => l.kind === "text").map((l) => l.raw),
  ].map((s) => tidyNote(s));
  const gaps = itemsOf(view.rows).flatMap((l) => {
    const gap = costGap(l, prices);
    return gap ? [gapText(gap.item.name, l.amount ?? 0, gap.cost)] : [];
  });
  const parts = Array.from(new Set([...texts, ...gaps].filter(Boolean)));
  let note = "";
  for (const [k, part] of parts.entries()) {
    const next = note ? `${note} · ${part}` : part;
    const more = k < parts.length - 1 ? " · …" : "";
    if (next.length + more.length > NOTE_MAX) return note ? `${note} · …` : part.slice(0, NOTE_MAX);
    note = next;
  }
  return note;
}

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
