// Checks for the start and end date of a week (new week, new month, «កែថ្ងៃ»), as in the mockup's readDates.
import { dayCount, flipDate, monthLabel, shiftDay, weekLabel, weekOverlapping, weekRange } from "@/lib/periods";
import type { SaleBookState } from "@/lib/types";

// from / to are date input values ("2026-10-03"). Gives the week's dates as "03-10-2026", or what is wrong and where.
// except = the week whose dates are being changed, which may overlap itself.
export function readDates(
  s: SaleBookState,
  from: string,
  to: string,
  except?: { month: string; no: number },
): { date: string; end: string } | { error: string; field: "from" | "to" } {
  if (!from) return { error: "ជ្រើសថ្ងៃចាប់ផ្តើម", field: "from" };
  if (!to) return { error: "ជ្រើសថ្ងៃបញ្ចប់", field: "to" };
  if (to < from) return { error: "ថ្ងៃបញ្ចប់ត្រូវនៅថ្ងៃដដែល ឬក្រោយថ្ងៃចាប់ផ្តើម", field: "to" };
  if (dayCount(from, to) > 31) return { error: "មួយអាទិត្យមិនលើស 31 ថ្ងៃទេ", field: "to" };
  const hit = weekOverlapping(s, from, to, except);
  if (hit) return { error: `ថ្ងៃទីជាន់${weekLabel(hit.w)} (${weekRange(hit.w)}) ក្នុង${monthLabel(hit.mo)}`, field: "from" };
  return { date: flipDate(from), end: flipDate(to) };
}

// The end date follows the start (7 days in all) until it is picked by hand, or whenever it would fall before the start.
export const followStart = (from: string, to: string, endPicked: boolean) =>
  from && (!endPicked || !to || to < from) ? shiftDay(from, 6) : to;

// "7 ថ្ងៃ", or "—" while the dates do not make a week.
export const daysText = (from: string, to: string) => (from && to && to >= from ? `${dayCount(from, to)} ថ្ងៃ` : "—");
