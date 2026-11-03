// The notes of every week as one list, with what the page works out for each: seller and due date.
import { prefixOf } from "@/lib/format";
import { allWeeks, monthId } from "@/lib/periods";
import type { Month, Note, SaleBookState, Seller, Week } from "@/lib/types";
import { daysLeft, dueInfo, type DueInfo } from "./due";

export interface NoteItem extends Note {
  key: string; // the week it belongs to, "2026-10-3"
  mo: Month;
  w: Week;
  seller: string; // "" when no seller has the code's letters
  info: DueInfo;
  left: number | null; // days to the due day, null without one
}

export type Lookup = (code: string) => string;

// Seller of an order code. As in the mockup, a code may start with the seller's code (ហេង31 → បងណា)
// or with the seller's own name (រក្សា9 → រក្សា, whose code is ក្សា).
export function sellerLookup(sellers: Seller[]): Lookup {
  const map = new Map<string, string>();
  for (const s of sellers) map.set(s.name, s.name);
  for (const s of sellers) map.set(s.code, s.name);
  return (code) => map.get(prefixOf(code)) ?? "";
}

// Every note of every week, oldest month first, in the order they were added.
export function noteItems(s: SaleBookState, today: Date, sellerOf: Lookup): NoteItem[] {
  return allWeeks(s).flatMap(({ mo, w, key }) =>
    (s.notes[key] ?? []).map((n) => {
      const info = dueInfo(n.due, mo, today);
      return { ...n, key, mo, w, seller: sellerOf(n.code), info, left: daysLeft(info, today) };
    }),
  );
}

export const sum = (list: NoteItem[]) => list.reduce((a, i) => a + i.amount, 0);
// Money still to collect.
export const remaining = (list: NoteItem[]) => sum(list.filter((i) => !i.collected));
export const isLate = (i: NoteItem) => !i.collected && i.left !== null && i.left < 0;
// Not collected and due today or within the next 7 days.
export const isSoon = (i: NoteItem) => !i.collected && i.left !== null && i.left >= 0 && i.left <= 7;
export const inMonth = (i: NoteItem, mo: Month) => monthId(i.mo) === monthId(mo);
