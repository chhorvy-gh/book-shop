"use client";

// The dashboard (mockup index.html): the picked week's numbers, the month's weekly payouts as bars, the best sellers,
// the weekly workflow with where each step stands, and what to check, all worked out from the book.
import Link from "next/link";
import { fmt, prefixOf, usd } from "@/lib/format";
import {
  martList,
  monthLabel,
  monthPayout,
  payoutRows,
  pickedWeek,
  sellerByCode,
  settlementSheet,
  weekLabel,
  weekMarts,
  weekOrders,
  weekRange,
  weekTotals,
} from "@/lib/periods";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { chipClass, type Tone } from "../ui";

type StepState = "done" | "now" | "next";
const CHIP: Record<StepState, Tone> = { done: "success", now: "accent", next: "default" };

// [label, English label, value, line under it, extra class]
type Kpi = [string, string, string, string, string];

interface Alert {
  href: string;
  cls: "alert-warning" | "alert-danger";
  title: string;
  detail: string[]; // one line each
}

function KpiCard({ kpi: [label, en, value, sub, cls] }: { kpi: Kpi }) {
  return (
    <div className={`kpi ${cls}`.trim()}>
      <div className="kpi-label">
        <span>{label}</span>
        <span>{en}</span>
      </div>
      <span className="kpi-value">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}

export default function Overview() {
  const { state } = useSaleBook();
  const { month, week } = pickedWeek(state);
  const { rate, share } = state;

  // ---------- The picked week (nothing when the month has no week yet) ----------
  const rows = week ? payoutRows(state, month, week) : [];
  const live = week ? weekOrders(state, month, week).filter((o) => o.status !== "x") : [];
  const profit = rows.reduce((a, r) => a + r.profit, 0);
  const shareSum = rows.reduce((a, r) => a + r.share, 0);
  const owed = rows.reduce((a, r) => a + r.pay, 0);
  const payable = rows.filter((r) => r.pay > 0);
  const paidCount = payable.filter((r) => r.paid).length;

  // ---------- The month so far ----------
  const { totals, done: weeksDone, sum: monthTotal } = weekTotals(monthPayout(state, month));
  const sheet = settlementSheet(state, month);

  const kpis: Kpi[] = [
    ["ចំណេញ (ក្រោយកែតម្រូវ)", "Profit", fmt(profit), `ពី ${live.length} ការបញ្ជាទិញ ក្នុង ${martList(state)}`, ""],
    [`ភាគ ${share}%`, "Share", fmt(shareSum), `${share}% នៃចំណេញ`, ""],
    ["ត្រូវបើកអ្នកលក់", "Owed to sellers", fmt(owed), `${usd(owed, rate)} · ${payable.length} នាក់`, "is-accent"],
    ["ខែនេះ", "Month to date", fmt(monthTotal), `${usd(monthTotal, rate)} · ${weeksDone} នៃ 5 អាទិត្យ`, ""],
  ];

  // ---------- Bars: each week's payout, the tallest 190px high ----------
  const max = Math.max(...totals.filter((v): v is number => v !== null));
  const height = (v: number) => (max > 0 ? Math.max(0, Math.round((v / max) * 190)) : 0);
  const lastDone = totals.findLastIndex((v) => v !== null);

  // ---------- Best sellers: who gets the most this week (a seller owed nothing is left out) ----------
  const top = payable
    .slice()
    .sort((a, b) => b.pay - a.pay)
    .slice(0, 6);

  // ---------- The five steps of the week, with where things stand ----------
  const steps = [
    {
      href: "/sales",
      title: "បញ្ចូលការលក់",
      detail: "លុយដើម លុយលក់ ចំណេញ សម្រាប់ការបញ្ជាទិញនីមួយៗ",
      status: live.length ? `${live.length} រួចរាល់` : "មិនទាន់",
      done: live.length > 0,
    },
    {
      href: "/sellers",
      title: "ពិនិត្យចំណេញតាមអ្នកលក់",
      detail: `ចែកភាគ ${share}% និងលុយនៅសល់ ${100 - share}%`,
      status: live.length ? "រួចរាល់" : "មិនទាន់",
      done: live.length > 0,
    },
    {
      href: "/payout",
      title: "ទូទាត់ប្រចាំអាទិត្យ",
      detail: "ដក បូក ហើយប្តូរជាដុល្លារ",
      status: week ? `បានបើក ${paidCount}/${payable.length}` : "មិនទាន់",
      done: payable.length > 0 && paidCount === payable.length,
    },
    {
      href: "/monthly",
      title: "សង្ខេបប្រចាំខែ",
      detail: "បូកសរុបអាទិត្យទី 1 ដល់ 5",
      status: `${weeksDone}/5 អាទិត្យ`,
      done: sheet.closed || weeksDone === 5,
    },
    {
      href: "/settlement",
      title: "ទូទាត់ចុងខែ",
      detail: "កាត់លុយបើកមុន និងបំណុល",
      status: sheet.closed ? "បានបិទ" : "ចុងខែ",
      done: sheet.closed,
    },
  ];
  // The first step not done yet is the one to work on now.
  const nowAt = steps.findIndex((s) => !s.done);
  const stepState = (i: number): StepState => (steps[i].done ? "done" : i === nowAt ? "now" : "next");

  // ---------- What to check, worked out from the data ----------
  const known = sellerByCode(state);
  const unknown = live.filter((o) => !known.has(prefixOf(o.code))).map((o) => o.code || `#${o.no}`);
  // Unpaid orders per mart, so the numbers can be found on the right sheet.
  const unpaid = week
    ? weekMarts(state, month, week)
        .map((m) => ({
          label: m.label,
          nos: m.orders
            .filter((o) => o.status === "u")
            .map((o) => o.no)
            .sort((a, b) => a - b),
        }))
        .filter((m) => m.nos.length)
    : [];
  const unpaidCount = unpaid.reduce((a, m) => a + m.nos.length, 0);
  // Sellers whose month-end total is below zero: they owe more than they earned, and it carries to next month.
  const owes = sheet.lines.filter((l) => l.total < 0).map((l) => l.name);
  const alerts: Alert[] = [];
  if (unknown.length) alerts.push({ href: "/sales", cls: "alert-warning", title: `${unknown.length} កូដមិនស្គាល់អ្នកលក់`, detail: [unknown.join(", ")] });
  if (unpaidCount)
    alerts.push({
      href: "/sales",
      cls: "alert-warning",
      title: `${unpaidCount} ការបញ្ជាទិញមិនទាន់បង់`,
      detail: unpaid.map((m) => `${m.label} · លេខ ${m.nos.join(", ")}`),
    });
  if (owes.length)
    alerts.push({ href: "/settlement", cls: "alert-danger", title: `${owes.length} នាក់ជំពាក់លើសលុយលក់`, detail: [`${owes.join(", ")} · យោងទៅខែក្រោយ`] });

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">{week ? `${weekLabel(week)} · ${weekRange(week)}` : monthLabel(month)}</span>
          <h1>ផ្ទាំងសង្ខេប</h1>
        </div>
        <div className="actions">
          <Link className="btn btn-default" href="/entry">
            <Icon name="phone" />
            បញ្ចូលលើទូរស័ព្ទ
          </Link>
          <Link className="btn btn-primary" href="/sales">
            <Icon name="plus" />
            បញ្ចូលការលក់
          </Link>
        </div>
      </header>

      <section className="kpis" aria-label="តួលេខសំខាន់">
        {week ? (
          kpis.map((k) => <KpiCard key={k[1]} kpi={k} />)
        ) : (
          // No week in this month yet: nothing to show for a week, but the month so far still counts.
          <>
            <div className="card empty-card">
              <span>មិនទាន់មានអាទិត្យក្នុងខែនេះ</span>
              <span>
                <Link href="/sales">បន្ថែមខែ ឬអាទិត្យ នៅតារាងលក់</Link>
              </span>
            </div>
            <KpiCard kpi={kpis[3]} />
          </>
        )}
      </section>

      <div className="split">
        <section className="card grow-3">
          <div className="card-head">
            <div className="stack">
              <h2>ទូទាត់អ្នកលក់ តាមអាទិត្យ</h2>
              <span className="sub num">{`${monthLabel(month)} · សរុប ${fmt(monthTotal)} · ${usd(monthTotal, rate)}`}</span>
            </div>
            <Link href="/monthly">មើលតារាងខែ</Link>
          </div>
          <div
            className="bars"
            role="img"
            aria-label={totals.map((v, i) => `អាទិត្យទី ${i + 1}: ${v === null ? "មិនទាន់" : fmt(v)}`).join("; ")}
          >
            {totals.map((v, i) =>
              v === null ? (
                <div className="bar-col" key={i}>
                  <b className="muted">មិនទាន់</b>
                  <div className="bar is-empty" />
                </div>
              ) : (
                <div className="bar-col" key={i}>
                  <b>{fmt(v)}</b>
                  <div className={i === lastDone ? "bar is-current" : "bar"} style={{ height: height(v) }} />
                </div>
              ),
            )}
          </div>
          <div className="bar-labels">
            {totals.map((_, i) => (
              <span key={i}>អាទិត្យទី {i + 1}</span>
            ))}
          </div>
        </section>

        <section className="card grow-2">
          <div className="card-head">
            <div className="stack">
              <h2>អ្នកលក់ល្អបំផុត</h2>
              <span className="sub">{week ? `លុយត្រូវបើក ${weekLabel(week)}` : monthLabel(month)}</span>
            </div>
            <Link href="/payout">មើលទាំងអស់</Link>
          </div>
          <ol className="rank num">
            {top.map((t, i) => (
              <li key={t.name}>
                <div className="line">
                  <span>
                    <span className="pos">{i + 1}</span>
                    <span className="strong">{t.name}</span>
                  </span>
                  <span className="strong">{fmt(t.pay)}</span>
                </div>
                <div className="meter">
                  <i style={{ width: `${Math.round((t.pay / top[0].pay) * 100)}%` }} />
                </div>
              </li>
            ))}
            {!top.length && (
              <li>
                <span className="muted">{live.length ? "គ្មានលុយ" : "មិនមានការបញ្ជាទិញអាទិត្យនេះ"}</span>
              </li>
            )}
          </ol>
        </section>
      </div>

      <div className="split">
        <section className="card grow-3">
          <div className="stack">
            <h2>ការងារប្រចាំអាទិត្យ</h2>
            <span className="sub">ធ្វើតាមលំដាប់ ពីបញ្ចូលការលក់ ដល់ទូទាត់ចុងខែ</span>
          </div>
          <ol className="steps">
            {steps.map((s, i) => {
              const st = stepState(i);
              return (
                <li key={s.href}>
                  <Link href={s.href} className={st === "now" ? "is-now" : ""}>
                    <span className={`dot is-${st}`}>{i + 1}</span>
                    <span className="stack">
                      <span className="strong">{s.title}</span>
                      <span className="sub">{s.detail}</span>
                    </span>
                    <span className={chipClass(CHIP[st])}>{s.status}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card grow-2">
          <div className="stack">
            <h2>ត្រូវពិនិត្យ</h2>
            <span className="sub">រកឃើញដោយស្វ័យប្រវត្តិពីតារាង</span>
          </div>
          <div className="stack" style={{ gap: 12, lineHeight: 1.6 }}>
            {alerts.map((a) => (
              <Link key={a.title} className={`alert ${a.cls}`} href={a.href}>
                <Icon name="alert" />
                <span className="stack" style={{ lineHeight: 1.45 }}>
                  <b>{a.title}</b>
                  {a.detail.map((d) => (
                    <span key={d} className="sub">
                      {d}
                    </span>
                  ))}
                </span>
              </Link>
            ))}
            {!alerts.length && (
              // Nothing found: the mockup's success banner.
              <div className="banner banner-success" role="status">
                <Icon name="check" size={20} />
                <span>គ្មានអ្វីត្រូវពិនិត្យទេ</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
