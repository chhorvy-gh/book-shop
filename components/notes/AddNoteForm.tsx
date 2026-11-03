"use client";

// Adds a pay-later note to a week. The week box follows the month and week on screen, until someone picks another one.
import { useImperativeHandle, useRef, useState } from "react";
import { latinDigits, parseMoney } from "@/lib/format";
import type { Lookup } from "@/lib/logic/notes";
import { bookMonths, findWeek, MONTH_NAMES, monthId, monthLabel, weekKey } from "@/lib/periods";
import type { Month, Week } from "@/lib/types";
import { DateField } from "../DateField";
import { useSaleBook } from "../store";

export interface AddNoteFormHandle {
  // "+ កំណត់ចំណាំ" on an unpaid order: fills the form with it, ready to pick a due day.
  fill: (key: string, order: { no: number; code: string; sale: number }) => void;
}

export default function AddNoteForm({
  ref,
  month,
  week,
  sellerOf,
  onAdded,
}: {
  ref?: React.Ref<AddNoteFormHandle>;
  month: Month | null; // the period on screen; null = every month
  week: Week | null; // null = the whole month
  sellerOf: Lookup;
  onAdded: (id: string, mo: Month, w: Week) => void;
}) {
  const { state, addNote } = useSaleBook();
  // A week picked in the box, kept only while the same period is on screen.
  const [weekPick, setWeekPick] = useState<{ period: string; key: string } | null>(null);
  const [no, setNo] = useState("");
  const [code, setCode] = useState("");
  const [due, setDue] = useState("5");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const noRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const months = bookMonths(state);
  const newestFirst = months.slice().reverse();
  const keys = newestFirst.flatMap((mo) => mo.weeks.map((w) => weekKey(mo, w)));
  const period = `${month ? monthId(month) : "all"}|${week?.no ?? ""}`;
  // The week on screen; for a whole month its last week, for every month the last week of the newest month.
  const screenMonth = month ?? months[months.length - 1];
  const screenWeek = week ?? screenMonth.weeks[screenMonth.weeks.length - 1];
  const fallback = screenWeek ? weekKey(screenMonth, screenWeek) : (keys[0] ?? "");
  const weekValue = weekPick && weekPick.period === period && keys.includes(weekPick.key) ? weekPick.key : fallback;

  // Codes are kept with Latin digits, as on the sales sheet ("ហេង៣១" → "ហេង31").
  const codeText = latinDigits(code.trim());
  const seller = codeText ? sellerOf(codeText) : "";

  useImperativeHandle(
    ref,
    () => ({
      fill: (key, order) => {
        setWeekPick({ period, key });
        setNo(String(order.no));
        setCode(order.code);
        setCodeError(false);
        setAmount(String(order.sale));
        setAmountError(false);
        formRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        dueRef.current?.focus({ preventScroll: true });
      },
    }),
    [period],
  );

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const money = parseMoney(amount);
    const badCode = !codeText;
    const badAmount = !(money > 0);
    if (badCode) setCodeError(true);
    if (badAmount) setAmountError(true);
    if (badCode || badAmount) {
      (badCode ? codeRef : amountRef).current?.focus();
      return;
    }
    const where = findWeek(state, weekValue);
    if (!where) return;
    const id = addNote(where.key, {
      no: parseInt(no, 10) || "—",
      code: codeText,
      due: due === "date" ? date : due,
      amount: money,
      note: note.trim(),
      collected: false,
      flagged: false,
    });
    // Ready for the next note of the same week.
    setWeekPick({ period, key: where.key });
    setNo("");
    setCode("");
    setDue("5");
    setDate("");
    setAmount("");
    setNote("");
    onAdded(id, where.mo, where.w);
    noRef.current?.focus();
  };

  return (
    <form
      ref={formRef}
      className="card"
      id="add-form"
      aria-label="បន្ថែមកំណត់ចំណាំ"
      style={{ padding: "20px 24px", gap: 14 }}
      noValidate
      onSubmit={submit}
    >
      <div className="card-head">
        <h2 style={{ fontSize: 16 }}>បន្ថែមកំណត់ចំណាំ</h2>
        <span className="sub">ការបញ្ជាទិញ ដែលអតិថិជនបង់ពេលក្រោយ តាមថ្ងៃកំណត់</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, alignItems: "start" }}>
        <label className="field" htmlFor="n-week">
          ខែ · អាទិត្យ
          <select className="select" id="n-week" value={weekValue} onChange={(e) => setWeekPick({ period, key: e.target.value })}>
            {newestFirst.map((mo) => (
              <optgroup key={monthId(mo)} label={monthLabel(mo)}>
                {mo.weeks.map((w) => (
                  <option key={w.no} value={weekKey(mo, w)}>
                    {`${MONTH_NAMES[mo.m - 1]} ${mo.y} · អាទិត្យ ${w.no}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="n-no">
          លេខ
          <input
            ref={noRef}
            className="input num"
            id="n-no"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="ឧ. 66"
            value={no}
            onChange={(e) => setNo(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="n-code">
          កូដ
          <input
            ref={codeRef}
            className="input"
            id="n-code"
            type="text"
            autoComplete="off"
            placeholder="ឧ. ហេង31"
            aria-describedby="n-code-hint"
            aria-invalid={codeError || undefined}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(false);
            }}
          />
          <span className={codeError ? "field-error" : `sub${codeText && !seller ? " t-warning" : ""}`} id="n-code-hint" style={{ fontWeight: 400 }}>
            {codeError ? "បញ្ចូលកូដ" : !codeText ? " " : seller ? `អ្នកលក់៖ ${seller}` : "មិនស្គាល់អ្នកលក់"}
          </span>
        </label>
        <label className="field" htmlFor="n-due">
          ថ្ងៃកំណត់
          <select ref={dueRef} className="select" id="n-due" value={due} onChange={(e) => setDue(e.target.value)}>
            <option value="5">ថ្ងៃ5</option>
            <option value="10">ថ្ងៃ10</option>
            <option value="15">ថ្ងៃ15</option>
            <option value="20">ថ្ងៃ20</option>
            <option value="25">ថ្ងៃ25</option>
            <option value="next">ខែក្រោយ</option>
            <option value="date">ជ្រើសថ្ងៃខែ…</option>
            <option value="">គ្មានថ្ងៃកំណត់</option>
          </select>
        </label>
        {due === "date" && <DateField id="n-date" label="ថ្ងៃខែ" value={date} onChange={setDate} clearable />}
        <label className="field" htmlFor="n-amount">
          ចំនួនលុយ
          <input
            ref={amountRef}
            className="input num"
            id="n-amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="ឧ. 424000"
            aria-describedby="n-amount-error"
            aria-invalid={amountError || undefined}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError(false);
            }}
          />
          <span className="field-error" id="n-amount-error" hidden={!amountError}>
            បញ្ចូលចំនួនលុយ ដែលធំជាង 0
          </span>
        </label>
        <label className="field" htmlFor="n-note">
          កំណត់ចំណាំ
          <input
            className="input"
            id="n-note"
            type="text"
            placeholder="ឧ. បង់ពាក់កណ្តាលសិន"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="field">
          <span aria-hidden="true">{" "}</span>
          <button type="submit" className="btn btn-primary">
            បន្ថែម
          </button>
        </div>
      </div>
    </form>
  );
}
