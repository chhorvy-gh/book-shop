// Numbers, money and codes, shared by every page.

// 12500 → "12,500"; -800 → "-800"
export const fmt = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
// 12500 → "+12,500"; 0 → "0"
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
// riel → "$12.34" / "-$12.34" at the rate (1 riel → $).
export const usd = (n: number, rate: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n * rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// riel → whole dollars, "$12".
export const usd0 = (n: number, rate: number) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n * rate)).toLocaleString("en-US");
// riel → whole dollars as a number, rounding half away from zero.
export const toDollars = (n: number, rate: number) => (n < 0 ? -1 : 1) * Math.round(Math.abs(n * rate));
// Dollars as they are: "$572", "-$163", "$57.50" (cents only when there are some).
export const dollars = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
export const cents = (n: number) => Math.round(n * 100) / 100;
// 33.333 → "33.33%"
export const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
// profit / sale → "12.3%", or "—" without a sale.
export const margin = (profit: number, sale: number) => (sale ? `${((profit / sale) * 100).toFixed(1)}%` : "—");

// Text typed in a number box → a number, 0 when empty or unreadable.
export const num = (text: string | number | undefined | null) => parseFloat(String(text ?? "")) || 0;
// "81,000", "81000", "81 000", "$12" → the number; anything unreadable → 0.
export const parseMoney = (text: string | number) => {
  const n = parseFloat(String(text).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

// Khmer digits typed on a Khmer keyboard (០–៩) count as 0–9: "នាង៦" → "នាង6".
export const latinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)));

// A code's seller letters end at the first digit or "(": "ហេង31" → "ហេង", "សុជាតា5(1)" → "សុជាតា".
export const prefixOf = (code: string) => String(code).replace(/[0-9(].*$/, "").trim();

// A seller code is letters only; the number is added per order.
export const BAD_SELLER_CODE = /[0-9០-៩(\s]/;

// "បងណា" → "ណ": the letter shown in a seller's avatar.
export const initialOf = (name: string) => name.replace("បង", "").charAt(0);

// Today as "03-11-2026".
export function todayText(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
