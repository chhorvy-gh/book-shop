// Due dates of pay-later notes, ported from the mockup. A note's due counts from its own month:
// "5" is the 5th of that month, "YYYY-MM-DD" a set date, "next" the month after it, "" no date.
import { MONTH_NAMES } from "@/lib/periods";
import type { Month } from "@/lib/types";
import type { Tone } from "@/components/ui";

export interface DueInfo {
  key: string; // the group a note falls in: "d20261005", "n202611" (next month, no day yet), "z" (no date)
  label: string; // "ថ្ងៃ5", "ថ្ងៃ10 ខែ09", "ខែវិច្ឆិកា · មិនទាន់កំណត់ថ្ងៃ", "គ្មានថ្ងៃកំណត់"
  date: Date | null;
  sort: number; // groups sort by this: dated ones by day, next month just before its first day, no date last
}

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");

// Today at midnight, so days left count whole days.
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// A day in this month reads "ថ្ងៃ5"; a day in another month also gets its month, "ថ្ងៃ10 ខែ09".
function dated(date: Date, today: Date): DueInfo {
  const thisMonth = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  return {
    key: `d${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    label: `ថ្ងៃ${date.getDate()}${thisMonth ? "" : ` ខែ${pad(date.getMonth() + 1)}`}`,
    date,
    sort: date.getTime(),
  };
}

export function dueInfo(due: string, mo: Pick<Month, "y" | "m">, today: Date): DueInfo {
  if (/^\d{1,2}$/.test(due)) return dated(new Date(mo.y, mo.m - 1, Number(due)), today);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (m) return dated(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), today);
  if (due === "next") {
    const first = new Date(mo.y, mo.m, 1);
    return {
      key: `n${first.getFullYear()}${pad(first.getMonth() + 1)}`,
      label: `ខែ${MONTH_NAMES[first.getMonth()]} · មិនទាន់កំណត់ថ្ងៃ`,
      date: null,
      sort: first.getTime() - 1,
    };
  }
  return { key: "z", label: "គ្មានថ្ងៃកំណត់", date: null, sort: 9.5e15 };
}

// Days from today to the due day (negative = late), or null without a day.
export const daysLeft = (info: DueInfo, today: Date) =>
  info.date ? Math.round((info.date.getTime() - today.getTime()) / DAY) : null;

// The status chip of a note (or of a due-date group): collected, late, today, or days to go.
export function dueStatus(info: DueInfo, collected: boolean, today: Date): { label: string; tone: Tone } {
  if (collected) return { label: "បានប្រមូល", tone: "success" };
  const left = daysLeft(info, today);
  if (left === null) return { label: info.key[0] === "n" ? "ខែក្រោយ" : "មិនទាន់កំណត់ថ្ងៃ", tone: "default" };
  if (left < 0) return { label: `ហួស ${-left} ថ្ងៃ`, tone: "danger" };
  if (left === 0) return { label: "ថ្ងៃនេះ", tone: "warning" };
  return { label: `នៅ ${left} ថ្ងៃ`, tone: left <= 7 ? "warning" : "default" };
}
