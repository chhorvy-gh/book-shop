"use client";

// The sales sheet (mockup/sales.html): the week every page shares, one sheet per mart. Add orders, change them in the
// table, print a customer's invoice, export to Excel; make months and weeks; add sellers and marts.
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmt, latinDigits, margin, prefixOf, signed } from "@/lib/format";
import { NEXT_STATUS, findCode, nextCodeNumber, totals } from "@/lib/orders";
import { monthLabel, pickedWeek, weekKey, weekLabel, weekMarts, weekRange } from "@/lib/periods";
import type { InvoiceData, Month, Order, Seller, Week } from "@/lib/types";
import MonthDialog from "../dialogs/MonthDialog";
import WeekDialog from "../dialogs/WeekDialog";
import { Icon } from "../icons";
import PeriodBar from "../PeriodBar";
import { useSaleBook } from "../store";
import { Tabs, useNote } from "../ui";
import EditDialog, { type OrderEdit } from "./EditDialog";
import Invoice from "./Invoice";
import OrdersTable, { PAGE_SIZE, type Filter, type Originals } from "./OrdersTable";
import SellerCombo from "./SellerCombo";
import { DeleteDialog, ExportDialog, MartDialog, SellerDialog, type ExportKind } from "./SalesDialogs";

// The page title, which becomes the file name when an invoice is saved as PDF.
const setDocTitle = (title: string) => {
  document.title = title;
};

export default function SalesPage() {
  const { state } = useSaleBook();
  const { month, week } = pickedWeek(state);
  const note = useNote();
  const router = useRouter();
  const params = useSearchParams();
  // The quick calculator links here with ?cost=95000&sale=110000 (sale only when every item has one).
  const [fromCalc] = useState(() => {
    const cost = parseFloat(params.get("cost") ?? "");
    const sale = parseFloat(params.get("sale") ?? "");
    return cost > 0 ? { cost: String(cost), sale: sale > 0 ? String(sale) : "" } : null;
  });
  const [weekDialog, setWeekDialog] = useState<{ open: boolean; editing: Week | null }>({ open: false, editing: null });
  const [monthOpen, setMonthOpen] = useState(false);
  // Bumped after a new week or month is made, so the form takes the focus for the first order.
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (!fromCalc) return;
    note.show(
      `លុយដើម ${fmt(+fromCalc.cost)}${fromCalc.sale ? ` និងលុយលក់ ${fmt(+fromCalc.sale)}` : ""} មកពីគណនារហ័ស · ${fromCalc.sale ? "ជ្រើសអ្នកលក់ ហើយចុចបន្ថែម។" : "ជ្រើសអ្នកលក់ ហើយបញ្ចូលលុយលក់។"}`,
    );
    // A reload should not bring the amounts back.
    router.replace("/sales", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the page opens
  }, []);

  function newWeek() {
    if (month.weeks.length >= 5) {
      note.show(`${monthLabel(month)} មាន 5 អាទិត្យគ្រប់ហើយ · ចុច «ខែថ្មី» ដើម្បីចាប់ផ្តើមខែបន្ទាប់។`);
      return;
    }
    setWeekDialog({ open: true, editing: null });
  }
  const periodDone = (text: string) => {
    const editing = weekDialog.editing;
    setWeekDialog({ open: false, editing: null });
    setMonthOpen(false);
    if (!editing) setFocusKey((k) => k + 1);
    note.show(text);
  };

  const periodBar = (
    <PeriodBar
      mode="week"
      afterMonth={
        <>
          <button type="button" className="btn btn-outline" onClick={() => setMonthOpen(true)}>
            <Icon name="plus" size={16} />
            ខែថ្មី
          </button>
          <span className="period-sep" aria-hidden="true" />
        </>
      }
    >
      {week && (
        <button type="button" className="btn btn-outline" onClick={() => setWeekDialog({ open: true, editing: week })}>
          <Icon name="edit" size={16} />
          កែថ្ងៃ
        </button>
      )}
      <button type="button" className="btn btn-outline" onClick={newWeek}>
        <Icon name="plus" size={16} />
        អាទិត្យថ្មី
      </button>
    </PeriodBar>
  );

  return (
    <>
      {week ? (
        <WeekSheet key={weekKey(month, week)} month={month} week={week} periodBar={periodBar} note={note} fromCalc={fromCalc} focusKey={focusKey} />
      ) : (
        <>
          <header className="page-head">
            <div className="stack">
              <span className="eyebrow">{monthLabel(month)}</span>
              <h1>តារាងលក់</h1>
            </div>
          </header>
          {periodBar}
          {note.element}
          <div className="card empty-card">ខែនេះមិនទាន់មានអាទិត្យ · ចុច «អាទិត្យថ្មី» ដើម្បីចាប់ផ្តើមបញ្ចូលការលក់</div>
        </>
      )}
      <WeekDialog open={weekDialog.open} month={month} editing={weekDialog.editing} onClose={() => setWeekDialog({ open: false, editing: null })} onDone={periodDone} />
      <MonthDialog open={monthOpen} onClose={() => setMonthOpen(false)} onDone={periodDone} />
    </>
  );
}

