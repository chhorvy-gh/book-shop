"use client";

// Month-end (mockup/settlement.html). The sheet works in dollars, with the columns of the sheet kept by hand:
// លក់ 5 អាទិត្យ (the month's weekly payouts in whole dollars, the Grand Total of the monthly summary page)
// − ដកមុន − កាត់បុងជំពាក់ = សរុប. What is typed is saved with the month; anything else (money added back)
// is written in the note.
import { useState } from "react";
import PeriodBar from "@/components/PeriodBar";
import { Icon } from "@/components/icons";
import { useSaleBook } from "@/components/store";
import { SavedInput, useNote } from "@/components/ui";
import { EXPORT_ERROR, downloadTable, type TableValue } from "@/lib/export";
import { cents, dollars, num } from "@/lib/format";
import { monthId, monthLabel, nextMonthLabel, picked, settlementSheet, weekLabel, type SettlementLine } from "@/lib/periods";

type Money = "advance" | "debt";

// Like the sheet kept by hand, the two deduction totals show plain numbers (they are dollars too).
const plain = (n: number) => cents(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
// "1, 2 និង 3"
const andList = (ns: number[]) => (ns.length > 1 ? `${ns.slice(0, -1).join(", ")} និង ${ns[ns.length - 1]}` : ns.join(""));
// A dollar amount cell, red below 0.
const red = (base: string, n: number) => (n < 0 ? `${base} t-danger` : base);

export default function SettlementPage() {
  const { state, setSettlementRow, closeMonth } = useSaleBook();
  // The month shown is shared with the other pages.
  const { month: mo } = picked(state);
  const id = monthId(mo);
  const sheet = settlementSheet(state, mo);
  const last = mo.weeks[mo.weeks.length - 1];
  const note = useNote();
  // Picking another month hides the export note.
  const [noteMonth, setNoteMonth] = useState(id);
  if (noteMonth !== id) {
    setNoteMonth(id);
    note.hide();
  }
  const [busy, setBusy] = useState(false);
  // What is being typed in a dollar box (month|seller|field → text), so the totals follow each keystroke;
  // the box itself saves after a pause.
  const [typing, setTyping] = useState<Record<string, string>>({});
  const typed = (l: SettlementLine, field: Money) => typing[`${id}|${l.name}|${field}`] ?? l[field];

  // Each line with what is in its boxes now.
  const rows = sheet.lines.map((l) => {
    const advance = typed(l, "advance");
    const debt = typed(l, "debt");
    // Rounded to the cent so typing 0.1 + 0.2 never shows a long tail.
    return { line: l, advance, debt, total: Math.round((l.grand - num(advance) - num(debt)) * 100) / 100 };
  });

  let advT = 0, debtT = 0, grandT = 0, totalT = 0, payT = 0, payN = 0, carryT = 0;
  const carry: string[] = [];
  for (const r of rows) {
    advT += num(r.advance);
    debtT += num(r.debt);
    grandT += r.line.grand;
    totalT += r.total;
    if (r.total > 0) {
      payT += r.total;
      payN += 1;
    }
    if (r.total < 0) {
      carryT += r.total;
      carry.push(r.line.name);
    }
  }

  // Saves the seller's whole row, starting from its saved values.
  const save = (l: SettlementLine, patch: Partial<Record<Money | "note", string>>) =>
    setSettlementRow(id, l.name, { advance: l.advance, debt: l.debt, note: l.note, ...patch });

  // The month's table as it stands on screen, all in dollars. សរុប stays a formula, so changing ដកមុន or
  // កាត់បំណុល in Excel updates it.
  const exportExcel = async () => {
    const blank = (v: string) => num(v) || null;
    const out: TableValue[][] = rows.map((r, i) => [
      i + 1,
      r.line.name,
      r.line.grand,
      blank(r.advance),
      blank(r.debt),
      { formula: "C{r}-D{r}-E{r}", result: r.total },
      r.line.note || null,
    ]);
    const sum = (k: number) =>
      out.reduce<number>((a, row) => {
        const v = row[k];
        return a + (v && typeof v === "object" ? v.result : typeof v === "number" ? v : 0);
      }, 0);
    const total = (col: string, k: number) => ({ formula: `SUM(${col}{first}:${col}{last})`, result: sum(k) });
    setBusy(true);
    try {
      await downloadTable({
        fileName: `ទូទាត់ចុងខែ ${monthLabel(mo)}.xlsx`,
        name: "ទូទាត់ចុងខែ",
        title: `ទូទាត់ចុងខែ · ${monthLabel(mo)}${sheet.closed ? " · បានបិទ" : last ? ` · ទិន្នន័យដល់${weekLabel(last)}` : ""}`,
        cols: [
          { head: "№", width: 5 },
          { head: "ឈ្មោះ", width: 14 },
          { head: "លក់ 5 អាទិត្យ", width: 14, usd0: true },
          { head: "ដកមុន", width: 11, money: true },
          { head: "កាត់បុងជំពាក់", width: 14, money: true },
          { head: "សរុប", width: 12, usd0: true },
          { head: "", width: 40 },
        ],
        rows: out,
        total: [null, "សរុប", total("C", 2), total("D", 3), total("E", 4), total("F", 5), null],
      });
      note.show(`បានទាញយក Excel · ទូទាត់ចុងខែ · ${monthLabel(mo)} · ${rows.length} នាក់។`);
    } catch {
      note.show(EXPORT_ERROR, true);
    }
    setBusy(false);
  };

  // A dollar box, kept as typed; Enter goes to the same box in the next row.
  const moneyCell = (r: (typeof rows)[number], field: Money, label: string) => {
    const k = `${id}|${r.line.name}|${field}`;
    return (
      <td className="cell">
        <SavedInput
          className={num(r[field]) !== 0 ? "cell-input is-minus" : "cell-input"}
          data-field={field}
          type="number"
          inputMode="decimal"
          step="any"
          placeholder="0"
          aria-label={`${label} សម្រាប់ ${r.line.name}`}
          value={r.line[field]}
          onSave={(v) => save(r.line, { [field]: v })}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setTyping((t) => ({ ...t, [k]: v }));
          }}
          onBlur={() =>
            setTyping((t) => {
              const next = { ...t };
              delete next[k];
              return next;
            })
          }
        />
      </td>
    );
  };

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">
            {`${monthLabel(mo)}${last ? ` · ទិន្នន័យដល់${weekLabel(last)}` : ""}`}
          </span>
          <h1>ទូទាត់ចុងខែ</h1>
        </div>
        <div className="actions" style={{ alignItems: "center" }}>
          <button type="button" className="btn btn-outline" id="export-btn" onClick={() => void exportExcel()} disabled={busy}>
            <Icon name="download" />
            នាំចេញ Excel
          </button>
          <button type="button" className="btn btn-primary" id="close-month" disabled={sheet.closed} onClick={() => closeMonth(id)}>
            {`បិទ${monthLabel(mo)}`}
          </button>
        </div>
      </header>

      <PeriodBar mode="month" addLink />
      {note.element}

      <div className="banner banner-warning" id="banner-open" role="note" hidden={sheet.closed || !sheet.missing.length}>
        <Icon name="info" size={20} />
        <span className="stack" style={{ lineHeight: 1.5 }}>
          <span className="strong">ខែនេះនៅមិនទាន់ចប់</span>
          <span style={{ fontSize: 13 }} id="open-text">
            {`តួលេខនឹងប្តូរ ពេលបញ្ចូលអាទិត្យទី ${andList(sheet.missing)}។ បិទខែ នៅពេលទូទាត់រួចរាល់។`}
          </span>
        </span>
      </div>
      <div className="banner banner-success" id="banner-closed" role="status" hidden={!sheet.closed}>
        <Icon name="check" size={20} />
        <span className="stack" style={{ lineHeight: 1.5 }}>
          <span className="strong" id="closed-title">{`បានបិទ${monthLabel(mo)}`}</span>
          <span style={{ fontSize: 13 }} id="closed-text">
            {`បំណុល ${carry.length} នាក់ (${dollars(cents(carryT))}) ផ្ទេរទៅជួរ «ដកមុន» ${nextMonthLabel(mo)}។`}
          </span>
        </span>
      </div>

      <section className="kpis" aria-label="សរុប">
        <div className="kpi is-accent">
          <div className="kpi-label">
            <span>ត្រូវបើកចុងខែ</span>
          </div>
          <span className="kpi-value" id="k-pay-usd">
            {dollars(cents(payT))}
          </span>
          <span className="kpi-sub" id="k-pay-sub">{`${payN} នាក់`}</span>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <span>ដកមុន និងបំណុល</span>
          </div>
          <span className="kpi-value" id="k-cut">
            {dollars(cents(advT + debtT))}
          </span>
          <span className="kpi-sub" id="k-cut-sub">{`ដកមុន ${dollars(cents(advT))} · បំណុល ${dollars(cents(debtT))}`}</span>
        </div>
        <div className="kpi is-danger">
          <div className="kpi-label">
            <span>យោងទៅខែក្រោយ</span>
          </div>
          <span className="kpi-value" id="k-carry">
            {dollars(cents(carryT))}
          </span>
          <span className="kpi-sub" id="k-carry-sub">
            {carry.length ? carry.join(", ") : "គ្មាន"}
          </span>
        </div>
      </section>

      <section className="card table-card" aria-label="តារាងទូទាត់ចុងខែ">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">№</th>
                <th scope="col">ឈ្មោះ</th>
                <th scope="col" className="r">
                  លក់ 5 អាទិត្យ
                </th>
                <th scope="col" className="r" style={{ width: 160 }}>
                  ដកមុន
                </th>
                <th scope="col" className="r" style={{ width: 160 }}>
                  កាត់បុងជំពាក់
                </th>
                <th scope="col" className="r">
                  សរុប
                </th>
                <th scope="col">
                  <span className="sr-only">កំណត់ចំណាំ</span>
                </th>
              </tr>
            </thead>
            <tbody id="rows">
              {rows.map((r, i) => (
                <tr key={r.line.name} data-i={i}>
                  <td className="muted">{i + 1}</td>
                  <td className="strong">{r.line.name}</td>
                  <td className={red("r strong", r.line.grand)}>{dollars(r.line.grand)}</td>
                  {moneyCell(r, "advance", "ដកមុន ($)")}
                  {moneyCell(r, "debt", "កាត់បុងជំពាក់ ($)")}
                  <td className={red("r strong", r.total)}>{dollars(r.total)}</td>
                  <td className="cell">
                    <SavedInput
                      className="cell-input note"
                      data-field="note"
                      type="text"
                      placeholder="បន្ថែមកំណត់ចំណាំ"
                      aria-label={`កំណត់ចំណាំ សម្រាប់ ${r.line.name}`}
                      value={r.line.note}
                      onSave={(v) => save(r.line, { note: v })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>សរុប</td>
                <td className={red("r", grandT)} id="t-grand">
                  {dollars(grandT)}
                </td>
                <td className="r" id="t-adv">
                  {plain(advT)}
                </td>
                <td className="r" id="t-debt">
                  {plain(debtT)}
                </td>
                <td className={red("r", cents(totalT))} id="t-total">
                  {dollars(cents(totalT))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
