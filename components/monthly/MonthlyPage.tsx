"use client";

// Monthly summary (mockup/monthly.html): what each seller is paid in weeks 1–5, every month so far, and the «ដក»
// to take off before the Grand Total. «ដក» is saved with the month, as typed.
import { useState } from "react";
import Link from "next/link";
import PeriodBar from "@/components/PeriodBar";
import { Icon } from "@/components/icons";
import { useSaleBook } from "@/components/store";
import { SavedInput, Tabs } from "@/components/ui";
import { fmt, num, usd, usd0 } from "@/lib/format";
import { monthHistory, monthId, monthLabel, monthPayout, picked, weekTotals } from "@/lib/periods";

type Sort = "list" | "total";

const total = (vals: (number | null)[]) => vals.reduce<number>((a, v) => a + (v ?? 0), 0);
const largest = (vals: (number | null)[]) => Math.max(1, ...vals.filter((v): v is number => v !== null));

// One amount tinted by its share of the largest one in the table; a week not there yet is "—".
function Cell({ v, max }: { v: number | null; max: number }) {
  if (v === null) return <td className="r muted">—</td>;
  if (v < 0)
    return (
      <td className="cell">
        <span className="heat t-danger" style={{ background: "var(--danger-soft)" }}>
          {fmt(v)}
        </span>
      </td>
    );
  const pct = Math.round((v / max) * 28);
  return (
    <td className="cell">
      <span className={v ? "heat" : "heat muted"} style={{ background: `color-mix(in srgb, var(--accent) ${pct}%, transparent)` }}>
        {fmt(v)}
      </span>
    </td>
  );
}