// One week's sheets. Mounted afresh for each week, so the mart, filter, page and "changed" marks start over, as when
// the mockup opens a week.
function WeekSheet({
  month,
  week,
  periodBar,
  note,
  fromCalc,
  focusKey,
}: {
  month: Month;
  week: Week;
  periodBar: React.ReactNode;
  note: ReturnType<typeof useNote>;
  fromCalc: { cost: string; sale: string } | null;
  focusKey: number;
}) {
  const book = useSaleBook();
  const { state } = book;
  const key = weekKey(month, week);
  const marts = weekMarts(state, month, week);
  const range = weekRange(week);
  const names = useMemo(() => new Map(state.sellers.map((s) => [s.code, s.name])), [state.sellers]);

  const [sheet, setSheet] = useState("1");
  const mart = marts.find((m) => m.id === sheet) ?? marts[0];
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [newId, setNewId] = useState<string | null>(null);
  const [originals, setOriginals] = useState<Originals>(
    () => new Map(marts.flatMap((m) => m.orders.map((o) => [o.id, { code: o.code, cost: o.cost, sale: o.sale }] as const))),
  );
  const [editing, setEditing] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);
  const [martOpen, setMartOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<ExportKind>("full");
  const [sellerDialog, setSellerDialog] = useState<{ open: boolean; name: string; code: string }>({ open: false, name: "", code: "" });
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const titleBefore = useRef("");

  // ----- The add form -----
  const [sellerCode, setSellerCode] = useState(state.sellers[0]?.code ?? "");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [cost, setCost] = useState(fromCalc?.cost ?? "");
  const [sale, setSale] = useState(fromCalc?.sale ?? "");
  const costRef = useRef<HTMLInputElement>(null);
  const saleRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const autoCode = sellerCode + nextCodeNumber(marts, sellerCode, state.codeFloor[key] ?? {});
  const typedCode = latinDigits(code.trim());
  const dup = codeEdited && typedCode ? findCode(marts, typedCode) : null;
  const unknown = codeEdited && typedCode && !names.has(prefixOf(typedCode)) ? prefixOf(typedCode) : "";
  const saleNum = parseFloat(sale);
  const preview = isNaN(saleNum) ? null : saleNum - (parseFloat(cost) || 0);

  useEffect(() => {
    // From the calculator: pick the seller next when the sale is there, otherwise type the sale.
    if (fromCalc) (fromCalc.sale ? document.getElementById("seller") : saleRef.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the week opens
  }, []);
  useEffect(() => {
    if (focusKey) costRef.current?.focus();
  }, [focusKey]);

  function openSheet(id: string) {
    setSheet(id);
    setFilter("all");
    setQuery("");
    setPage(0);
    note.hide();
  }

  function addOrder(e: React.FormEvent) {
    e.preventDefault();
    const finalCode = typedCode || autoCode;
    if (findCode(marts, finalCode)) {
      codeRef.current?.focus();
      return;
    }
    // Prices are optional here: an empty box adds the order at 0, to fill in later in the table.
    const order = { no: Math.max(0, ...mart.orders.map((o) => o.no)) + 1, code: finalCode, cost: parseFloat(cost) || 0, sale: saleNum || 0, status: "u" as const, items: [] };
    const id = book.addOrder(key, mart.id, order);
    setOriginals((m) => new Map(m).set(id, { code: order.code, cost: order.cost, sale: order.sale }));
    setNewId(id);
    // Show the page the new order lands on: the last one.
    setFilter("all");
    setQuery("");
    setPage(Math.floor(mart.orders.length / PAGE_SIZE));
    setCost("");
    setSale("");
    setCode("");
    setCodeEdited(false);
    costRef.current?.focus();
    requestAnimationFrame(() => document.getElementById(`order-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function sellerAdded(s: Seller, fromCode: boolean) {
    setSellerDialog((d) => ({ ...d, open: false }));
    setSellerCode(s.code);
    if (!fromCode) {
      setCode("");
      setCodeEdited(false);
    }
    note.show(`បានបន្ថែមអ្នកលក់ ${s.name} · កូដ ${s.code}1, ${s.code}2 … · មានក្នុងគ្រប់ទំព័រ។`);
    costRef.current?.focus();
  }

  // ----- Changing orders -----
  const patch = (o: Order, p: Partial<Order>) => book.updateOrder(o.id, p);
  function saveEdit(o: Order, edit: OrderEdit) {
    patch(o, edit);
    setEditing(null);
  }
  function confirmDelete(o: Order) {
    book.deleteOrder(o.id);
    setDeleting(null);
    setEditing(null);
    note.show(`បានលុបការបញ្ជាទិញ #${o.no} · ${o.code}។`);
  }
  function newMart() {
    const id = book.addMart();
    openSheet(id);
    note.show(`បានបន្ថែម Mart ${id} · មានតារាងទទេក្នុងគ្រប់អាទិត្យ · បញ្ចូលការបញ្ជាទិញនៅខាងលើ។`);
  }

  // The invoice is put on the page just for printing, then taken off once the print window closes.
  function printInvoice(o: Pick<Order, "no" | "code" | "sale" | "status" | "items">) {
    flushSync(() =>
      setInvoice({ no: o.no, code: o.code, seller: names.get(prefixOf(o.code)) ?? "", mart: mart.label, period: `${weekLabel(week)} · ${range}`, sale: o.sale, status: o.status, items: o.items }),
    );
    titleBefore.current = document.title;
    setDocTitle(`វិក្កយបត្រ #${o.no} ${o.code}`);
    window.print();
  }
  useEffect(() => {
    const done = () => {
      if (titleBefore.current) setDocTitle(titleBefore.current);
      titleBefore.current = "";
      setInvoice(null);
    };
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  const t = totals(mart.orders);
  const adj = state.adjustments[key]?.[mart.id] ?? [];
  const adjSum = adj.reduce((a, x) => a + x[2], 0);
  const count = (orders: Order[]) => totals(orders).count;
  const meta = `${mart.label} · ${weekLabel(week)} · ${range}`;

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">
            {monthLabel(month)} · {weekLabel(week)} · {range}
          </span>
          <h1>តារាងលក់</h1>
        </div>
        <div className="actions" style={{ alignItems: "center" }}>
          <Tabs label="ជ្រើស Mart" id="sheet-tabs" value={mart.id} onPick={openSheet} items={marts.map((m) => ({ key: m.id, label: m.label, count: count(m.orders) }))} />
          <button type="button" className="btn btn-outline" onClick={() => setMartOpen(true)}>
            <Icon name="edit" size={16} />
            កែ Mart
          </button>
          <button type="button" className="btn btn-outline" onClick={newMart}>
            <Icon name="plus" size={16} />
            Mart ថ្មី
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setExportOpen(true)}>
            <Icon name="download" />
            នាំចេញ Excel
          </button>
        </div>
      </header>

      {periodBar}
      {note.element}

      <form className="card" id="add-form" aria-label="បញ្ចូលការបញ្ជាទិញថ្មី" style={{ padding: "20px 24px", gap: 14 }} noValidate onSubmit={addOrder}>
        <div className="card-head">
          <h2 style={{ fontSize: 16 }}>បញ្ចូលការបញ្ជាទិញថ្មី</h2>
          <span className="sub">កូដបង្កើតដោយស្វ័យប្រវត្តិ តាមអ្នកលក់ ហើយកែបាន · ចុច Enter ដើម្បីបន្ថែម</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
          <span id="form-mart-label" style={{ fontSize: 13, fontWeight: 500 }}>
            ដាក់ចូល
          </span>
          {/* The mart picked at the top is also where a new order goes, so the form shows the same choice. */}
          <Tabs labelledBy="form-mart-label" id="form-mart" value={mart.id} onPick={openSheet} items={marts.map((m) => ({ key: m.id, label: m.label }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "start" }}>
          <div className="field">
            <span className="field-head">
              <label htmlFor="seller" id="seller-label">
                អ្នកលក់
              </label>
              <button type="button" className="field-link" onClick={() => setSellerDialog({ open: true, name: "", code: "" })}>
                + អ្នកលក់ថ្មី
              </button>
            </span>
            <SellerCombo
              sellers={state.sellers}
              value={sellerCode}
              onChange={(c) => {
                setSellerCode(c);
                setCode("");
                setCodeEdited(false);
              }}
              onAddNew={(name) => setSellerDialog({ open: true, name, code: "" })}
            />
          </div>
          <label className="field" htmlFor="code">
            លេខកូដ
            <input
              ref={codeRef}
              className="input code-input"
              id="code"
              type="text"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="code-hint"
              aria-invalid={dup ? true : undefined}
              value={codeEdited ? code : autoCode}
              onChange={(e) => {
                const v = latinDigits(e.target.value.trim());
                setCode(e.target.value);
                setCodeEdited(v !== "");
                // Typing another seller's prefix ("ហេង36") switches the seller to match.
                if (names.has(prefixOf(v))) setSellerCode(prefixOf(v));
              }}
              // Emptying the box goes back to the automatic code.
              onBlur={() => {
                if (!code.trim()) setCodeEdited(false);
              }}
            />
            {dup ? (
              <span className="field-error" id="code-hint">
                កូដនេះមានរួចហើយ · #{dup.no} {dup.mart}
              </span>
            ) : unknown ? (
              <span className="field-error t-warning" id="code-hint">
                មិនស្គាល់អ្នកលក់នៃកូដនេះ ·{" "}
                <button type="button" className="field-link" onClick={() => setSellerDialog({ open: true, name: "", code: unknown })}>
                  + បន្ថែមអ្នកលក់ «{unknown}»
                </button>
              </span>
            ) : null}
          </label>
          <label className="field" htmlFor="cost">
            លុយដើម
            <input ref={costRef} className="input num" id="cost" type="number" inputMode="numeric" min={0} placeholder="ឧ. 81000" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          <label className="field" htmlFor="sale">
            លុយលក់
            <input ref={saleRef} className="input num" id="sale" type="number" inputMode="numeric" min={0} placeholder="ឧ. 95000" value={sale} onChange={(e) => setSale(e.target.value)} />
          </label>
          <div className="field">
            <span>ចំណេញ</span>
            <span className={`readout ${preview === null ? "muted" : preview < 0 ? "t-danger" : "t-success"}`} id="preview">
              {preview === null ? "—" : fmt(preview)}
            </span>
          </div>
          <div className="field">
            <span aria-hidden="true">&nbsp;</span>
            <button type="submit" className="btn btn-primary">
              បន្ថែមការបញ្ជាទិញ
            </button>
          </div>
        </div>
      </form>

      <div className="split" style={{ gap: 20 }}>
        <OrdersTable
          orders={mart.orders}
          marts={marts}
          names={names}
          originals={originals}
          filter={filter}
          onFilter={(f) => {
            setFilter(f);
            setPage(0);
          }}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            setPage(0);
          }}
          page={page}
          onPage={setPage}
          newId={newId}
          onChange={patch}
          onToggleStatus={(o) => patch(o, { status: NEXT_STATUS[o.status] })}
          onEdit={setEditing}
          onPrint={printInvoice}
          onDelete={setDeleting}
        />

        <aside className="grow-side">
          <section className="card" style={{ padding: "20px 24px", gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>សរុប {mart.label}</h2>
            <dl className="totals">
              <div>
                <dt>ការបញ្ជាទិញ</dt>
                <dd>{t.count}</dd>
              </div>
              <div>
                <dt>លុយដើម</dt>
                <dd>{fmt(t.cost)}</dd>
              </div>
              <div>
                <dt>លុយលក់</dt>
                <dd>{fmt(t.sale)}</dd>
              </div>
              <div className="total">
                <dt>ចំណេញ</dt>
                <dd className="t-success">{fmt(t.profit)}</dd>
              </div>
              <div>
                <dt>អត្រាចំណេញ</dt>
                <dd style={{ fontWeight: 400 }}>{margin(t.profit, t.sale)}</dd>
              </div>
            </dl>
            <Link href="/sellers" style={{ fontSize: 13, fontWeight: 500 }}>
              ចែកចំណេញតាមអ្នកលក់
            </Link>
          </section>

          <section className="card" style={{ padding: "20px 24px", gap: 12 }}>
            <div className="card-head">
              <h2 style={{ fontSize: 16 }}>ការកែតម្រូវ</h2>
              <span className={`strong num ${adjSum < 0 ? "t-danger" : adjSum > 0 ? "t-success" : "muted"}`}>{signed(adjSum)}</span>
            </div>
            <span className="sub" style={{ marginTop: -8 }}>
              ដក ឬបូក ភ្ជាប់នឹងលេខការបញ្ជាទិញ
            </span>
            <ul className="order-list" style={{ height: "auto", maxHeight: 360, padding: 0, borderBottom: 0 }}>
              {adj.length ? (
                adj.map(([no, c, amt], i) => (
                  <li key={i}>
                    <span style={{ display: "flex", gap: 8 }}>
                      <span className="no">#{no}</span>
                      {c}
                    </span>
                    <span className={`strong ${amt < 0 ? "t-danger" : "t-success"}`}>{signed(amt)}</span>
                  </li>
                ))
              ) : (
                <li>
                  <span className="muted">មិនទាន់មានការកែតម្រូវ</span>
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>

      <EditDialog
        order={editing}
        meta={meta}
        marts={marts}
        names={names}
        onClose={() => setEditing(null)}
        onSave={(edit) => editing && saveEdit(editing, edit)}
        onDelete={() => setDeleting(editing)}
        onPrint={(edit) => editing && printInvoice({ ...editing, ...edit })}
      />
      <DeleteDialog order={deleting} meta={meta} seller={deleting ? (names.get(prefixOf(deleting.code)) ?? "") : ""} onClose={() => setDeleting(null)} onYes={confirmDelete} />
      <SellerDialog
        open={sellerDialog.open}
        name0={sellerDialog.name}
        code0={sellerDialog.code}
        onClose={() => setSellerDialog((d) => ({ ...d, open: false }))}
        onAdded={(s) => sellerAdded(s, !!sellerDialog.code)}
      />
      <MartDialog
        open={martOpen}
        id={mart.id}
        onClose={() => setMartOpen(false)}
        onDone={(text, deleted) => {
          setMartOpen(false);
          if (deleted) openSheet(state.marts[state.marts.indexOf(mart.id) - 1] ?? "1");
          if (text) note.show(text);
        }}
      />
      <ExportDialog
        open={exportOpen}
        marts={marts}
        martId={mart.id}
        kind={exportKind}
        onKind={setExportKind}
        sub={`${monthLabel(month)} · ${weekLabel(week)} · ${range}`}
        week={weekLabel(week)}
        range={range}
        onClose={() => setExportOpen(false)}
        onDone={(text) => {
          setExportOpen(false);
          note.show(text);
        }}
      />
      {invoice && <Invoice data={invoice} />}
    </>
  );
}

