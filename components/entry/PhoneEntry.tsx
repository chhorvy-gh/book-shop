"use client";

// Order entry on a phone (mockup entry.html): pick the seller, type cost and sale, save. The order goes into Mart 1
// of the picked week, as the header says, with the seller's next code and the sheet's next number.
import { useRef, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { STATUS, nextCodeNumber } from "@/lib/orders";
import { bySeller, hasMonths, martLabel, monthLabel, pickedWeek, sellerOf, weekKey, weekLabel, weekMarts, weekRange } from "@/lib/periods";
import type { Month, SaleBookState, Seller, Week } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { Switch } from "../ui";

const MART = "1";
const QUICK = 8;

// The sellers with the most orders this week, for one-tap picking; ties keep the seller-list order (sort is stable).
function busiest(s: SaleBookState, mo: Month, w: Week): Seller[] {
  const per = bySeller(s, mo, w);
  return s.sellers
    .map((x) => ({ x, n: per[x.name]?.lines.length ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, QUICK)
    .map(({ x }) => x);
}

// The phone frame with its header; on a phone it fills the screen.
function Frame({ sub, children }: { sub: string; children: React.ReactNode }) {
  return (
    <div className="phone-page">
      <Link href="/" className="sub">
        ← ត្រឡប់ទៅកំណែកុំព្យូទ័រ
      </Link>

      <div className="phone">
        <header className="phone-head">
          <Link href="/" className="icon-btn" aria-label="ត្រឡប់ទៅផ្ទាំងសង្ខេប">
            <Icon name="back" size={22} />
          </Link>
          <div className="stack">
            <b style={{ fontSize: 18 }}>បញ្ចូលការលក់</b>
            <span className="sub">{sub}</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function PhoneEntry() {
  const { state } = useSaleBook();
  const mart = martLabel(state, MART);

  // A shop with no month yet is started on the overview (the welcome card).
  if (!hasMonths(state)) {
    return (
      <Frame sub={mart}>
        <div className="phone-body">
          <section className="phone-card">
            <h2>មិនទាន់មានខែណាមួយនៅឡើយ</h2>
            <span className="sub">បង្កើតខែដំបូង ដើម្បីចាប់ផ្តើមបញ្ចូលការលក់</span>
            <Link className="btn btn-primary" href="/">
              ចាប់ផ្តើម
            </Link>
          </section>
        </div>
      </Frame>
    );
  }

  const { month, week } = pickedWeek(state);
  if (!week) {
    return (
      <Frame sub={`${mart} · ${monthLabel(month)}`}>
        <div className="phone-body">
          <section className="phone-card">
            <h2>មិនទាន់មានអាទិត្យក្នុងខែនេះ</h2>
            <Link className="btn btn-primary" href="/sales">
              បន្ថែមខែ ឬអាទិត្យ នៅតារាងលក់
            </Link>
          </section>
        </div>
      </Frame>
    );
  }

  return <Entry key={weekKey(month, week)} month={month} week={week} />;
}

function Entry({ month, week }: { month: Month; week: Week }) {
  const { state, addOrder } = useSaleBook();
  const key = weekKey(month, week);
  // Worked out once when the page opens, so the buttons do not move around while orders are typed in.
  const [quick] = useState(() => busiest(state, month, week));
  const [code, setCode] = useState(() => quick[0]?.code ?? "");
  const [cost, setCost] = useState("");
  const [sale, setSale] = useState("");
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
  // What this page has just saved: a saved order reaches state a moment later, so a quick second save must not take
  // the same number or code meanwhile.
  const [used, setUsed] = useState<{ no: number; codes: Record<string, number> }>({ no: 0, codes: {} });
  const saleRef = useRef<HTMLInputElement>(null);

  const marts = weekMarts(state, month, week);
  const orders = marts.find((m) => m.id === MART)?.orders ?? [];
  const seller = state.sellers.find((s) => s.code === code) ?? null;
  const others = state.sellers.filter((s) => !quick.some((q) => q.code === s.code));

  // Codes are unique across the week's marts and never reuse a number from an earlier sheet.
  const floor = { ...(state.codeFloor[key] ?? {}) };
  for (const [p, n] of Object.entries(used.codes)) floor[p] = Math.max(floor[p] ?? 0, n);
  const codeNo = seller ? nextCodeNumber(marts, seller.code, floor) : 0;
  const newCode = seller ? seller.code + codeNo : "";
  const no = orders.reduce((a, o) => Math.max(a, o.no), used.no) + 1;
  const recent = orders
    .slice()
    .sort((a, b) => b.no - a.no)
    .slice(0, 4);

  const saleN = parseFloat(sale);
  const costN = parseFloat(cost);
  const profit = isNaN(saleN) ? null : saleN - (isNaN(costN) ? 0 : costN);

  const pick = (c: string) => {
    setCode(c);
    setToast("");
  };

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!seller) return;
    const c = parseFloat(cost) || 0;
    if (!(saleN > 0)) {
      setError(true);
      setToast("");
      saleRef.current?.focus();
      return;
    }
    addOrder(key, MART, { no, code: newCode, cost: c, sale: saleN, status: paid ? "p" : "u", items: [] });
    setUsed((u) => ({ no: Math.max(u.no, no), codes: { ...u.codes, [seller.code]: Math.max(u.codes[seller.code] ?? 0, codeNo) } }));
    setCost("");
    setSale("");
    setPaid(false);
    setToast(`បានរក្សាទុក ${newCode} · ចំណេញ ${fmt(saleN - c)}`);
    e.currentTarget.scrollTop = 0;
  };

  return (
    <Frame sub={`${martLabel(state, MART)} · ${weekLabel(week)} · ${weekRange(week)}`}>
      <form className="phone-body" id="entry-form" noValidate onSubmit={save}>
        <div className="banner banner-success" id="toast" role="status" hidden={!toast}>
          {toast && (
            <>
              <Icon name="check" size={20} />
              <span>{toast}</span>
            </>
          )}
        </div>

        <section className="phone-card">
          <h2>អ្នកលក់</h2>
          <div className="pick" role="group" aria-label="ជ្រើសអ្នកលក់">
            {quick.map((s) => (
              <button key={s.code} type="button" data-code={s.code} aria-pressed={s.code === code} onClick={() => pick(s.code)}>
                {s.name}
              </button>
            ))}
            {!state.sellers.length && <Link href="/sales">បន្ថែមអ្នកលក់ថ្មី</Link>}
          </div>
          {/* The mockup has eight buttons only; a real shop needs every seller. */}
          {others.length > 0 && (
            <select
              className="select"
              aria-label="អ្នកលក់ផ្សេងទៀត"
              value={others.some((s) => s.code === code) ? code : ""}
              onChange={(e) => {
                if (e.target.value) pick(e.target.value);
              }}
            >
              <option value="">អ្នកលក់ផ្សេងទៀត</option>
              {others.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="code-box">
            <span className="stack">
              <span style={{ fontSize: 12 }}>លេខកូដថ្មី</span>
              <b>{newCode}</b>
            </span>
            <span className="strong num" style={{ fontSize: 13 }}>
              លេខ #{no}
            </span>
          </div>
        </section>

        <section className="phone-card">
          <label className="field" htmlFor="m-cost">
            លុយដើម
            <input
              className="input input-lg num"
              id="m-cost"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="ឧ. 81000"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="field" htmlFor="m-sale">
            លុយលក់
            <input
              ref={saleRef}
              className="input input-lg num"
              id="m-sale"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="ឧ. 95000"
              aria-describedby="m-sale-error"
              aria-invalid={error || undefined}
              value={sale}
              onChange={(e) => {
                setSale(e.target.value);
                setError(false);
              }}
            />
            <span className="field-error" id="m-sale-error" hidden={!error}>
              បញ្ចូលលុយលក់ ដែលធំជាង 0
            </span>
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="muted">ចំណេញ</span>
            <span
              className={profit === null ? "num muted" : `num ${profit < 0 ? "t-danger" : "t-success"}`}
              style={{ fontSize: 26, fontWeight: 700 }}
            >
              {profit === null ? "—" : fmt(profit)}
            </span>
          </div>
          <Switch id="m-paid" checked={paid} onChange={setPaid} label="អតិថិជនបានបង់ហើយ" />
        </section>

        <section className="stack" style={{ gap: 8, lineHeight: 1.6 }}>
          <h2 style={{ margin: 0, padding: "0 4px", fontSize: 14, fontWeight: 600 }}>បញ្ចូលថ្មីៗ</h2>
          <ul className="recent">
            {recent.map((o) => (
              <li key={o.id}>
                <span className="stack" style={{ lineHeight: 1.4 }}>
                  <span className="strong">{o.code || "—"}</span>
                  <span className="sub">
                    #{o.no} · {sellerOf(state, o.code) || "មិនស្គាល់អ្នកលក់"}
                  </span>
                </span>
                <span className="stack" style={{ alignItems: "flex-end", lineHeight: 1.4 }}>
                  <span className="strong">{fmt(o.sale - o.cost)}</span>
                  <span style={{ fontSize: 12 }} className={`t-${STATUS[o.status].tone}`}>
                    {STATUS[o.status].label}
                  </span>
                </span>
              </li>
            ))}
            {!recent.length && (
              <li>
                <span className="sub">បញ្ជីនេះមិនទាន់មានការបញ្ជាទិញ</span>
              </li>
            )}
          </ul>
        </section>
      </form>

      <footer className="phone-foot">
        <button type="submit" form="entry-form" className="btn btn-primary btn-block" disabled={!seller}>
          រក្សាទុក {newCode}
        </button>
      </footer>
    </Frame>
  );
}
