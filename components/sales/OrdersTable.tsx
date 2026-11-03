"use client";

// One mart's orders for the week (the mockup's #table-card): filter tabs and search, the table with cells that edit in
// place, totals over every matching row, the pager and the hint line.
import { useState } from "react";
import { fmt, latinDigits, prefixOf } from "@/lib/format";
import { STATUS, findCode, totals } from "@/lib/orders";
import type { Mart, Order } from "@/lib/types";
import { Icon } from "../icons";
import { MoneyCell, Tabs, chipClass, moveInColumn } from "../ui";

export type Filter = "all" | "paid" | "unpaid";
export const PAGE_SIZE = 30;
// An order's code and amounts when the week was opened (or the order added), so changed cells can say what they were.
export type Originals = Map<string, Pick<Order, "code" | "cost" | "sale">>;

interface Props {
  orders: Order[];
  marts: Mart[]; // every mart of the week, for the duplicate-code check
  names: Map<string, string>; // seller code → name
  originals: Originals;
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
  page: number;
  onPage: (p: number) => void;
  newId: string | null;
  onChange: (o: Order, patch: Partial<Pick<Order, "code" | "cost" | "sale">>) => void;
  onToggleStatus: (o: Order) => void;
  onEdit: (o: Order) => void;
  onPrint: (o: Order) => void;
  onDelete: (o: Order) => void;
}

