"use client";

// Quick calculator (mockup/calculator.html): paste a list with cost prices and the same list with sale prices,
// see each item's profit and the totals, then take the totals to the sales sheet or copy the list.
// The reading and matching of the lists is in lib/logic/calculator.ts.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { handItems } from "@/lib/calcItems";
import { copyText } from "@/lib/clipboard";
import { fmt, latinDigits, parseMoney, todayText, usd } from "@/lib/format";
import { hasMonths, martLabel, monthLabel, pickedWeek, weekLabel, weekRange } from "@/lib/periods";
import type { PriceItem } from "@/lib/types";
import {
  badLines,
  combine,
  costGap,
  listText,
  markupOf,
  orderItems,
  orderNote,
  parse,
  qtyText,
  saleOf,
  saleListOf,
  saleTemplate,
  totals,
  writtenCheck,
  type ItemLine,
  type Pricing,
} from "@/lib/logic/calculator";
import { Icon } from "../icons";
import { pagesOf, usePrices, useSaleBook } from "../store";
import { Tabs } from "../ui";

const EXAMPLE_COST = "23\nឆ្អឹងគោសាច់4គីឡូ44000\nគល់ស្លឹកគ្រៃ1គីឡូ7000\nមាន់ស្រែ2ក្បាល25000\nជើងមាន់2គីឡូ13000\nសាច់ជ្រូក2គីឡូ16000";
const EXAMPLE_SALE = "23\nឆ្អឹងគោសាច់4គីឡូ49000\nគល់ស្លឹកគ្រៃ1គីឡូ8000\nមាន់ស្រែ2ក្បាល26000\nជើងមាន់2គីឡូ15000\nសាច់ជ្រូក2គីឡូ17000";

// The lists, the sale prices typed in the table (by item name + quantity, so fixing a cost keeps the sale price),
// the markup % and its rounding, and the mart the order goes to. Kept on this device only: it is a scratch pad, not
// part of the book.
interface Draft {
  text: string;
  saleText: string;
  sales: Record<string, number>;
  markup: string;
  round: string;
  mart: string; // "" = the first mart
  day: string; // the day of the calculation ("04-11-2026"): when box ① got its first line; "" while it is empty
}
const DRAFT_KEY = "salebook.calculator";
const ROUNDS = ["100", "500", "1000"];
const EMPTY: Draft = { text: "", saleText: "", sales: {}, markup: "", round: "500", mart: "", day: "" };
// An empty KPI line keeps its height, so the tiles do not jump while typing.
const BLANK = " ";

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!d || typeof d !== "object") return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const sales = Object.fromEntries(
      Object.entries(d.sales && typeof d.sales === "object" ? d.sales : {}).filter((e): e is [string, number] => typeof e[1] === "number"),
    );
    return { text: str(d.text), saleText: str(d.saleText), sales, markup: str(d.markup), round: ROUNDS.includes(d.round) ? d.round : "500", mart: str(d.mart), day: str(d.day) };
  } catch {
    return null; // no storage or a broken draft: start empty
  }
}

function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* draft is optional */
  }
}

const profitClass = (p: number) => `strong ${p < 0 ? "t-danger" : p > 0 ? "t-success" : "muted"}`;

// A sale price cell: raw digits while typing, commas when done, Enter / arrows move between rows.
// Emptying it drops the typed price; leaving it shows the price from the lists or the % again.
function SaleCell({
  i,
  value,
  typed,
  title,
  label,
  onType,
}: {
  i: number;
  value: number | undefined;
  typed: boolean;
  title: string;
  label: string;
  onType: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={typed ? "cell-input is-edited" : "cell-input"}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      data-i={i}
      placeholder="វាយលុយលក់"
      aria-label={label}
      title={title}
      value={draft ?? (value === undefined ? "" : fmt(value))}
      onFocus={(e) => {
        setDraft(value === undefined ? "" : String(value));
        // After React has put the raw digits in.
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onType(e.target.value);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        const input = e.currentTarget;
        const inputs = Array.from(input.closest("tbody")?.querySelectorAll<HTMLInputElement>("input[data-i]") ?? []);
        const at = inputs.indexOf(input);
        const go = (target: HTMLInputElement | undefined) => (target ? target.focus() : input.blur());
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          go(inputs[at + 1]);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          go(inputs[at - 1]);
        }
      }}
    />
  );
}

