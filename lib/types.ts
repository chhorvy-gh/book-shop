// p = paid (បានបង់), u = unpaid (មិនទាន់បង់), x = cancelled (បោះបង់)
export type Status = "p" | "u" | "x";

// One line of an order's item list: "មាន់ស្រែ1ក្បាល21500" → name មាន់ស្រែ, qty 1, unit ក្បាល.
// qty is "" for a line with no quantity ("ស្លឹកគ្រៃ 7000").
export interface Item {
  name: string;
  qty: number | "";
  unit: string;
  cost: number;
  sale: number;
}

// An order on a mart's sheet in one week. id is the Firestore document id.
export interface Order {
  id: string;
  no: number;
  code: string;
  cost: number;
  sale: number;
  status: Status;
  items: Item[];
}

// A seller and the letters their order codes start with: code ហេង → ហេង1, ហេង2 …
export interface Seller {
  name: string;
  code: string;
}

// A mart's sheet in one week, with its display name.
export interface Mart {
  id: string;
  label: string;
  orders: Order[];
}

// What goes on a printed invoice: the customer's side only, never cost or profit.
export interface InvoiceData {
  no: number;
  code: string;
  seller: string;
  mart: string;
  period: string;
  sale: number;
  status: Status;
  items: Item[];
}

// ---------- Months and weeks ----------

// A week of a month. Dates are "03-10-2026"; end is the last day (a week without one runs 7 days).
export interface Week {
  no: number;
  date: string;
  end?: string;
}

// Five weekly amounts per seller (weeks 1–5); null = that week is not there.
export type WeekPay = Record<string, (number | null)[]>;

export interface Month {
  y: number;
  m: number; // 1–12
  weeks: Week[]; // in number order
  // Weekly payouts written down without order sheets (weeks paid out before the book was kept here).
  extraPay?: WeekPay;
  // Set when the month is closed on the month-end page: what each seller was paid each week, kept so the
  // monthly history does not need the month's orders. weeks = how many weeks the month had.
  closed?: { pay: WeekPay; weeks: number; at: number };
  // A past month that exists only as totals (no weeks to pick); sample = made from the sample data.
  historyOnly?: boolean;
  sample?: boolean;
}

// A pay-later note: an order whose money is collected later. id is the Firestore document id.
// due: "5" … "25" = that day of the week's month, "YYYY-MM-DD" = a set date, "next" = next month, "" = not set.
export interface Note {
  id: string;
  no: number | "—";
  code: string;
  due: string;
  amount: number;
  note: string;
  collected: boolean;
  flagged: boolean;
}

// One seller's line on a week's payout sheet, beyond their profit less the share.
export interface PayoutEntry {
  deduct: number;
  add: number;
  paid: boolean;
}

// One seller's row on the month-end sheet. Amounts are dollars, kept as typed ("" = nothing).
export interface SettlementRow {
  advance: string; // ដកមុន: advance already taken
  debt: string; // កាត់បុងជំពាក់: debt cut this month
  note: string;
}

export interface SettlementSheet {
  closed: boolean;
  rows: Record<string, SettlementRow>; // seller name → row; a seller without one starts blank
}

// The whole book as the pages see it, put together from the Firestore documents that are loaded.
// Keys: weekKey = "2026-10-3" (month id + week no), monthId = "2026-10", mart id = "1", "2" …
export interface SaleBookState {
  months: Month[]; // oldest first
  pick: { month: string; week: number | null }; // the month and week on screen (this device); week null = whole month
  marts: string[];
  martNames: Record<string, string>; // a name given in the app; otherwise "Mart N"
  sellers: Seller[];
  sheets: Record<string, Record<string, Order[]>>; // weekKey → mart id → orders
  adjustments: Record<string, Record<string, [number, string, number][]>>; // weekKey → mart id → [no, code, amount]
  codeFloor: Record<string, Record<string, number>>; // weekKey → code prefix → highest number used before
  notes: Record<string, Note[]>; // weekKey → pay-later notes
  payout: Record<string, Record<string, PayoutEntry>>; // weekKey → seller name → entry
  settlement: Record<string, SettlementSheet>; // monthId → month-end sheet
  monthDeduct: Record<string, Record<string, string>>; // monthId → seller name → amount typed in «ដក» on the monthly summary
  rate: number; // 1 riel → $
  share: number; // % of profit the shop keeps
  // Months whose orders are all loaded. A closed month that is not loaded uses its saved totals; its sheets hold only
  // the unpaid orders (for the pay-later notes page).
  loaded: string[];
}