const EDIT_ICON = (
  <svg className="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

// The seller of a code as a chip; a code no seller owns is flagged, except on a cancelled order.
function SellerChip({ name, cancelled }: { name?: string; cancelled: boolean }) {
  if (name) return <span className="chip">{name}</span>;
  return cancelled ? null : <span className="chip chip-warning">មិនស្គាល់អ្នកលក់</span>;
}

// One order. While the code is typed, the seller cell names the seller of the new code, or says the code is empty or
// already used this week (the box turns red and Enter stays on it). Enter, the arrows or leaving keep a good code;
// Esc, or leaving with a bad one, puts the code back as it was.
function Row({ o, props }: { o: Order; props: Props }) {
  const { marts, names, originals } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const orig = originals.get(o.id) ?? o;
  const cancelled = o.status === "x";
  const profit = o.sale - o.cost;
  const typed = draft === null ? null : latinDigits(draft.trim());
  const dup = typed ? findCode(marts, typed, o.id) : null;
  // The seller column is narrow: the chip says it short, the tooltip and screen readers get it in full.
  const problem = typed === null ? "" : !typed ? "បញ្ចូលកូដ" : dup ? `ស្ទួន #${dup.no}` : "";
  const full = dup ? `កូដនេះមានរួចហើយ · #${dup.no} ${dup.mart}` : problem;
  const codeEdited = o.code !== orig.code;
  const [label, tone] = [STATUS[o.status].label, STATUS[o.status].tone];

  // Keeps a good code; false (and stays put) when the code cannot be used.
  const commit = () => {
    if (typed === null) return true;
    if (problem) return false;
    if (typed !== o.code) props.onChange(o, { code: typed });
    setDraft(null);
    return true;
  };
  const money = (field: "cost" | "sale", what: string) => {
    const edited = o[field] !== orig[field];
    return (
      <td className="cell">
        <MoneyCell
          field={field}
          className={`cell-input quiet${edited ? " is-edited" : ""}`}
          value={o[field]}
          onChange={(n) => props.onChange(o, { [field]: n })}
          label={`${what} ការបញ្ជាទិញ ${o.no}`}
          title={edited ? `ដើម ${fmt(orig[field])}` : undefined}
          disabled={cancelled}
        />
      </td>
    );
  };

  return (
    <tr id={`order-${o.id}`} className={[o.id === props.newId ? "is-new" : "", cancelled ? "is-cancelled" : ""].filter(Boolean).join(" ") || undefined}>
      <td className="muted">{o.no}</td>
      <td className="cell">
        <input
          className={`cell-input quiet code${codeEdited && !problem ? " is-edited" : ""}${problem ? " is-invalid" : ""}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          data-field="code"
          value={draft ?? o.code}
          aria-label={`កូដ ការបញ្ជាទិញ ${o.no}`}
          aria-invalid={problem ? true : undefined}
          title={problem ? full : codeEdited ? `ដើម ${orig.code}` : undefined}
          disabled={cancelled}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (!commit()) setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!commit()) return;
              moveInColumn(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
            } else if (e.key === "Escape") {
              setDraft(null);
              const el = e.currentTarget;
              requestAnimationFrame(() => el.blur());
            }
          }}
        />
      </td>
      <td>
        {problem ? (
          <span className="chip chip-danger" title={full}>
            {problem}
          </span>
        ) : (
          <SellerChip name={names.get(prefixOf(typed ?? o.code))} cancelled={cancelled} />
        )}
      </td>
      {money("cost", "លុយដើម")}
      {money("sale", "លុយលក់")}
      <td className={`r strong ${cancelled || profit === 0 ? "muted" : profit < 0 ? "t-danger" : ""}`}>{fmt(profit)}</td>
      <td>
        <button
          type="button"
          className={chipClass(tone)}
          title="ចុចដើម្បីប្តូរស្ថានភាព"
          aria-label={`ការបញ្ជាទិញ ${o.no}: ${label}។ ចុចដើម្បីប្តូរ`}
          onClick={() => props.onToggleStatus(o)}
        >
          {label}
        </button>
      </td>
      <td>
        <div className="row-actions tight">
          <button type="button" className="row-btn" aria-label={`កែការបញ្ជាទិញ ${o.no}`} onClick={() => props.onEdit(o)}>
            <Icon name="edit" size={14} />
            កែ
          </button>
          <button type="button" className="row-btn" aria-label={`បោះពុម្ពវិក្កយបត្រ ការបញ្ជាទិញ ${o.no}`} title="បោះពុម្ពវិក្កយបត្រ" onClick={() => props.onPrint(o)}>
            <Icon name="print" size={14} />
          </button>
          <button type="button" className="row-btn is-danger" aria-label={`លុបការបញ្ជាទិញ ${o.no}`} title="លុប" onClick={() => props.onDelete(o)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Page numbers: all of them when there are few, otherwise the first, the last and those around the current page.
function pageList(pages: number, page: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = [0, page - 1, page, page + 1, pages - 1].filter((i, k, arr) => i >= 0 && i < pages && arr.indexOf(i) === k).sort((a, b) => a - b);
  const list: (number | null)[] = [];
  keep.forEach((i, k) => {
    if (k && i - keep[k - 1] > 1) list.push(null);
    list.push(i);
  });
  return list;
}

export default function OrdersTable(props: Props) {
  const { orders, names, filter, onFilter, query, onQuery, page, onPage } = props;
  const q = query.trim().toLowerCase();
  const matches = (o: Order) =>
    (filter === "all" || (filter === "paid" ? o.status === "p" : o.status === "u")) &&
    (!q || o.code.toLowerCase().includes(q) || (names.get(prefixOf(o.code)) ?? "").includes(q));
  const shown = orders.filter(matches);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const start = at * PAGE_SIZE;
  const rows = shown.slice(start, start + PAGE_SIZE);
  // Totals cover every row that matches the filter, on all pages.
  const sum = totals(shown);
  const n = (st?: "p" | "u") => orders.filter((o) => !st || o.status === st).length;

  const goPage = (p: number) => {
    onPage(p);
    const card = document.getElementById("table-card");
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <section className="card table-card grow-main" id="table-card">
      <div className="table-toolbar">
        <Tabs<Filter>
          label="តម្រងស្ថានភាព"
          id="filters"
          value={filter}
          onPick={onFilter}
          items={[
            { key: "all", label: "ទាំងអស់", count: n() },
            { key: "paid", label: "បានបង់", count: n("p") },
            { key: "unpaid", label: "មិនទាន់បង់", count: n("u") },
          ]}
        />
        <div className="search">
          <Icon name="search" size={16} />
          <input className="input" id="search" type="search" placeholder="ស្វែងរកកូដ ឬឈ្មោះអ្នកលក់" aria-label="ស្វែងរក" value={query} onChange={(e) => onQuery(e.target.value)} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="data fixed" style={{ minWidth: 780 }}>
          <colgroup>
            <col style={{ width: 60 }} />
            <col style={{ width: 108 }} />
            <col style={{ width: 124 }} />
            <col />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 148 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">លេខ</th>
              <th scope="col">
                <span className="th-edit">កូដ {EDIT_ICON}</span>
              </th>
              <th scope="col">អ្នកលក់</th>
              <th scope="col" className="r">
                <span className="th-edit">លុយដើម {EDIT_ICON}</span>
              </th>
              <th scope="col" className="r">
                <span className="th-edit">លុយលក់ {EDIT_ICON}</span>
              </th>
              <th scope="col" className="r">
                ចំណេញ
              </th>
              <th scope="col">ស្ថានភាព</th>
              <th scope="col">
                <span className="sr-only">សកម្មភាព</span>
              </th>
            </tr>
          </thead>
          <tbody id="rows">
            {rows.length ? (
              rows.map((o) => <Row key={o.id} o={o} props={props} />)
            ) : (
              <tr className="empty">
                <td colSpan={8}>{orders.length ? "គ្មានការបញ្ជាទិញត្រូវនឹងតម្រងនេះទេ" : "បញ្ជីនេះមិនទាន់មានការបញ្ជាទិញ · បញ្ចូលការបញ្ជាទិញដំបូងនៅខាងលើ"}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>សរុបគ្រប់ទំព័រ · {sum.count} ការបញ្ជាទិញ</td>
              <td className="r">{fmt(sum.cost)}</td>
              <td className="r">{fmt(sum.sale)}</td>
              <td className="r t-success">{fmt(sum.profit)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <nav className="pager" aria-label="ទំព័រ" hidden={!shown.length}>
        <span className="sub num">
          បង្ហាញ {start + 1}–{Math.min(start + PAGE_SIZE, shown.length)} នៃ {shown.length}
        </span>
        <div className="pager-pages" hidden={pages < 2}>
          <button type="button" aria-label="ទំព័រមុន" disabled={at === 0} onClick={() => goPage(at - 1)}>
            <Icon name="back" size={16} />
          </button>
          {pageList(pages, at).map((i, k) =>
            i === null ? (
              <span key={`gap${k}`} className="gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button key={i} type="button" aria-label={`ទំព័រ ${i + 1}`} aria-current={i === at ? "page" : undefined} onClick={() => goPage(i)}>
                {i + 1}
              </button>
            ),
          )}
          <button type="button" aria-label="ទំព័របន្ទាប់" disabled={at === pages - 1} onClick={() => goPage(at + 1)}>
            <Icon name="next" size={16} />
          </button>
        </div>
      </nav>
      <p className="table-note">ចុចលើកូដ លុយដើម ឬ លុយលក់ ដើម្បីកែ · Enter ទៅជួរបន្ទាប់ · Esc បោះបង់ · ចុចលើស្ថានភាព ដើម្បីប្តូរ។</p>
    </section>
  );
}
