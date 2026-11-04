"use client";

// Profit by seller (mockup/sellers.html): the month week by week for every mart (MartTable), then one card per
// seller for the week or month picked, with the shop's share and what is left for the seller. The share box is a
// what-if: it starts from the book's share and is not saved.
import { useState } from "react";
import Link from "next/link";
import { fmt, initialOf, pct } from "@/lib/format";
import { bySeller, martLabel, monthLabel, picked, weekLabel, weekRange, weekShort, type SellerLine } from "@/lib/periods";
import type { Week } from "@/lib/types";
import { Icon } from "../icons";
import PeriodBar from "../PeriodBar";
import { useSaleBook } from "../store";
import { Tabs } from "../ui";
import SellerDetailDialog, { type SellerDetail } from "./SellerDetailDialog";
import MartTable from "./MartTable";

type Sort = "list" | "rest";

// Order codes compared with their numbers read as numbers: HENG2 before HENG10.
const byCode = new Intl.Collator(undefined, { numeric: true });

// A card's list shows at most this many lines. A longer one shows its first SHOW and a "more" button under them;
// opened, it stays SHOW lines tall and scrolls through the rest.
const SHOW = 10;

// Caps an opened list at the height of its first SHOW lines, borders included (offsetTop ignores the list's scrolling).
function capHeight(ul: HTMLUListElement | null, isOpen: boolean) {
  if (!ul) return;
  const first = ul.firstElementChild as HTMLElement | null;
  const last = ul.children[SHOW - 1] as HTMLElement | undefined;
  ul.style.maxHeight =
    isOpen && first && last ? `${last.offsetTop + last.offsetHeight - first.offsetTop + ul.offsetHeight - ul.clientHeight}px` : "";
}

// Opening a list scrolls it to the first line that was hidden, so the click visibly brings up more lines.
function scrollToHidden(listId: string) {
  requestAnimationFrame(() => {
    const ul = document.getElementById(listId);
    const first = ul?.firstElementChild as HTMLElement | null | undefined;
    const next = ul?.children[SHOW] as HTMLElement | undefined;
    if (ul && first && next) ul.scrollTo({ top: next.offsetTop - first.offsetTop, behavior: "smooth" });
  });
}

interface Row {
  name: string;
  code: string;
  profit: number;
  share: number;
  amount: number;
  orders: number;
  // The seller's orders by week (a week picked has one), weeks without orders left out. Each week's are by code, its
  // number read as a number (HENG2 before HENG10), then by order number. The card and the detail dialog both list these.
  groups: { w: Week; title: string; lines: SellerLine[] }[];
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
  // The seller whose orders are open in the detail dialog.
  const [detailOf, setDetailOf] = useState<string | null>(null);

  // One row per seller for the period, with its orders: the week's, or every week's in a whole month.
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
      groups: weeks
        .map((x, k) => ({ w: x, title: weekLabel(x), lines: [...per[k][name].lines].sort((a, b) => byCode.compare(a.code, b.code) || a.no - b.no) }))
        .filter((g) => g.lines.length),
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

  const period = `${monthLabel(mo)} · ${w ? `${weekLabel(w)} · ${weekRange(w)}` : `ទាំងខែ · ${mo.weeks.length} អាទិត្យ`}`;

  // The detail dialog's seller, from the book as it is now; a seller removed meanwhile closes it.
  const shown = rows.find((r) => r.name === detailOf);
  const detail: SellerDetail | null = shown ? { name: shown.name, code: shown.code, period, groups: shown.groups, martName: (m) => martLabel(state, m) } : null;

  // A card's lines: one per order. Order numbers start again each week, so when the orders fall in several weeks of the
  // month, each week's name and dates come above its orders.
  const orderItems = (r: Row) =>
    r.groups.flatMap((g) => [
      ...(r.groups.length > 1
        ? [
            <li className="week-head" key={`w${g.w.no}`}>
              <span>{g.title}</span>
              <span className="sub">{weekShort(g.w)}</span>
            </li>,
          ]
        : []),
      ...g.lines.map((l, k) => (
        <li key={`${g.w.no}-${k}`}>
          <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
            <span className="no">{l.no}</span>
            <span>{l.code}</span>
            {l.mart !== "1" && <span className="sub">{martLabel(state, l.mart)}</span>}
          </span>
          <span className={l.profit < 0 ? "strong t-danger" : "strong"}>{fmt(l.profit)}</span>
        </li>
      )),
    ]);

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">
            {period}
          </span>
          <h1>ចំណេញអ្នកលក់</h1>
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

      {/* The whole month week by week, whichever week is picked: sales, cost, profit and orders for each mart. */}
      <MartTable state={state} month={mo} />

      <section className="seller-grid" id="cards" aria-label="អ្នកលក់">
        {ordered.map((r, k) => {
          const items = orderItems(r);
          // A card is as tall as its lines, up to SHOW of them. A longer list shows its first SHOW and a button under them;
          // opened, every line is in a box SHOW lines tall that scrolls, and the button stays under the box to close it.
          // The button stays the same element when toggled, so keyboard focus stays on it.
          const long = items.length > SHOW;
          const isOpen = long && open.has(r.name);
          const listId = `seller-lines-${k}`;
          const list = !items.length
            ? [
                <li className="empty" key="empty">
                  {w ? "មិនមានការបញ្ជាទិញអាទិត្យនេះ" : "មិនមានការបញ្ជាទិញខែនេះ"}
                </li>,
              ]
            : long && !isOpen
              ? items.slice(0, SHOW)
              : items;
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
                <button
                  type="button"
                  className="more-btn detail-btn"
                  data-detail={r.name}
                  disabled={!r.orders}
                  title="មើលកូដការបញ្ជាទិញ ហើយចម្លង"
                  aria-label={`មើលលម្អិត ${r.name}`}
                  onClick={() => setDetailOf(r.name)}
                >
                  <Icon name="eye" size={16} />
                  លម្អិត
                </button>
              </header>
              <ul className={`order-list${isOpen ? " is-open" : ""}`} id={listId} ref={(el) => capHeight(el, isOpen)}>
                {list}
              </ul>
              {long && (
                <div className="list-more">
                  <button
                    type="button"
                    className="more-btn"
                    data-more={r.name}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    onClick={() => {
                      toggle(r.name);
                      if (!isOpen) scrollToHidden(listId);
                    }}
                  >
                    {isOpen ? "បង្ហាញតិចវិញ" : `មើលបន្ថែម · ${items.length - SHOW} ទៀត`}
                    <Icon name={isOpen ? "up" : "down"} size={16} />
                  </button>
                </div>
              )}
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

      <SellerDetailDialog detail={detail} onClose={() => setDetailOf(null)} />

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
