"use client";

// Quick calculator (mockup/calculator.html): paste a list with cost prices and the same list with sale prices,
// see each item's profit and the totals, then take the totals to the sales sheet or copy the list.
// The reading and matching of the lists is in lib/logic/calculator.ts.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmt, latinDigits, parseMoney, usd } from "@/lib/format";
import { combine, listText, markupOf, parse, qtyText, saleOf, totals, writtenCheck, type ItemLine, type Pricing } from "@/lib/logic/calculator";
import { Icon } from "../icons";
import { useSaleBook } from "../store";

const EXAMPLE_COST = "23\nឆ្អឹងគោសាច់4គីឡូ44000\nគល់ស្លឹកគ្រៃ1គីឡូ7000\nមាន់ស្រែ2ក្បាល25000\nជើងមាន់2គីឡូ13000\nសាច់ជ្រូក2គីឡូ16000";
const EXAMPLE_SALE = "23\nឆ្អឹងគោសាច់4គីឡូ49000\nគល់ស្លឹកគ្រៃ1គីឡូ8000\nមាន់ស្រែ2ក្បាល26000\nជើងមាន់2គីឡូ15000\nសាច់ជ្រូក2គីឡូ17000";

// The lists, the sale prices typed in the table (by item name + quantity, so fixing a cost keeps the sale price),
// the markup % and its rounding. Kept on this device only: it is a scratch pad, not part of the book.
interface Draft {
  text: string;
  saleText: string;
  sales: Record<string, number>;
  markup: string;
  round: string;
}
const DRAFT_KEY = "salebook.calculator";
const ROUNDS = ["100", "500", "1000"];
const EMPTY: Draft = { text: "", saleText: "", sales: {}, markup: "", round: "500" };
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
    return { text: str(d.text), saleText: str(d.saleText), sales, markup: str(d.markup), round: ROUNDS.includes(d.round) ? d.round : "500" };
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

// Clipboard first; an old browser or a page not on https gets the hidden-textarea copy.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
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