// The cost on «តម្លៃលក់» for a line whose cost in box ① differs, in red: typed over, it is saved to «តម្លៃលក់» on Enter
// or when the cell is left (Esc puts it back), not each keystroke: the cell goes once the two costs agree, so saving as
// it is typed could make it vanish halfway through a longer number. Empty saves nothing.
function ListCostCell({ value, label, title, onSave }: { value: number; label: string; title: string; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  return (
    <input
      className="cell-input quiet"
      style={{ color: "var(--danger-soft-fg)", fontWeight: 600 }}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      title={title}
      value={draft ?? fmt(value)}
      onFocus={(e) => {
        cancel.current = false;
        setDraft(String(value));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const text = draft ?? "";
        setDraft(null);
        if (cancel.current || !text.trim()) return;
        const n = parseMoney(latinDigits(text));
        if (n >= 0 && n !== value) onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export default function Calculator() {
  const { state, access, updatePrice } = useSaleBook();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [copied, setCopied] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // The saved draft is read once mounted, so the server and the first browser render match.
  useEffect(() => {
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
    if (saved) setDraft(saved);
  }, []);

  // Every change is saved, and hides the "copied" line: what was copied no longer matches. The day of the calculation
  // is set when box ① gets its first line and goes when it is emptied, so a list left from yesterday keeps its day.
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ("text" in patch) next.day = !next.text.trim() ? "" : draft.text.trim() && draft.day ? draft.day : todayText();
    setDraft(next);
    setCopied(null);
    saveDraft(next);
  };

  // Until something is typed in box ②, it shows box ①'s items without their prices, each with its sale price from
  // «តម្លៃលក់» when the item is there (owners and members: viewers cannot read that list), the others left for the sale
  // price to be typed after them. Once box ② is typed in, a line there with no price yet ("test1 =") still takes its
  // sale price from «តម្លៃលក់» when the item is there, in the table (the box keeps what was typed). Lines still without
  // a price count as no sale price yet (the % still works for them).
  const { list: prices } = usePrices(pagesOf(access) === null);
  const codes = useMemo(() => new Set(state.sellers.map((s) => s.code)), [state.sellers]);
  const blank = useMemo(() => saleTemplate(draft.text, codes), [draft.text, codes]);
  const template = useMemo(() => saleTemplate(draft.text, codes, prices ?? []), [draft.text, codes, prices]);
  const saleShown = draft.saleText.trim() ? draft.saleText : template;
  const view = useMemo(
    () => combine(parse(draft.text, codes), saleListOf(saleShown, blank, template, prices ?? [], codes)),
    [draft.text, saleShown, blank, template, prices, codes],
  );
  // Lines whose cost in box ① is not the cost on «តម្លៃលក់»: row index → that item, the line's quantity of its unit, and
  // the cost it gives.
  const gaps = useMemo(() => {
    const found = new Map<number, { item: PriceItem; times: number; cost: number }>();
    view.rows.forEach((l, i) => {
      const gap = l.kind === "item" ? costGap(l, prices ?? []) : undefined;
      if (gap) found.set(i, gap);
    });
    return found;
  }, [view.rows, prices]);
  const pricing: Pricing = { sales: draft.sales, markup: markupOf(draft.markup), step: Number(draft.round) };
  const t = totals(view.rows, pricing);
  const rate = state.rate;

  // Compare the written total(s) with what the lines add up to.
  const parts = writtenCheck(view.written, t);
  const wrong = parts.filter((p) => p[1] !== p[2]);

  // Lines whose price after "=" is not numbers only, in each box; while there are any, nothing goes to the sales page.
  const badCost = useMemo(() => badLines(draft.text), [draft.text]);
  const badSale = useMemo(() => badLines(saleShown), [saleShown]);

  // The mart the order goes to (the one picked, while it is still a mart of the book).
  const martId = state.marts.includes(draft.mart) ? draft.mart : (state.marts[0] ?? "1");
  // And its week: the one picked on the pages, which the sales sheet opens ("ខែតុលា 2026 · អាទិត្យទី 3 · 03-10 – 09-10-2026").
  // Null while the book has no month yet.
  const at = hasMonths(state) ? pickedWeek(state) : null;
  // The day the table shows on each line: the calculation's, or today for a list from before days were kept. Lines only
  // show once the saved draft is read in the browser, so the server never draws a date.
  const day = draft.day || todayText();
  const period = at ? (at.week ? `${monthLabel(at.month)} · ${weekLabel(at.week)} · ${weekRange(at.week)}` : monthLabel(at.month)) : null;

  // A title that is a number ("1", "23") is the order's number on the sales sheet: its order there takes these amounts,
  // or a new order gets that number.
  const titleText = latinDigits(view.title?.trim() ?? "");
  const titleNo = /^\d+$/.test(titleText) && Number(titleText) > 0 ? Number(titleText) : null;

  // The sales page fills a new order with these, in that mart; the sale only when every item has one.
  const has = t.count > 0 && !t.noCost && !badCost.length && !badSale.length;
  const salesHref = has
    ? `/sales?cost=${t.cost}${t.profit !== null && t.sale ? `&sale=${t.sale}` : ""}&mart=${encodeURIComponent(martId)}${titleNo ? `&no=${titleNo}` : ""}&day=${day}`
    : "/sales";

  const typeSale = (key: string, text: string) => {
    const sales = { ...draft.sales };
    if (text.trim()) sales[key] = parseMoney(latinDigits(text));
    else delete sales[key];
    update({ sales });
  };

  // Typed prices are highlighted; prices from the lists or the % look plain.
  const saleTitle = (l: ItemLine, s: number | undefined) =>
    draft.sales[l.key] !== undefined
      ? "វាយក្នុងតារាង · លុបចេញ ដើម្បីប្រើតម្លៃពីបញ្ជី ឬ %"
      : l.listSale !== undefined
        ? l.fromList
          ? "ពីទំព័រ «តម្លៃលក់»"
          : "ពីបញ្ជីលុយលក់"
        : s === undefined
          ? ""
          : `គណនា +${pricing.markup}%`;

  const profitSub = !t.count
    ? BLANK
    : t.noCost
      ? `នៅខ្វះលុយដើម ${t.noCost} មុខ`
      : t.missing === t.count
        ? template
          ? "វាយលុយលក់នៅចុងជួរក្នុងប្រអប់ ②"
          : "បិទភ្ជាប់បញ្ជីលុយលក់ក្នុងប្រអប់ ②"
        : t.missing
          ? `នៅខ្វះលុយលក់ ${t.missing} មុខ`
          : t.sale
            ? `អត្រាចំណេញ ${(((t.profit ?? 0) / t.sale) * 100).toFixed(1)}%`
            : BLANK;

  return (
    <>
      <header className="page-head">
        <div className="stack">
          {/* The week an order made here goes to, as the sales sheet heads it. */}
          <span className="eyebrow">{period ?? "បិទភ្ជាប់បញ្ជីលុយដើម និងបញ្ជីលុយលក់ ហើយមើលចំណេញភ្លាមៗ"}</span>
          <h1>គណនារហ័ស</h1>
        </div>
      </header>

      <div className="split" style={{ gap: 20 }}>
        <section className="card grow-2" aria-labelledby="in-title">
          <div className="card-head">
            <h2 id="in-title" style={{ fontSize: 16 }}>
              បញ្ជីទំនិញ
            </h2>
            <span className="sub">មួយជួរ មួយមុខ</span>
          </div>

          <ol className="howto" aria-label="របៀបប្រើ">
            <li>
              <span className="step">1</span>បិទភ្ជាប់បញ្ជីដែលមាន <b>លុយដើម</b> ក្នុងប្រអប់ ①
            </li>
            <li>
              <span className="step">2</span>បិទភ្ជាប់បញ្ជីដដែល ដែលមាន <b>លុយលក់</b> ក្នុងប្រអប់ ②
            </li>
            <li>
              <span className="step">✓</span>កម្មវិធីផ្គូផ្គងតាមឈ្មោះទំនិញ ហើយគណនាចំណេញមុខនីមួយៗ
            </li>
          </ol>

          <div className="calc-boxes">
            <label className="field" htmlFor="text">
              ① បញ្ជីលុយដើម
              <textarea
                ref={textRef}
                className="input textarea"
                id="text"
                rows={10}
                spellCheck={false}
                aria-describedby={badCost.length ? "price-check tips" : "tips"}
                aria-invalid={badCost.length ? true : undefined}
                value={draft.text}
                onChange={(e) => update({ text: e.target.value })}
              />
            </label>
            <label className="field" htmlFor="sale-text">
              ② បញ្ជីលុយលក់
              <textarea
                className="input textarea"
                id="sale-text"
                rows={10}
                spellCheck={false}
                aria-describedby={badSale.length ? "price-check tips" : "tips"}
                aria-invalid={badSale.length ? true : undefined}
                value={saleShown}
                onChange={(e) => update({ saleText: e.target.value })}
              />
            </label>
          </div>
          {/* A price after "=" with anything but numbers in it: said at once, and the order waits until it is fixed. */}
          <div className="banner banner-danger" id="price-check" role="alert" hidden={!badCost.length && !badSale.length}>
            {(badCost.length > 0 || badSale.length > 0) && (
              <>
                <Icon name="alert" />
                <span>
                  <b>សូមបញ្ចូលតែលេខប៉ុណ្ណោះ</b> ក្រោយសញ្ញា = (ឧ. test 1 = 20000) · មិនដាក់អក្សរ ឬសញ្ញាផ្សេងទេ៖
                  {[...badCost.map((b) => ["①", ...b] as const), ...badSale.map((b) => ["②", ...b] as const)].map(([box, n, line]) => (
                    <Fragment key={`${box}${n}`}>
                      <br />
                      {`ប្រអប់ ${box} ជួរ ${n}៖ `}
                      <b>{line}</b>
                    </Fragment>
                  ))}
                </span>
              </>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn btn-outline" id="example-btn" onClick={() => update({ text: EXAMPLE_COST, saleText: EXAMPLE_SALE, sales: {} })}>
              ដាក់ឧទាហរណ៍
            </button>
            <button
              type="button"
              className="btn btn-default"
              id="clear-btn"
              onClick={() => {
                update({ text: "", saleText: "", sales: {} });
                textRef.current?.focus();
              }}
            >
              សម្អាត
            </button>
          </div>
          <ul className="sub" id="tips" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
            <li>ប្រអប់ ② យកឈ្មោះទំនិញពីប្រអប់ ① មកឲ្យ ហើយដាក់លុយលក់ពីទំព័រ «តម្លៃលក់» ឲ្យស្រាប់ · មុខដែលនៅខ្វះ វាយលុយលក់នៅចុងជួរ ឬបិទភ្ជាប់បញ្ជីលុយលក់ជំនួសវិញ។</li>
            <li>វាយឈ្មោះទំនិញដែលមានក្នុង «តម្លៃលក់» ក្នុងប្រអប់ ② ដោយមិនទាន់មានតម្លៃ (ឧ. test1 =) · កម្មវិធីយកលុយលក់ពីទីនោះឲ្យ។</li>
            <li>ឈ្មោះទំនិញក្នុងប្រអប់ទាំងពីរ គួរដូចគ្នា · បើខុសគ្នា កម្មវិធីផ្គូផ្គងតាមលំដាប់ជួរ ហើយប្រាប់អ្នកក្នុងតារាង។</li>
            <li>ឬសរសេរតម្លៃទាំងពីរក្នុងជួរតែមួយ ក្នុងប្រអប់ ① (ឆ្អឹងគោសាច់4គីឡូ44000 49000)។</li>
            <li>ជួរទីមួយដូចជា 23 ឬ ហេង23 = ចំណងជើង · ជួរចុងក្រោយមានតែលេខ = សរុបដែលអ្នកសរសេរ (កម្មវិធីពិនិត្យឲ្យ)។</li>
            <li>ចាប់ផ្តើមជួរដោយ - ឬ ដក ដើម្បីដកលុយ · លេខខ្មែរ ០–៩ ក៏បាន។</li>
            <li>ជួរដែលគ្មានលេខ (ដូចជា ដឹកថ្ងៃស្អែក) = កំណត់ចំណាំ · ចេញក្នុងតារាងលក់ ពេលដាក់ចូល។</li>
          </ul>
        </section>

        <section className="card grow-2" aria-labelledby="out-title">
          <div className="card-head">
            <h2 id="out-title" style={{ fontSize: 16 }}>
              លទ្ធផល
            </h2>
            <span className="chip chip-accent" id="title-chip" hidden={!view.title} title={titleNo ? "លេខការបញ្ជាទិញក្នុងតារាងលក់" : undefined}>
              {titleNo ? `ការបញ្ជាទិញ #${titleNo}` : (view.title ?? "")}
            </span>
          </div>

          <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div className="kpi" style={{ padding: "14px 16px", borderRadius: 16 }}>
              <div className="kpi-label">
                <span id="cost-label">{`លុយដើម · ${t.count} មុខ`}</span>
              </div>
              <span className="kpi-value" id="k-cost" aria-live="polite">
                {fmt(t.cost)}
              </span>
              <span className={`kpi-sub${t.noCost ? " t-warning" : ""}`} id="k-cost-sub">
                {t.noCost ? `នៅខ្វះ ${t.noCost} មុខ` : t.cost ? usd(t.cost, rate) : BLANK}
              </span>
            </div>
            <div className="kpi" style={{ padding: "14px 16px", borderRadius: 16 }}>
              <div className="kpi-label">
                <span>លុយលក់</span>
              </div>
              <span className="kpi-value" id="k-sale">
                {t.count && (t.sale || !t.missing) ? fmt(t.sale) : "—"}
              </span>
              <span className={`kpi-sub${t.missing && t.sale ? " t-warning" : ""}`} id="k-sale-sub">
                {!t.count ? BLANK : t.missing ? `នៅខ្វះ ${t.missing} មុខ` : usd(t.sale, rate)}
              </span>
            </div>
            <div className="kpi is-accent" style={{ padding: "14px 16px", borderRadius: 16 }}>
              <div className="kpi-label">
                <span>ចំណេញ</span>
              </div>
              <span className="kpi-value" id="k-profit" aria-live="polite">
                {t.profit === null || !t.count ? "—" : fmt(t.profit)}
              </span>
              <span className="kpi-sub" id="k-profit-sub">
                {profitSub}
              </span>
            </div>
          </div>

          <div className={parts.length ? `banner ${wrong.length ? "banner-warning" : "banner-success"}` : "banner"} id="check" role="status" hidden={!parts.length}>
            {parts.length > 0 &&
              (wrong.length ? (
                <>
                  <Icon name="alert" />
                  <span>
                    {wrong.map(([label, wv, tv], k) => (
                      <Fragment key={label}>
                        {k > 0 && <br />}
                        {label}ដែលសរសេរ <b className="num">{fmt(wv)}</b> ប៉ុន្តែបូកបាន <b className="num">{fmt(tv)}</b> · ខុស <b className="num">{fmt(Math.abs(wv - tv))}</b> ({wv > tv ? "សរសេរលើស" : "សរសេរខ្វះ"})
                      </Fragment>
                    ))}
                    ។
                  </span>
                </>
              ) : (
                <>
                  <Icon name="check" />
                  <span>
                    ត្រូវ ·{" "}
                    {parts.map(([label, wv], k) => (
                      <Fragment key={label}>
                        {k > 0 && " និង "}
                        {label} <b className="num">{fmt(wv)}</b>
                      </Fragment>
                    ))}{" "}
                    ដែលសរសេរ ស្មើនឹងការបូក។
                  </span>
                </>
              ))}
          </div>

          <div className="banner banner-warning" id="cost-check" role="status" hidden={!gaps.size}>
            {gaps.size > 0 && (
              <>
                <Icon name="alert" />
                <span>
                  លុយដើមខុសពីទំព័រ «តម្លៃលក់» {gaps.size} មុខ៖
                  {[...gaps].map(([i, gap]) => {
                    const typed = (view.rows[i] as ItemLine).amount ?? 0;
                    return (
                      <Fragment key={i}>
                        <br />
                        {gap.item.name} · បញ្ជីសរសេរ <b className="num">{fmt(typed)}</b> ប៉ុន្តែ «តម្លៃលក់» មាន <b className="num">{fmt(gap.cost)}</b> · ខុស{" "}
                        <b className="num">{fmt(Math.abs(typed - gap.cost))}</b> ({typed > gap.cost ? "ថ្លៃជាង" : "ថោកជាង"})
                      </Fragment>
                    );
                  })}
                  <br />
                  <span className="sub">ចេញជាកំណត់ចំណាំក្នុងតារាងលក់ ពេលចុច «ដាក់ចូលតារាងលក់»។</span>
                </span>
              </>
            )}
          </div>

          <div className="table-wrap" style={{ margin: "0 -24px" }}>
            <table className="data">
              <thead>
                <tr>
                  {/* The order's number on the sales sheet: the list's first line when it is a number ("1"). */}
                  <th scope="col" title="លេខការបញ្ជាទិញ · សរសេរនៅជួរទីមួយក្នុងប្រអប់ (ឧ. 1)">
                    លេខ
                  </th>
                  <th scope="col" title="ថ្ងៃដែលគណនា · ចាប់ពីពេលសរសេរជួរទីមួយក្នុងប្រអប់ ①">
                    ថ្ងៃ
                  </th>
                  <th scope="col">ទំនិញ</th>
                  <th scope="col" className="r">
                    ចំនួន
                  </th>
                  <th scope="col" className="r">
                    លុយដើម
                  </th>
                  <th scope="col" className="r">
                    <span className="th-edit">
                      លុយលក់{" "}
                      <svg
                        className="icon"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 20h4L19 9l-4-4L4 16z" />
                        <path d="M13.5 6.5l4 4" />
                      </svg>
                    </span>
                  </th>
                  <th scope="col" className="r">
                    ចំណេញ
                  </th>
                  {gaps.size > 0 && (
                    <th scope="col" className="r">
                      <span className="t-danger">លុយដើម «តម្លៃលក់»</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody id="rows">
                {view.rows.length ? (
                  view.rows.map((l, i) => {
                    const note = l.note ? (
                      <span className="sub t-warning" style={{ display: "block" }}>
                        {l.note}
                      </span>
                    ) : null;
                    if (l.kind === "text") {
                      return (
                        <tr key={i}>
                          <td></td>
                          <td></td>
                          <td style={{ whiteSpace: "normal" }}>
                            {l.raw}
                            {note}
                          </td>
                          <td></td>
                          <td className="r" colSpan={3}>
                            <span className="chip chip-warning" title="មិនបានបូក · ទៅជាកំណត់ចំណាំនៃការបញ្ជាទិញ ពេលដាក់ចូលតារាងលក់">
                              គ្មានតម្លៃ · ជាកំណត់ចំណាំ
                            </span>
                          </td>
                          {gaps.size > 0 && <td></td>}
                        </tr>
                      );
                    }
                    const s = saleOf(l, pricing);
                    const gap = gaps.get(i);
                    const each =
                      l.qty && l.qty !== 1 && l.amount !== undefined ? (
                        <span className="sub" style={{ display: "block" }}>
                          {`${fmt(l.amount / l.qty)} / ${l.unit || "មួយ"}`}
                        </span>
                      ) : null;
                    return (
                      <tr key={i}>
                        <td className={titleNo ? "strong" : "muted"}>{titleNo ?? "—"}</td>
                        <td className="muted num">{day}</td>
                        <td style={{ whiteSpace: "normal" }}>
                          {l.name ? l.name : <span className="muted">—</span>}
                          {l.fromList && draft.sales[l.key] === undefined && (
                            <span className="sub" style={{ display: "block" }}>
                              លុយលក់ពី «តម្លៃលក់»
                            </span>
                          )}
                          {note}
                        </td>
                        <td className="r">{qtyText(l)}</td>
                        <td className="r">
                          {l.amount === undefined ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              <span className={l.amount < 0 ? "strong t-danger" : gap ? "strong t-warning" : "strong"}>{fmt(l.amount)}</span>
                              {each}
                            </>
                          )}
                        </td>
                        <td className="cell">
                          <SaleCell
                            i={i}
                            value={s}
                            typed={draft.sales[l.key] !== undefined}
                            title={saleTitle(l, s)}
                            label={`លុយលក់ ${l.name || l.raw}`}
                            onType={(text) => typeSale(l.key, text)}
                          />
                        </td>
                        <td className="r" data-profit={i}>
                          {s === undefined || l.amount === undefined ? <span className="muted">—</span> : <span className={profitClass(s - l.amount)}>{fmt(s - l.amount)}</span>}
                        </td>
                        {gaps.size > 0 && (
                          <td className="cell">
                            {gap && (
                              // Saved as the item's cost per unit: the amount ÷ the line's quantity of its unit.
                              <ListCostCell
                                value={gap.cost}
                                label={`លុយដើម «តម្លៃលក់» ${gap.item.name}`}
                                title={`លុយដើមនៅទំព័រ «តម្លៃលក់» · ${gap.item.name} · វាយកែ ហើយចុច Enter ដើម្បីរក្សាទុក`}
                                onSave={(n) => updatePrice(gap.item, { cost: Math.round(n / gap.times) })}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr className="empty">
                    <td colSpan={7}>បិទភ្ជាប់បញ្ជីលុយដើម និងបញ្ជីលុយលក់ ដើម្បីមើលចំណេញ</td>
                  </tr>
                )}
              </tbody>
              <tfoot id="foot" hidden={!t.count}>
                <tr>
                  {/* The day only with lines: the empty foot is drawn on the server too, whose date may not be the browser's. */}
                  <td colSpan={4} id="f-count">{`សរុប${titleNo ? ` #${titleNo}` : ""}${t.count ? ` · ${day}` : ""} · ${t.count} មុខ`}</td>
                  <td className="r" id="f-cost">
                    {fmt(t.cost)}
                  </td>
                  <td className="r" id="f-sale">
                    {t.sale ? fmt(t.sale) : "—"}
                  </td>
                  <td className="r" id="f-profit">
                    {t.profit === null ? <span className="muted">—</span> : <span className={profitClass(t.profit)}>{fmt(t.profit)}</span>}
                  </td>
                  {gaps.size > 0 && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
            <label className="field" htmlFor="markup" style={{ width: 150 }}>
              បូកលើលុយដើម (%)
              <input
                className="input num"
                id="markup"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder="ឧ. 15"
                aria-describedby="markup-note"
                value={draft.markup}
                onChange={(e) => update({ markup: e.target.value })}
              />
            </label>
            <label className="field" htmlFor="round" style={{ width: 110 }}>
              បង្គត់
              <select className="select" id="round" value={draft.round} onChange={(e) => update({ round: e.target.value })}>
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="1000">1,000</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-default"
              id="reset-manual"
              hidden={!t.typed}
              onClick={() => {
                const sales = { ...draft.sales };
                for (const l of view.rows) if (l.kind === "item") delete sales[l.key];
                update({ sales });
              }}
            >
              {`លុបលុយលក់ដែលវាយក្នុងតារាង (${t.typed})`}
            </button>
            <span className="sub" id="markup-note" style={{ flex: "1 1 200px", paddingBottom: 10 }}>
              ជម្រើស៖ គ្មានបញ្ជីលុយលក់? គណនាលុយលក់ពី % សម្រាប់មុខដែលនៅខ្វះ
            </span>
          </div>

          {/* Which mart's sheet the order goes to, as the sales page's form asks; remembered for the next order. */}
          {state.marts.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
              <span id="calc-mart-label" style={{ fontSize: 13, fontWeight: 500 }}>
                ដាក់ចូល
              </span>
              <Tabs labelledBy="calc-mart-label" id="calc-mart" value={martId} onPick={(id) => update({ mart: id })} items={state.marts.map((id) => ({ key: id, label: martLabel(state, id) }))} />
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* The link changes with every keystroke; no point fetching each one ahead. The totals travel in the link and
                the item list in session storage, so the lists are cleared as it is followed (not when it is opened in a
                new tab), ready for the next order. */}
            <Link
              className="btn btn-primary"
              id="to-sales"
              href={salesHref}
              aria-disabled={!has}
              prefetch={false}
              onClick={(e) => {
                if (has) handItems(t.cost, orderItems(view, pricing), orderNote(view, prices ?? []));
                if (has && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) update({ text: "", saleText: "", sales: {} });
              }}
            >
              {state.marts.length > 1 ? `ដាក់ចូលតារាងលក់ · ${martLabel(state, martId)}` : "ដាក់ចូលតារាងលក់"}
              <Icon name="arrow" size={16} />
            </Link>
            <button
              type="button"
              className="btn btn-outline"
              id="copy-list"
              disabled={!t.count}
              onClick={async () => {
                const done = `បានចម្លងបញ្ជី ${t.count} មុខ និងសរុប — បិទភ្ជាប់ក្នុង Telegram បាន។`;
                await copyText(listText(view, pricing));
                setCopied(done);
              }}
            >
              ចម្លងបញ្ជី
            </button>
          </div>
          <p className="t-accent" id="copy-note" role="status" style={{ margin: "-6px 0 0", fontSize: 13 }} hidden={!copied}>
            {copied ?? ""}
          </p>
        </section>
      </div>
    </>
  );
}
