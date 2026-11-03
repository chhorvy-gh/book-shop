"use client";

// Profit by seller (mockup/sellers.html): one card per seller for the week or month picked, with the shop's share
// and what is left for the seller. The share box is a what-if: it starts from the book's share and is not saved.
import { useState } from "react";
import Link from "next/link";
import { fmt, initialOf, pct } from "@/lib/format";
import { bySeller, martLabel, monthLabel, picked, weekLabel, weekRange, weekShort, type SellerLine } from "@/lib/periods";
import type { Week } from "@/lib/types";
import { Icon } from "../icons";
import PeriodBar from "../PeriodBar";
import { useSaleBook } from "../store";
import { Tabs } from "../ui";

type Sort = "list" | "rest";

// A long list shows this many rows, the last one being the "more" button.
const SHOW = 6;

interface Row {
  name: string;
  code: string;
  profit: number;
  share: number;
  amount: number;
  orders: number;
  lines: SellerLine[] | null; // a week: its order lines
  weeks: { w: Week; profit: number; orders: number }[] | null; // a whole month: one line per week
}

export default function SellersPage() {
  const { state } = useSaleBook();
  const { month: mo, week: w } = picked(state);
  // The share box as typed, and the share in use; until something is typed it follows the book's share.
  const [typed, setTyped] = useState<{ text: string; share: number } | null>(null);
  const share = typed?.share ?? state.share;
  const [sort, setSort] = useState<Sort>("list");
  // Sellers whose card shows every line instead of the first few.
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // One row per seller for the period: a week lists its orders, a whole month lists one line per week.
  const weeks = w ? [w] : mo.weeks;
  const per = weeks.map((x) => bySeller(state, mo, x));
  const rows: Row[] = state.sellers.map(({ name, code }) => {
    const profit = per.reduce((a, p) => a + p[name].profit, 0);
    const cut = Math.round((profit * share) / 100);
    return {
      name,
      code,
      profit,
      share: cut,
      amount: profit - cut,
      orders: per.reduce((a, p) => a + p[name].lines.length, 0),
      lines: w ? per[0][name].lines : null,
      weeks: w ? null : weeks.map((x, k) => ({ w: x, profit: per[k][name].profit, orders: per[k][name].lines.length })),
    };
  });

  // "list" keeps the order of the seller list; "rest" puts the biggest profit first.
  const ordered = sort === "rest" ? [...rows].sort((a, b) => b.profit - a.profit) : rows;
  const sum = (key: "profit" | "share" | "amount") => rows.reduce((a, r) => a + r[key], 0);

  const toggle = (name: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const orderItems = (r: Row) =>
    (r.lines ?? []).map((l, k) => (
      <li key={k}>
        <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
          <span className="no">#{l.no}</span>
          <span>{l.code}</span>
          {l.mart !== "1" && <span className="sub">{martLabel(state, l.mart)}</span>}
        </span>
        <span className={l.profit < 0 ? "strong t-danger" : "strong"}>{fmt(l.profit)}</span>
      </li>
    ));

  const weekItems = (r: Row) =>
    !r.orders && !r.profit
      ? []
      : (r.weeks ?? []).map(({ w: x, profit, orders }) => (
          <li key={x.no}>
            <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
              <span>{weekLabel(x)}</span>
              <span className="sub">{`${weekShort(x)} · ${orders} ការបញ្ជាទិញ`}</span>
            </span>
            <span className={`strong${profit < 0 ? " t-danger" : profit ? "" : " muted"}`}>{fmt(profit)}</span>
          </li>
        ));

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">
            {`${monthLabel(mo)} · ${w ? `${weekLabel(w)} · ${weekRange(w)}` : `ទាំងខែ · ${mo.weeks.length} អាទិត្យ`}`}
          </span>
          <h1>ចំណេញតាមអ្នកលក់</h1>
        </div>
        <div className="actions">
          <label className="field" htmlFor="share" style={{ width: 120 }}>
            ភាគ (%)
            <input
              className="input num"
              id="share"
              type="number"
              min="0"
              max="100"
              step="1"
              value={typed?.text ?? String(state.share)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTyped({ text: e.target.value, share: isNaN(v) ? share : Math.min(100, Math.max(0, v)) });
              }}
            />
          </label>
          <Tabs<Sort>
            id="sort-tabs"
            label="តម្រៀប"
            style={{ marginBottom: 2 }}
            value={sort}
            onPick={setSort}
            items={[
              { key: "list", label: "តាមលំដាប់តារាង" },
              { key: "rest", label: "ច្រើនបំផុត" },
            ]}
          />
        </div>
      </header>

      <PeriodBar mode="month-or-week" addLink tabsLabel="មើលតាមខែ ឬតាមអាទិត្យ" />

      <section className="kpis" aria-label="សរុប">
        <div className="kpi">
          <div className="kpi-label">
            <span id="k-profit-label">{`ចំណេញសរុប · ${rows.length} នាក់`}</span>
          </div>
          <span className="kpi-value" id="k-profit">
            {fmt(sum("profit"))}
          </span>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <span id="k-share-label">{`ភាគ ${pct(share)}`}</span>
          </div>
          <span className="kpi-value" id="k-share">
            {fmt(sum("share"))}
          </span>
        </div>
        <div className="kpi is-accent">
          <div className="kpi-label">
            <span id="k-rest-label">{`លុយនៅសល់ ${pct(100 - share)} · ទៅទូទាត់`}</span>
          </div>
          <span className="kpi-value" id="k-rest">
            {fmt(sum("amount"))}
          </span>
        </div>
      </section>

      <section className="seller-grid" id="cards" aria-label="អ្នកលក់">
        {ordered.map((r) => {
          const items = w ? orderItems(r) : weekItems(r);
          // A long list shows its first lines and a button in the last row, so every card stays the same height until opened.
          // The button stays the same element when toggled, so keyboard focus stays on it.
          let list = items;
          if (items.length > SHOW) {
            const isOpen = open.has(r.name);
            const hidden = items.length - (SHOW - 1);
            list = [
              ...(isOpen ? items : items.slice(0, SHOW - 1)),
              <li className="more" key="more">
                <button type="button" className="more-btn" data-more={r.name} aria-expanded={isOpen} onClick={() => toggle(r.name)}>
                  {isOpen ? "បង្ហាញតិចវិញ" : `មើលបន្ថែម · ${hidden} ទៀត`}
                  <Icon name={isOpen ? "up" : "down"} size={16} />
                </button>
              </li>,
            ];
          }
          if (!list.length) {
            list = [
              <li className="empty" key="empty">
                {w ? "មិនមានការបញ្ជាទិញអាទិត្យនេះ" : "មិនមានការបញ្ជាទិញខែនេះ"}
              </li>,
            ];
          }
          return (
            <article className="card seller-card" key={r.name}>
              <header>
                <span className="avatar" aria-hidden="true">
                  {initialOf(r.name)}
                </span>
                <span className="stack">
                  <b style={{ fontSize: 15 }}>{r.name}</b>
                  <span className="sub">{`កូដ ${r.code} · ${r.orders} ការបញ្ជាទិញ`}</span>
                </span>
              </header>
              <ul className="order-list">{list}</ul>
              <dl>
                <div>
                  <dt>ចំណេញសរុប</dt>
                  <dd className="strong">{fmt(r.profit)}</dd>
                </div>
                <div>
                  <dt>{`ភាគ ${pct(share)}`}</dt>
                  <dd>{fmt(r.share)}</dd>
                </div>
                <div className="rest">
                  <dt>លុយនៅសល់</dt>
                  <dd>{fmt(r.amount)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <div className="callout">
        <span className="muted">លុយនៅសល់របស់អ្នកលក់ម្នាក់ៗ ចូលទៅតារាងទូទាត់ប្រចាំអាទិត្យ ដើម្បីដក បូក និងប្តូរជាដុល្លារ។</span>
        <Link className="btn btn-primary" href="/payout">
          ទៅទូទាត់ប្រចាំអាទិត្យ
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </>
  );
}