export default function Calculator() {
  const { state } = useSaleBook();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [copied, setCopied] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // The saved draft is read once mounted, so the server and the first browser render match.
  useEffect(() => {
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
    if (saved) setDraft(saved);
  }, []);

  // Every change is saved, and hides the "copied" line: what was copied no longer matches.
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setCopied(null);
    saveDraft(next);
  };

  const codes = useMemo(() => new Set(state.sellers.map((s) => s.code)), [state.sellers]);
  const view = useMemo(() => combine(parse(draft.text, codes), parse(draft.saleText, codes)), [draft.text, draft.saleText, codes]);
  const pricing: Pricing = { sales: draft.sales, markup: markupOf(draft.markup), step: Number(draft.round) };
  const t = totals(view.rows, pricing);
  const rate = state.rate;

  // Compare the written total(s) with what the lines add up to.
  const parts = writtenCheck(view.written, t);
  const wrong = parts.filter((p) => p[1] !== p[2]);

  // The sales page fills a new order with these; the sale only when every item has one.
  const has = t.count > 0 && !t.noCost;
  const salesHref = has ? `/sales?cost=${t.cost}${t.profit !== null && t.sale ? `&sale=${t.sale}` : ""}` : "/sales";

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
        ? "ពីបញ្ជីលុយលក់"
        : s === undefined
          ? ""
          : `គណនា +${pricing.markup}%`;

  const profitSub = !t.count
    ? BLANK
    : t.noCost
      ? `នៅខ្វះលុយដើម ${t.noCost} មុខ`
      : t.missing === t.count
        ? "បិទភ្ជាប់បញ្ជីលុយលក់ក្នុងប្រអប់ ②"
        : t.missing
          ? `នៅខ្វះលុយលក់ ${t.missing} មុខ`
          : t.sale
            ? `អត្រាចំណេញ ${(((t.profit ?? 0) / t.sale) * 100).toFixed(1)}%`
            : BLANK;

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">បិទភ្ជាប់បញ្ជីលុយដើម និងបញ្ជីលុយលក់ ហើយមើលចំណេញភ្លាមៗ</span>
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
                aria-describedby="tips"
                placeholder={EXAMPLE_COST}
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
                aria-describedby="tips"
                placeholder={EXAMPLE_SALE}
                value={draft.saleText}
                onChange={(e) => update({ saleText: e.target.value })}
              />
            </label>
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
            <li>ឈ្មោះទំនិញក្នុងប្រអប់ទាំងពីរ គួរដូចគ្នា · បើខុសគ្នា កម្មវិធីផ្គូផ្គងតាមលំដាប់ជួរ ហើយប្រាប់អ្នកក្នុងតារាង។</li>
            <li>ឬសរសេរតម្លៃទាំងពីរក្នុងជួរតែមួយ ក្នុងប្រអប់ ① (ឆ្អឹងគោសាច់4គីឡូ44000 49000)។</li>
            <li>ជួរទីមួយដូចជា 23 ឬ ហេង23 = ចំណងជើង · ជួរចុងក្រោយមានតែលេខ = សរុបដែលអ្នកសរសេរ (កម្មវិធីពិនិត្យឲ្យ)។</li>
            <li>ចាប់ផ្តើមជួរដោយ - ឬ ដក ដើម្បីដកលុយ · លេខខ្មែរ ០–៩ ក៏បាន។</li>
          </ul>
        </section>

        <section className="card grow-2" aria-labelledby="out-title">
          <div className="card-head">
            <h2 id="out-title" style={{ fontSize: 16 }}>
              លទ្ធផល
            </h2>
            <span className="chip chip-accent" id="title-chip" hidden={!view.title}>
              {view.title ?? ""}
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

          <div className="table-wrap" style={{ margin: "0 -24px" }}>
            <table className="data">
              <thead>
                <tr>
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
                          <td style={{ whiteSpace: "normal" }}>
                            {l.raw}
                            {note}
                          </td>
                          <td></td>
                          <td className="r" colSpan={3}>
                            <span className="chip chip-warning">គ្មានតម្លៃ · មិនបានបូក</span>
                          </td>
                        </tr>
                      );
                    }
                    const s = saleOf(l, pricing);
                    const each =
                      l.qty && l.qty !== 1 && l.amount !== undefined ? (
                        <span className="sub" style={{ display: "block" }}>
                          {`${fmt(l.amount / l.qty)} / ${l.unit || "មួយ"}`}
                        </span>
                      ) : null;
                    return (
                      <tr key={i}>
                        <td style={{ whiteSpace: "normal" }}>
                          {l.name ? l.name : <span className="muted">—</span>}
                          {note}
                        </td>
                        <td className="r">{qtyText(l)}</td>
                        <td className="r">
                          {l.amount === undefined ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              <span className={l.amount < 0 ? "strong t-danger" : "strong"}>{fmt(l.amount)}</span>
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
                      </tr>
                    );
                  })
                ) : (
                  <tr className="empty">
                    <td colSpan={5}>បិទភ្ជាប់បញ្ជីលុយដើម និងបញ្ជីលុយលក់ ដើម្បីមើលចំណេញ</td>
                  </tr>
                )}
              </tbody>
              <tfoot id="foot" hidden={!t.count}>
                <tr>
                  <td colSpan={2} id="f-count">{`សរុប · ${t.count} មុខ`}</td>
                  <td className="r" id="f-cost">
                    {fmt(t.cost)}
                  </td>
                  <td className="r" id="f-sale">
                    {t.sale ? fmt(t.sale) : "—"}
                  </td>
                  <td className="r" id="f-profit">
                    {t.profit === null ? <span className="muted">—</span> : <span className={profitClass(t.profit)}>{fmt(t.profit)}</span>}
                  </td>
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

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* The link changes with every keystroke; no point fetching each one ahead. */}
            <Link className="btn btn-primary" id="to-sales" href={salesHref} aria-disabled={!has} prefetch={false}>
              ដាក់ចូលតារាងលក់
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
