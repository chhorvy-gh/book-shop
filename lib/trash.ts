// «បានលុបថ្មីៗ» (recently deleted) for the pages: what is in it, what each thing is called, and why one cannot be
// restored as it is. The writes are in db.ts; the store leaves deleted things out of the book (see SaleBookState.trash).
import { flipDate, martLabel, monthId, monthLabel, weekEnd, weekLabel, weekOverlapping, weekRange } from "./periods";
import type { Deleted, Month, SaleBookState, TrashRef, Week } from "./types";

export const TRASH_NAME = "បានលុបថ្មីៗ";

export interface TrashEntry {
  ref: TrashRef;
  kind: string; // ខែ, អាទិត្យ or Mart
  title: string; // "ខែតុលា 2026", "អាទិត្យទី 3 · 03-10 – 09-10", "Mart 3"
  sub: string; // a month's weeks, or the month a week was in
  deleted: Deleted;
}

export const trashedMonth = (s: SaleBookState, id: string) => s.trash.months.find((t) => monthId(t.month) === id) ?? null;
// The month's weeks that are in «បានលុបថ្មីៗ». Their numbers stay taken (their orders still carry them) until each is
// restored or deleted for good.
export const trashedWeeks = (s: SaleBookState, mo: Month) => s.trash.weeks.filter((t) => monthId(t.month) === monthId(mo));
export const trashedWeek = (s: SaleBookState, mo: Month, no: number) => trashedWeeks(s, mo).find((t) => t.week.no === no) ?? null;

// Everything in «បានលុបថ្មីៗ», the latest deleted first.
export function trashEntries(s: SaleBookState): TrashEntry[] {
  const list: TrashEntry[] = [
    ...s.trash.months.map(({ month, deleted }) => ({
      ref: { kind: "month" as const, month: monthId(month) },
      kind: "ខែ",
      title: monthLabel(month),
      sub: month.weeks.length ? `${month.weeks.length} អាទិត្យ` : "មិនមានអាទិត្យ",
      deleted,
    })),
    ...s.trash.weeks.map(({ month, week, deleted }) => ({
      ref: { kind: "week" as const, month: monthId(month), no: week.no },
      kind: "អាទិត្យ",
      title: `${weekLabel(week)} · ${weekRange(week)}`,
      sub: monthLabel(month),
      deleted,
    })),
    ...s.trash.marts.map(({ id, deleted }) => ({
      ref: { kind: "mart" as const, id },
      kind: "Mart",
      title: martLabel(s, id),
      sub: "តារាងក្នុងគ្រប់អាទិត្យ",
      deleted,
    })),
  ];
  return list.sort((a, b) => b.deleted.at - a.deleted.at);
}

// Which orders belong to the thing, as the field and value to count them by.
export function ordersOf(ref: TrashRef): ["monthId" | "weekKey" | "mart", string] {
  if (ref.kind === "month") return ["monthId", ref.month];
  if (ref.kind === "week") return ["weekKey", `${ref.month}-${ref.no}`];
  return ["mart", ref.id];
}

// Why the thing cannot come back as it is, or null. A restored week must not share a day with a week in the book
// (one may have been made on its dates meanwhile), and a restored mart must not have another mart's name.
export function restoreProblem(s: SaleBookState, ref: TrashRef): string | null {
  const clash = (w: Week) => {
    const x = weekOverlapping(s, flipDate(w.date), flipDate(weekEnd(w)));
    return x
      ? `${weekLabel(w)} · ${weekRange(w)} ជាន់ថ្ងៃ${weekLabel(x.w)} · ${weekRange(x.w)} ក្នុង${monthLabel(x.mo)} · ប្តូរថ្ងៃអាទិត្យនោះសិន រួចស្តារម្តងទៀត។`
      : null;
  };
  if (ref.kind === "month") {
    const t = trashedMonth(s, ref.month);
    for (const w of t?.month.weeks ?? []) {
      const c = clash(w);
      if (c) return c;
    }
    return null;
  }
  if (ref.kind === "week") {
    const t = s.trash.weeks.find((x) => monthId(x.month) === ref.month && x.week.no === ref.no);
    return t ? clash(t.week) : null;
  }
  const name = martLabel(s, ref.id);
  return s.marts.some((id) => martLabel(s, id).toLowerCase() === name.toLowerCase())
    ? `ឈ្មោះ «${name}» ជាឈ្មោះរបស់ Mart មួយទៀតហើយ · ប្តូរឈ្មោះ Mart នោះសិន រួចស្តារម្តងទៀត។`
    : null;
}