export default function MonthlyPage() {
  const { state, setRate, setMonthDeduct } = useSaleBook();
  const [sort, setSort] = useState<Sort>("list");
  // What is being typed in a «ដក» box (month|seller → text), so the totals follow each keystroke;
  // the box itself saves after a pause.
  const [typing, setTyping] = useState<Record<string, string>>({});
  // The month shown is shared with the other pages.
  const { month: mo } = picked(state);
  const id = monthId(mo);
  const rate = state.rate;

  // Seller × week
  const pay = monthPayout(state, mo);
  const rows = state.sellers.map(({ name }, i) => ({ n: i + 1, name, weeks: pay[name], total: total(pay[name]) }));
  const { totals: weekSums, done, sum: grand } = weekTotals(pay);
  const maxCell = largest(rows.flatMap((r) => r.weeks));
  const saved = state.monthDeduct[id] ?? {};
  const deductOf = (name: string) => typing[`${id}|${name}`] ?? saved[name] ?? "";
  const deductSum = rows.reduce((a, r) => a + num(deductOf(r.name)), 0);
  const sorted = <T extends { total: number }>(list: T[]) => (sort === "total" ? [...list].sort((a, b) => b.total - a.total) : list);

  // Every month, oldest first, with the month picked above as the dark bar; then the seller rows split by month.
  const months = monthHistory(state);
  const monthTotals = months.map((h) => total(Object.values(h.totals)));
  const allMonths = total(monthTotals);
  const maxMonth = largest(monthTotals);
  const shown = months.find((h) => h.month === mo);
  const sampleNames = months.filter((h) => h.sample).map((h) => `ខែ${h.name}`);
  const partialNote = shown && shown.done < shown.weeks ? `ខែ${shown.name} មិនទាន់ចប់ (${shown.done} នៃ ${shown.weeks} អាទិត្យ)` : "";
  const sampleNote = sampleNames.length ? `${sampleNames.join(" ")} ជាលេខគំរូ` : "";
  const monthNote = [partialNote, sampleNote].filter(Boolean).join(" · ");
  const monthRows = state.sellers.map(({ name }, i) => {
    const vals = months.map((h) => h.totals[name] || 0);
    return { n: i + 1, name, vals, total: total(vals) };
  });
  const maxMonthCell = largest(monthRows.flatMap((r) => r.vals));

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">{`${monthLabel(mo)} · ${done} នៃ 5 អាទិត្យ`}</span>
          <h1>សង្ខេបប្រចាំខែ</h1>
        </div>
        <Tabs<Sort>
          id="sort-tabs"
          label="តម្រៀប"
          value={sort}
          onPick={setSort}
          items={[
            { key: "list", label: "តាមលំដាប់" },
            { key: "total", label: "សរុបច្រើនបំផុត" },
          ]}
        />
      </header>

      <PeriodBar mode="month" addLink>
        {/* The same saved rate as every page; empty or 0 is not saved, and leaving the box shows the saved rate again. */}
        <label className="period-month" htmlFor="rate">
          <Icon name="dollar" size={18} />
          <span>អត្រាប្តូរ 1 = $</span>
          <SavedInput
            className="input num"
            id="rate"
            type="number"
            inputMode="decimal"
            step="0.00001"
            min="0"
            value={String(rate)}
            onSave={(v) => setRate(num(v))}
          />
        </label>
      </PeriodBar>

      <section className="kpis" id="kpis" aria-label="សរុបខែ">
        <div className="kpi is-accent">
          <div className="kpi-label">
            <span>{`សរុប${monthLabel(mo)}`}</span>
          </div>
          <span className="kpi-value">{usd(grand, rate)}</span>
          <span className="kpi-sub">{fmt(grand)}</span>
        </div>
        {weekSums.map((v, k) =>
          v === null ? null : (
            <div className="kpi" key={k}>
              <div className="kpi-label">
                <span>{`អាទិត្យទី ${k + 1}`}</span>
              </div>
              <span className="kpi-value" style={{ fontSize: 24 }}>
                {fmt(v)}
              </span>
              <span className="kpi-sub">{usd(v, rate)}</span>
            </div>
          ),
        )}
      </section>

      <section className="card" aria-labelledby="months-title">
        <div className="card-head">
          <h2 id="months-title" style={{ fontSize: 16 }}>
            សរុបប្រចាំខែ
          </h2>
          <span className="sub" id="months-sub">{`${months.length} ខែ · សរុប ${fmt(allMonths)} · ${usd(allMonths, rate)}`}</span>
        </div>
        <div
          className="bars"
          id="month-bars"
          role="img"
          style={{ height: 200 }}
          aria-label={months.map((h, i) => `ខែ${h.name}: ${fmt(monthTotals[i])}`).join("; ")}
        >
          {months.map((h, i) => {
            const v = monthTotals[i];
            return (
              <div className="bar-col" key={`${h.y}-${h.m}`} title={`ខែ${h.name} · ${fmt(v)} · ${usd(v, rate)}${h.sample ? " · លេខគំរូ" : ""}`}>
                <b>{fmt(v)}</b>
                <div className={h === shown ? "bar is-current" : "bar"} style={{ height: `${Math.round((Math.max(0, v) / maxMonth) * 150)}px` }} />
              </div>
            );
          })}
        </div>
        <div className="bar-labels" id="month-labels">
          {months.map((h, i) => (
            <span key={`${h.y}-${h.m}`}>
              ខែ{h.name}
              <br />
              {usd0(monthTotals[i], rate)}
              {h.done < h.weeks ? ` · ${h.done}/${h.weeks} អាទិត្យ` : ""}
            </span>
          ))}
        </div>
        <p className="sub" id="months-note" style={{ margin: 0 }}>
          {monthNote}
        </p>
      </section>

      <section className="card table-card" aria-label="តារាងខែ">
        <div className="table-toolbar">
          <span className="strong">សរុបតាមអ្នកលក់ អាទិត្យទី 1 ដល់ 5</span>
          <span className="sub">ពណ៌ក្រាស់ = ចំណែកធំក្នុងអាទិត្យនោះ</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr id="head-row">
                <th scope="col">№</th>
                <th scope="col">ឈ្មោះ</th>
                {/* A week that is in reads darker than one still to come. */}
                {weekSums.map((v, k) => (
                  <th scope="col" className="r" key={k} style={v === null ? undefined : { color: "var(--fg)" }}>
                    {`អាទិត្យ${k + 1}`}
                  </th>
                ))}
                <th scope="col" className="r">
                  សរុប
                </th>
                <th scope="col" className="r">
                  សរុប $
                </th>
                <th scope="col" className="r">
                  ដក
                </th>
                <th scope="col" className="r">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody id="rows">
              {sorted(rows).map((r) => {
                const k = `${id}|${r.name}`;
                const d = num(deductOf(r.name));
                return (
                  <tr key={r.name} data-n={r.n}>
                    <td className="muted">{r.n}</td>
                    <td className="strong">{r.name}</td>
                    {r.weeks.map((v, w) => (
                      <Cell key={w} v={v} max={maxCell} />
                    ))}
                    <td className="r strong">{fmt(r.total)}</td>
                    <td className="r t-accent">{usd(r.total, rate)}</td>
                    <td className="cell">
                      <SavedInput
                        className={d !== 0 ? "cell-input is-minus" : "cell-input"}
                        data-field="deduct"
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={`ដក សម្រាប់ ${r.name}`}
                        value={saved[r.name] ?? ""}
                        onSave={(v) => setMonthDeduct(id, r.name, v)}
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
                    <td className="r strong">{usd0(r.total - d, rate)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr id="foot-row">
                <td colSpan={2}>សរុប</td>
                {weekSums.map((v, k) => (
                  <td className={v === null ? "r muted" : "r"} key={k}>
                    {v === null ? "—" : fmt(v)}
                  </td>
                ))}
                <td className="r">{fmt(grand)}</td>
                <td className="r t-accent">{usd(grand, rate)}</td>
                <td className="r">{deductSum ? fmt(deductSum) : "0"}</td>
                <td className="r">{usd0(grand - deductSum, rate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card table-card" aria-label="សរុបតាមអ្នកលក់ តាមខែ">
        <div className="table-toolbar">
          <span className="strong">សរុបតាមអ្នកលក់ តាមខែ</span>
          <span className="sub" id="month-table-note">
            {monthNote}
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr id="m-head-row">
                <th scope="col">№</th>
                <th scope="col">ឈ្មោះ</th>
                {months.map((h) => (
                  <th scope="col" className="r" key={`${h.y}-${h.m}`}>
                    ខែ{h.name}
                    {h.done < h.weeks && (
                      <>
                        {" "}
                        <span className="sub">{`${h.done}/${h.weeks}`}</span>
                      </>
                    )}
                  </th>
                ))}
                <th scope="col" className="r">
                  សរុប
                </th>
                <th scope="col" className="r">
                  សរុប $
                </th>
              </tr>
            </thead>
            <tbody id="m-rows">
              {sorted(monthRows).map((r) => (
                <tr key={r.name}>
                  <td className="muted">{r.n}</td>
                  <td className="strong">{r.name}</td>
                  {r.vals.map((v, k) => (
                    <Cell key={k} v={v} max={maxMonthCell} />
                  ))}
                  <td className="r strong">{fmt(r.total)}</td>
                  <td className="r t-accent">{usd(r.total, rate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr id="m-foot-row">
                <td colSpan={2}>សរុប</td>
                {monthTotals.map((v, k) => (
                  <td className="r" key={k}>
                    {fmt(v)}
                  </td>
                ))}
                <td className="r">{fmt(allMonths)}</td>
                <td className="r t-accent">{usd(allMonths, rate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="callout">
        <span className="muted">ចុងខែ យកសរុប 5 អាទិត្យនេះ ទៅកាត់លុយបើកមុន និងបំណុល។</span>
        <Link className="btn btn-primary" href="/settlement">
          ទៅទូទាត់ចុងខែ
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </>
  );
}
