"use client";

// New month: pick the month, the year and the start and end date of its first week. Both are made together,
// so a month always has a week to type orders into (the mockup's #month-dialog).
import { useState } from "react";
import { MONTH_NAMES, bookMonths, dayAfter, findMonth, monthId, monthLabel, shiftDay, weekRange } from "@/lib/periods";
import { TRASH_NAME, trashedMonth } from "@/lib/trash";
import { DateField } from "../DateField";
import { useSaleBook } from "../store";
import { Dialog } from "../ui";
import { followStart, readDates } from "./dates";

const pad = (n: number) => String(n).padStart(2, "0");

function MonthForm({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const book = useSaleBook();
  const { state } = book;
  // The month after the latest one; its first week starts the day after the latest week ends.
  const [start] = useState(() => {
    const months = bookMonths(state);
    const last = months[months.length - 1];
    if (!last) {
      const now = new Date();
      const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { m: now.getMonth() + 1, y: String(now.getFullYear()), from, to: shiftDay(from, 6) };
    }
    const lastWeek = last.weeks[last.weeks.length - 1];
    const m = (last.m % 12) + 1;
    const y = last.y + (last.m === 12 ? 1 : 0);
    const from = lastWeek ? dayAfter(lastWeek) : `${y}-${pad(m)}-01`;
    return { m, y: String(y), from, to: shiftDay(from, 6) };
  });
  const [m, setM] = useState(start.m);
  const [y, setY] = useState(start.y);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [endPicked, setEndPicked] = useState(false);
  const [error, setError] = useState<{ text: string; field: "m" | "y" | "from" | "to" } | null>(null);
  const bad = (f: string) => (error?.field === f ? true : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const year = Number(y);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return setError({ text: "បញ្ចូលឆ្នាំ ឧ. 2026", field: "y" });
    const existing = findMonth(state, monthId({ y: year, m }));
    if (existing) return setError({ text: `${monthLabel(existing)} មានរួចហើយ · ជ្រើសវានៅខាងលើ`, field: "m" });
    const held = trashedMonth(state, monthId({ y: year, m }));
    if (held) return setError({ text: `${monthLabel(held.month)} នៅក្នុង «${TRASH_NAME}» · ស្តារវិញ ឬលុបវាជារៀងរហូតសិន`, field: "m" });
    const dates = readDates(state, from, to);
    if ("error" in dates) return setError({ text: dates.error, field: dates.field });
    const id = await book.addMonth(year, m, { no: 1, ...dates });
    if (!id) return;
    book.setPick(id, 1);
    onDone(`បានបង្កើត${monthLabel({ y: year, m })} · អាទិត្យទី 1 · ${weekRange({ no: 1, ...dates })} · បញ្ចូលការបញ្ជាទិញដំបូងខាងក្រោម។`);
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="month-dialog-title">បង្កើតខែថ្មី</h2>
        <span className="sub">ខែថ្មីចាប់ផ្តើមដោយអាទិត្យទី 1 · អាទិត្យបន្ទាប់ បន្ថែមដោយប៊ូតុង «អាទិត្យថ្មី»</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" htmlFor="month-m">
          ខែ
          <select
            className="select"
            id="month-m"
            value={m}
            aria-invalid={bad("m")}
            aria-describedby="month-error"
            onChange={(e) => {
              setM(Number(e.target.value));
              setError(null);
            }}
          >
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="month-y">
          ឆ្នាំ
          <input
            className="input num"
            id="month-y"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            step={1}
            value={y}
            aria-invalid={bad("y")}
            aria-describedby="month-error"
            onChange={(e) => {
              setY(e.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <DateField
          id="month-date"
          label="អាទិត្យទី 1 ចាប់ពីថ្ងៃ"
          value={from}
          range={{ from, to }}
          invalid={bad("from")}
          describedBy="month-error"
          onChange={(v) => {
            setFrom(v);
            setTo(followStart(v, to, endPicked));
            setError(null);
          }}
        />
        <DateField
          id="month-end"
          label="ដល់ថ្ងៃ"
          value={to}
          min={from}
          range={{ from, to }}
          invalid={bad("to")}
          describedBy="month-error"
          onChange={(v) => {
            setTo(v);
            setEndPicked(true);
            setError(null);
          }}
        />
      </div>
      {error && (
        <span className="field-error" id="month-error" role="alert">
          {error.text}
        </span>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-default" onClick={onClose}>
          បោះបង់
        </button>
        <button type="submit" className="btn btn-primary">
          បង្កើតខែ
        </button>
      </div>
    </form>
  );
}

export default function MonthDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (text: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="month-dialog-title" id="month-dialog">
      <MonthForm onClose={onClose} onDone={onDone} />
    </Dialog>
  );
}
