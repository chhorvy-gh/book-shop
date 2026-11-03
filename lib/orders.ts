// Orders on a sales sheet: status, codes and the item lists pasted from Telegram.
import { latinDigits, prefixOf } from "./format";
import type { Item, Mart, Order, Status } from "./types";

// tone: the colour of the status chip (see <ToneChip>).
export const STATUS: Record<Status, { label: string; tone: "success" | "warning" | "danger" }> = {
  p: { label: "បានបង់", tone: "success" },
  u: { label: "មិនទាន់បង់", tone: "warning" },
  x: { label: "បោះបង់", tone: "danger" },
};
// Clicking a status chip steps through មិនទាន់បង់ → បានបង់ → បោះបង់ → មិនទាន់បង់.
export const NEXT_STATUS: Record<Status, Status> = { u: "p", p: "x", x: "u" };

// Cancelled orders count for nothing in totals.
export const live = (orders: Order[]) => orders.filter((o) => o.status !== "x");
export const totals = (orders: Order[]) => {
  const l = live(orders);
  const cost = l.reduce((a, o) => a + o.cost, 0);
  const sale = l.reduce((a, o) => a + o.sale, 0);
  return { count: l.length, cost, sale, profit: sale - cost };
};

// Order codes are unique across all marts of the week. exceptId = the order being edited, which may keep its own code.
// An empty code (an order whose code was cleared) is never a duplicate: any number of orders may be without one.
export function findCode(marts: Mart[], code: string, exceptId?: string) {
  if (!code) return null;
  for (const m of marts) {
    const o = m.orders.find((x) => x.code === code && x.id !== exceptId);
    if (o) return { no: o.no, mart: m.label, martId: m.id, order: o };
  }
  return null;
}

// The next free number for a seller's codes this week, above any used in earlier sheets (floor).
export function nextCodeNumber(marts: Mart[], prefix: string, floor: Record<string, number>) {
  let max = floor[prefix] ?? 0;
  for (const m of marts) {
    for (const o of m.orders) {
      if (prefixOf(o.code) !== prefix) continue;
      const n = /([0-9]+)$/.exec(o.code);
      if (n) max = Math.max(max, parseInt(n[1], 10));
    }
  }
  return max + 1;
}

// A new order's id: unique, and never reused after a delete.
export const newOrderId = (mart: string, no: number) => `m${mart}-${no}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Item lists ----------
// Each list is pasted the way it arrives in Telegram: the order number, then one item per line,
// name + quantity + price ("មាន់ស្រែ1ក្បាល21500"). ① has cost prices, ② has sale prices.

interface Line {
  raw: string;
  name: string;
  qty: number | "";
  unit: string;
  price: number | null;
}

// A line without a price at the end comes back with price null.
export function readLine(raw: string): Line {
  const line = latinDigits(raw).trim();
  const m = /^(.*?)\s*(?:(\d+(?:\.\d+)?)\s*([^\d\s.,]+))?\s*(\d[\d,]*)$/.exec(line);
  if (!m) return { raw: line, name: line, qty: "", unit: "", price: null };
  return {
    raw: line,
    name: m[1].trim(),
    qty: m[2] ? parseFloat(m[2]) : "",
    unit: m[3] || "",
    price: parseFloat(m[4].replace(/,/g, "")),
  };
}

// The first line is the order number when it is a bare 1–3 digit number.
export function readList(text: string): Line[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^\d{1,3}$/.test(latinDigits(lines[0]))) lines.shift();
  return lines.map(readLine);
}

// Pairs each cost line with the sale line of the same item (name + quantity), then whatever is left in line order.
// Returns the order's items and short warnings about lines that do not fit.
export function readLists(costText: string, saleText: string): { items: Item[]; notes: string[] } {
  const costs = readList(costText);
  const sales = readList(saleText);
  const key = (l: Line) => `${l.name}|${l.qty}${l.unit}`;
  const used = new Set<Line>();
  const pairs: [Line | null, Line | null][] = costs.map((c) => {
    const s = sales.find((x) => !used.has(x) && key(x) === key(c)) ?? null;
    if (s) used.add(s);
    return [c, s];
  });
  for (const p of pairs) {
    if (p[1]) continue;
    const s = sales.find((x) => !used.has(x));
    if (s) {
      used.add(s);
      p[1] = s;
    }
  }
  sales.filter((s) => !used.has(s)).forEach((s) => pairs.push([null, s]));

  const notes: string[] = [];
  if (costs.length && !sales.length) notes.push("បញ្ជីលុយលក់នៅទទេ");
  else if (sales.length && !costs.length) notes.push("បញ្ជីលុយដើមនៅទទេ");
  else
    for (const [c, s] of pairs) {
      if (!c && s) notes.push(`«${s.raw}» មានតែក្នុងបញ្ជីលុយលក់`);
      if (!s && c) notes.push(`«${c.raw}» មានតែក្នុងបញ្ជីលុយដើម`);
    }
  for (const [list, label] of [[costs, "លុយដើម"], [sales, "លុយលក់"]] as const) {
    const bad = list.filter((l) => l.price === null);
    if (bad.length && bad.length === list.length) notes.push(`បញ្ជី${label} មិនទាន់មានតម្លៃ`);
    else bad.forEach((l) => notes.push(`«${l.raw}» គ្មាន${label}`));
    list.filter((l) => l.price !== null && !l.name).forEach((l) => notes.push(`«${l.raw}» គ្មានឈ្មោះទំនិញ`));
  }

  const items = pairs.map(([c, s]) => {
    const base = (c ?? s) as Line;
    return { name: base.name, qty: base.qty, unit: base.unit, cost: c?.price ?? 0, sale: s?.price ?? 0 };
  });
  return { items, notes };
}

// An order's items back as list text, in the same shape as pasted.
export function listText(order: Pick<Order, "no" | "items">, field: "cost" | "sale") {
  return [String(order.no), ...order.items.map((it) => `${it.name}${it.qty}${it.unit}${it[field] || ""}`)].join("\n");
}

export const sumItems = (items: Item[], field: "cost" | "sale") => items.reduce((a, it) => a + it[field], 0);
