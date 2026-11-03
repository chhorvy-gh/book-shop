"use client";

// One dialog for a new week inside the month on screen (number, start and end date; it starts with an empty sheet per
// mart) and for changing the dates of the week on screen («កែថ្ងៃ»; its orders stay as they are) — the mockup's #week-dialog.
import { useState } from "react";
import { dayAfter, flipDate, martList, monthId, monthLabel, shiftDay, weekEnd, weekLabel, weekRange } from "@/lib/periods";
import type { Month, Week } from "@/lib/types";
import { useSaleBook } from "../store";
import { Dialog } from "../ui";
import { daysText, followStart, readDates } from "./dates";

const pad = (n: number) => String(n).padStart(2, "0");

function WeekForm({ month, editing, onClose, onDone }: { month: Month; editing: Week | null; onClose: () => void; onDone: (text: string) => void }) {
  const book = useSaleBook();
  const { state } = book;
  const [start] = useState(() => {
    if (editing) return { no: String(editing.no), from: flipDate(editing.date), to: flipDate(weekEnd(editing)) };
    const last = month.weeks[month.weeks.length - 1];
    // The next number the month does not have yet (1–5), starting the day after the last week ends.
    let no = last ? last.no + 1 : 1;
    while (no > 5 || month.weeks.some((w) => w.no === no)) no = no > 5 ? 1 : no + 1;
    const from = last ? dayAfter(last) : `${month.y}-${pad(month.m)}-01`;
    return { no: String(no), from, to: shiftDay(from, 6) };
  });
  const [no, setNo] = useState(start.no);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [endPicked, setEndPicked] = useState(!!editing);
  const [error, setError] = useState<{ text: string; field: "no" | "from" | "to" } | null>(null);
  const id = monthId(month);
  const bad = (f: string) => (error?.field === f ? true : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      const dates = readDates(state, from, to, { month: id, no: editing.no });
      if ("error" in dates) return setError({ text: dates.error, field: dates.field });
      book.setWeekDates(id, editing.no, dates.date, dates.end);
      onDone(`បានប្តូរថ្ងៃ${weekLabel(editing)} · ${weekRange({ no: editing.no, ...dates })} ក្នុង${monthLabel(month)}។`);
      return;
    }
    const n = Number(no);
    if (!Number.isInteger(n) || n < 1 || n > 5) return setError({ text: "បញ្ចូលអាទិត្យទី 1 ដល់ 5", field: "no" });
    const same = month.weeks.find((w) => w.no === n);
    if (same) return setError({ text: `${weekLabel(same)} មានរួចហើយក្នុង${monthLabel(month)}`, field: "no" });
    const dates = readDates(state, from, to);
    if ("error" in dates) return setError({ text: dates.error, field: dates.field });
    const week: Week = { no: n, ...dates };
    book.addWeek(id, week);
    book.setPick(id, n);
    onDone(`បានបង្កើត${weekLabel(week)} · ${weekRange(week)} ក្នុង${monthLabel(month)} · បញ្ចូលការបញ្ជាទិញដំបូងខាងក្រោម។`);
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="week-dialog-title">{editing ? `កែថ្ងៃ${weekLabel(editing)}` : "បង្កើតអាទិត្យថ្មី"}</h2>
        <span className="sub">
          ក្នុង{monthLabel(month)}
          {editing ? " · ការបញ្ជាទិញក្នុងអាទិត្យនេះនៅដដែល" : ` · ${martList(state)} ចាប់ផ្តើមទទេ · លេខកូដចាប់ពី 1 វិញ (ហេង1, អិត1 …)`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" htmlFor="week-no">
          អាទិត្យទី
          <input
            className="input num"
            id="week-no"
            type="number"
            inputMode="numeric"
            min={1}
            max={5}
            step={1}
            value={no}
            disabled={!!editing}
            aria-invalid={bad("no")}
            aria-describedby="week-error"
            onChange={(e) => {
              setNo(e.target.value);
              setError(null);
            }}
          />
        </label>
        <div className="field">
          <span>ចំនួនថ្ងៃ</span>
          <span className="readout">{daysText(from, to)}</span>
        </div>
        <label className="field" htmlFor="week-date">
          ចាប់ពីថ្ងៃ
          <input
            className="input num"
            id="week-date"
            type="date"
            value={from}
            aria-invalid={bad("from")}
            aria-describedby="week-error"
            onChange={(e) => {
              setFrom(e.target.value);
              setTo(followStart(e.target.value, to, endPicked));
              setError(null);
            }}
          />
        </label>
        <label className="field" htmlFor="week-end">
          ដល់ថ្ងៃ
          <input
            className="input num"
            id="week-end"
            type="date"
            value={to}
            aria-invalid={bad("to")}
            aria-describedby="week-error"
            onChange={(e) => {
              setTo(e.target.value);
              setEndPicked(true);
              setError(null);
            }}
          />
        </label>
      </div>
      {error && (
        <span className="field-error" id="week-error" role="alert">
          {error.text}
        </span>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-default" onClick={onClose}>
          បោះបង់
        </button>
        <button type="submit" className="btn btn-primary">
          {editing ? "រក្សាទុក" : "បង្កើតអាទិត្យ"}
        </button>
      </div>
    </form>
  );
}

export default function WeekDialog({
  open,
  month,
  editing,
  onClose,
  onDone,
}: {
  open: boolean;
  month: Month;
  editing: Week | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="week-dialog-title" id="week-dialog">
      <WeekForm month={month} editing={editing} onClose={onClose} onDone={onDone} />
    </Dialog>
  );
}
