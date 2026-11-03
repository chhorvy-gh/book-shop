"use client";

// The sales sheet (mockup/sales.html): the week every page shares, one sheet per mart. Add orders, change them in the
// table, print a customer's invoice, export to Excel; make months and weeks; add sellers and marts.
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { dropItems, takeItems } from "@/lib/calcItems";
import { fmt, latinDigits, margin, prefixOf, signed } from "@/lib/format";
import { NEXT_STATUS, STATUS, findCode, nextCodeNumber, sumItems, totals } from "@/lib/orders";
import { monthLabel, pickedWeek, weekKey, weekLabel, weekMarts, weekRange } from "@/lib/periods";
import { TRASH_NAME, trashedWeeks } from "@/lib/trash";
import type { InvoiceData, Item, Mart, Month, Order, Seller, Week } from "@/lib/types";
import DeletePeriodDialog, { type PeriodTarget } from "../dialogs/DeletePeriodDialog";
import MonthDialog from "../dialogs/MonthDialog";
import WeekDialog from "../dialogs/WeekDialog";
import { Icon } from "../icons";
import PeriodBar from "../PeriodBar";
import { useReadOnly, useSaleBook } from "../store";
import { Tabs, useNote } from "../ui";
import EditDialog, { type OrderEdit } from "./EditDialog";
import Invoice from "./Invoice";
import OrdersTable, { PAGE_SIZE, type Filter, type Originals } from "./OrdersTable";
import SellerCombo from "./SellerCombo";
import ViewDialog from "./ViewDialog";
import { BulkDeleteDialog, DeleteDialog, ExportDialog, MartDialog, SellerDialog, type ExportKind } from "./SalesDialogs";

// The page title, which becomes the file name when an invoice is saved as PDF.
const setDocTitle = (title: string) => {
  document.title = title;
};

// What the quick calculator sent: the totals for the add form, and its item list for the order.
interface FromCalc {
  cost: string;
  sale: string;
  items: Item[];
}

export default function SalesPage() {
  const { state } = useSaleBook();
  // A viewer browses the months, weeks and marts, but makes and deletes none.
  const readOnly = useReadOnly();
  const { month, week } = pickedWeek(state);
  const note = useNote();
  const router = useRouter();
  const params = useSearchParams();
  // The quick calculator links here with ?cost=95000&sale=110000 (sale only when every item has one), and leaves its
  // item list in session storage.
  const [fromCalc] = useState<FromCalc | null>(() => {
    const cost = parseFloat(params.get("cost") ?? "");
    const sale = parseFloat(params.get("sale") ?? "");
    return cost > 0 ? { cost: String(cost), sale: sale > 0 ? String(sale) : "", items: takeItems(cost) } : null;
  });
  const [weekDialog, setWeekDialog] = useState<{ open: boolean; editing: Week | null }>({ open: false, editing: null });
  const [monthOpen, setMonthOpen] = useState(false);
  // The month (week null) or week being deleted.
  const [deleting, setDeleting] = useState<PeriodTarget | null>(null);
  // Bumped after a new week or month is made, so the form takes the focus for the first order.
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (!fromCalc) return;
    note.show(
      `លុយដើម ${fmt(+fromCalc.cost)}${fromCalc.sale ? ` និងលុយលក់ ${fmt(+fromCalc.sale)}` : ""}${fromCalc.items.length ? ` និងបញ្ជីទំនិញ ${fromCalc.items.length} មុខ` : ""} មកពីគណនារហ័ស · ${fromCalc.sale ? "ជ្រើសអ្នកលក់ ហើយចុចបន្ថែម។" : "ជ្រើសអ្នកលក់ ហើយបញ្ចូលលុយលក់។"}`,
    );
    // A reload should not bring the amounts back.
    router.replace("/sales", { scroll: false });
    dropItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the page opens
  }, []);

  function newWeek() {
    // Weeks are numbered 1–5, and a deleted week keeps its number until it is deleted for good.
    const held = trashedWeeks(state, month);
    if (month.weeks.length + held.length >= 5) {
      note.show(
        held.length
          ? `${monthLabel(month)} ប្រើលេខអាទិត្យ 1–5 អស់ហើយ · ${held.map((t) => weekLabel(t.week)).join(", ")} នៅក្នុង «${TRASH_NAME}» · លុបវាជារៀងរហូតពីទីនោះ ដើម្បីប្រើលេខវាវិញ ឬចុច «ខែថ្មី»។`
          : `${monthLabel(month)} មាន 5 អាទិត្យគ្រប់ហើយ · ចុច «ខែថ្មី» ដើម្បីចាប់ផ្តើមខែបន្ទាប់។`,
      );
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
        !readOnly && (
          <>
            <button type="button" className="btn btn-outline" onClick={() => setMonthOpen(true)}>
              <Icon name="plus" size={16} />
              ខែថ្មី
            </button>
            <button type="button" className="btn btn-outline" id="delete-month" onClick={() => setDeleting({ month, week: null })}>
              <Icon name="trash" size={16} />
              លុបខែ
            </button>
            <span className="period-sep" aria-hidden="true" />
          </>
        )
      }
    >
      {!readOnly && week && (
        <button type="button" className="btn btn-outline" onClick={() => setWeekDialog({ open: true, editing: week })}>
          <Icon name="edit" size={16} />
          កែថ្ងៃ
        </button>
      )}
      {!readOnly && (
        <button type="button" className="btn btn-outline" onClick={newWeek}>
          <Icon name="plus" size={16} />
          អាទិត្យថ្មី
        </button>
      )}
      {!readOnly && week && (
        <button type="button" className="btn btn-outline" id="delete-week" onClick={() => setDeleting({ month, week })}>
          <Icon name="trash" size={16} />
          លុបអាទិត្យ
        </button>
      )}
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
          <div className="card empty-card">{readOnly ? "ខែនេះមិនទាន់មានអាទិត្យ" : "ខែនេះមិនទាន់មានអាទិត្យ · ចុច «អាទិត្យថ្មី» ដើម្បីចាប់ផ្តើមបញ្ចូលការលក់"}</div>
        </>
      )}
      <WeekDialog open={weekDialog.open} month={month} editing={weekDialog.editing} onClose={() => setWeekDialog({ open: false, editing: null })} onDone={periodDone} />
      <MonthDialog open={monthOpen} onClose={() => setMonthOpen(false)} onDone={periodDone} />
      <DeletePeriodDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onDone={(text) => {
          setDeleting(null);
          note.show(text);
        }}
      />
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
  fromCalc: FromCalc | null;
  focusKey: number;
}) {
  const book = useSaleBook();
  const { state } = book;
  const readOnly = useReadOnly();
  // A viewer limited to one seller (the store already left everyone else's orders out).
  const onlySeller = readOnly ? book.access.seller : undefined;
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
  // The order open in the view dialog, by id, so the dialog follows edits made meanwhile (and closes if it goes).
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Each order's mart, by order id: a viewer's table holds every mart, and an order shown or printed names its own.
  const martOf = new Map(marts.flatMap((m) => m.orders.map((o) => [o.id, m] as const)));
  const viewing = viewingId ? (martOf.has(viewingId) ? (martOf.get(viewingId)!.orders.find((o) => o.id === viewingId) ?? null) : null) : null;
  const [deleting, setDeleting] = useState<Order | null>(null);
  // Ticked rows. They clear when the mart, filter or search changes, so a bulk action only reaches orders on screen.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState<Order[] | null>(null);
  const clearTicks = () => setSelected(new Set());
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
  // The calculator's item list goes with the next order, as long as the amounts are still its totals.
  const [calcItems, setCalcItems] = useState<Item[]>(fromCalc?.items ?? []);
  const itemsFor = (c: number, s: number) =>
    calcItems.length && calcItems.length <= 200 && sumItems(calcItems, "cost") === c && sumItems(calcItems, "sale") === s ? calcItems : null;
  const costRef = useRef<HTMLInputElement>(null);
  const saleRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const autoCode = sellerCode + nextCodeNumber(marts, sellerCode, state.codeFloor[key] ?? {});
  const typedCode = latinDigits(code.trim());
  const dup = codeEdited && typedCode ? findCode(marts, typedCode) : null;
  // A code typed that an order of the week already has: the form puts its amounts into that order instead of adding
  // one (e.g. an order made with its code first, its prices brought later from the calculator). Not a cancelled one.
  const fill = dup && dup.order.status !== "x" ? dup : null;
  const fillName = fill ? `#${fill.no}${fill.martId !== mart.id ? ` · ${fill.mart}` : ""}` : "";
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
    clearTicks();
    note.hide();
  }

  function addOrder(e: React.FormEvent) {
    e.preventDefault();
    const finalCode = typedCode || autoCode;
    const found = findCode(marts, finalCode);
    if (found) {
      if (found.order.status === "x") {
        codeRef.current?.focus();
        return;
      }
      fillOrder(found.order, found.martId);
      return;
    }
    // Prices are optional here: an empty box adds the order at 0, to fill in later in the table.
    const [c, s] = [parseFloat(cost) || 0, saleNum || 0];
    const order = { no: Math.max(0, ...mart.orders.map((o) => o.no)) + 1, code: finalCode, cost: c, sale: s, status: "u" as const, items: itemsFor(c, s) ?? [] };
    setCalcItems([]);
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

  // Puts the typed amounts into an order that already has the code; a box left empty keeps the order's amount. The table
  // then shows that order, marked like a new one, with the changed cells saying what they were.
  function fillOrder(o: Order, martId: string) {
    const patch: Partial<Pick<Order, "cost" | "sale" | "items">> = {};
    if (cost.trim() !== "") patch.cost = parseFloat(cost) || 0;
    if (sale.trim() !== "") patch.sale = saleNum || 0;
    if (!("cost" in patch) && !("sale" in patch)) {
      costRef.current?.focus();
      return;
    }
    const items = itemsFor(patch.cost ?? o.cost, patch.sale ?? o.sale);
    if (items) patch.items = items;
    setCalcItems([]);
    book.updateOrder(o.id, patch);
    const list = marts.find((m) => m.id === martId)?.orders ?? [];
    if (martId !== mart.id) setSheet(martId);
    setNewId(o.id);
    setFilter("all");
    setQuery("");
    setPage(Math.floor(Math.max(0, list.findIndex((x) => x.id === o.id)) / PAGE_SIZE));
    clearTicks();
    const was = (n: number) => (n ? fmt(n) : "0");
    const parts = [
      "cost" in patch ? `លុយដើម ${was(o.cost)} → ${fmt(patch.cost ?? 0)}` : "",
      "sale" in patch ? `លុយលក់ ${was(o.sale)} → ${fmt(patch.sale ?? 0)}` : "",
    ].filter(Boolean);
    note.show(`បានដាក់ចូលការបញ្ជាទិញ #${o.no} · ${o.code} · ${parts.join(" · ")}។`);
    setCost("");
    setSale("");
    setCode("");
    setCodeEdited(false);
    costRef.current?.focus();
    requestAnimationFrame(() => document.getElementById(`order-${o.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
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
    note.show(`បានលុបការបញ្ជាទិញ #${o.no}${o.code ? ` · ${o.code}` : ""}។`);
  }
  // The bar above the table: every ticked order at once, each saved as its own write like a change made in its row.
  function tick(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  function bulkStatus(orders: Order[], status: "p" | "u") {
    orders.forEach((o) => {
      if (o.status !== status) patch(o, { status });
    });
    clearTicks();
    note.show(`បានប្តូរ ${orders.length} ការបញ្ជាទិញ ទៅ «${STATUS[status].label}»។`);
  }
  function confirmBulkDelete() {
    const list = bulkDeleting ?? [];
    list.forEach((o) => book.deleteOrder(o.id));
    setBulkDeleting(null);
    clearTicks();
    note.show(`បានលុបការបញ្ជាទិញ ${list.length}។`);
  }
  function newMart() {
    const id = book.addMart();
    openSheet(id);
    note.show(`បានបន្ថែម Mart ${id} · មានតារាងទទេក្នុងគ្រប់អាទិត្យ · បញ្ចូលការបញ្ជាទិញនៅខាងលើ។`);
  }

  // The invoice is put on the page just for printing, then taken off once the print window closes.
  function printInvoice(o: Pick<Order, "no" | "code" | "sale" | "status" | "items"> & { id?: string }) {
    flushSync(() =>
      setInvoice({ no: o.no, code: o.code, seller: names.get(prefixOf(o.code)) ?? "", mart: (o.id && martOf.get(o.id)?.label) || mart.label, period: `${weekLabel(week)} · ${range}`, sale: o.sale, status: o.status, items: o.items }),
    );
    titleBefore.current = document.title;
    setDocTitle(`វិក្កយបត្រ #${o.no}${o.code ? ` ${o.code}` : ""}`);
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

  // A viewer sees every mart of the week in one table, and the totals and adjustments of all of them.
  const tableOrders = readOnly ? marts.flatMap((m) => m.orders) : mart.orders;
  const t = totals(tableOrders);
  const adjOf = (m: Mart, named: boolean) =>
    (state.adjustments[key]?.[m.id] ?? []).map(([no, c, amt]) => [no, named ? `${c} · ${m.label}` : c, amt] as [number, string, number]);
  const adj = readOnly ? marts.flatMap((m) => adjOf(m, marts.length > 1)) : adjOf(mart, false);
  const adjSum = adj.reduce((a, x) => a + x[2], 0);
  const count = (orders: Order[]) => totals(orders).count;
  const meta = `${mart.label} · ${weekLabel(week)} · ${range}`;
  const viewMeta = viewing ? `${martOf.get(viewing.id)?.label ?? mart.label} · ${weekLabel(week)} · ${range}` : meta;

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">
            {monthLabel(month)} · {weekLabel(week)} · {range}
            {onlySeller ? ` · តែ ${names.get(onlySeller) ?? onlySeller}` : ""}
          </span>
          <h1>តារាងលក់</h1>
        </div>
        <div className="actions" style={{ alignItems: "center" }}>
          {!readOnly && (
            <Tabs label="ជ្រើស Mart" id="sheet-tabs" value={mart.id} onPick={openSheet} items={marts.map((m) => ({ key: m.id, label: m.label, count: count(m.orders) }))} />
          )}
          {!readOnly && (
            <>
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
            </>
          )}
        </div>
      </header>

      {periodBar}
      {note.element}

      {!readOnly && (
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
                aria-invalid={dup && !fill ? true : undefined}
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
              {fill ? (
                <span className="sub t-accent" id="code-hint">
                  {`ការបញ្ជាទិញ #${fill.no} ${fill.mart} មានកូដនេះ · លុយដែលវាយ នឹងដាក់ចូលវា`}
                  {fill.order.cost || fill.order.sale ? ` (ជំនួស ${fmt(fill.order.cost)} / ${fmt(fill.order.sale)})` : ""}
                </span>
              ) : dup ? (
                <span className="field-error" id="code-hint">
                  កូដនេះមានរួចហើយ · #{dup.no} {dup.mart} · បោះបង់
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
                {fill ? `ដាក់ចូល ${fillName}` : "បន្ថែមការបញ្ជាទិញ"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="split" style={{ gap: 20 }}>
        <OrdersTable
          readOnly={readOnly}
          martOf={readOnly && marts.length > 1 ? new Map(Array.from(martOf, ([id, m]) => [id, m.label])) : undefined}
          orders={tableOrders}
          marts={marts}
          names={names}
          originals={originals}
          filter={filter}
          onFilter={(f) => {
            setFilter(f);
            setPage(0);
            clearTicks();
          }}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            setPage(0);
            clearTicks();
          }}
          page={page}
          onPage={setPage}
          newId={newId}
          onChange={patch}
          onToggleStatus={(o) => patch(o, { status: NEXT_STATUS[o.status] })}
          onToggleSent={(o) => patch(o, { sent: !o.sent })}
          onView={(o) => setViewingId(o.id)}
          onEdit={setEditing}
          onPrint={printInvoice}
          onDelete={setDeleting}
          selected={selected}
          onTick={tick}
          onClearTicks={clearTicks}
          onBulkStatus={bulkStatus}
          onBulkDelete={setBulkDeleting}
        />

        <aside className="grow-side">
          <section className="card" style={{ padding: "20px 24px", gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>{readOnly && marts.length > 1 ? "សរុបគ្រប់ Mart" : `សរុប ${mart.label}`}</h2>
            <dl className="totals">
              <div>
                <dt>ការបញ្ជាទិញ</dt>
                <dd>{t.count}</dd>
              </div>
              {/* A viewer is not shown cost prices or profit: their sales are the total. */}
              {!readOnly && (
                <div>
                  <dt>លុយដើម</dt>
                  <dd>{fmt(t.cost)}</dd>
                </div>
              )}
              <div className={readOnly ? "total" : undefined}>
                <dt>លុយលក់</dt>
                <dd>{fmt(t.sale)}</dd>
              </div>
              {!readOnly && (
                <>
                  <div className="total">
                    <dt>ចំណេញ</dt>
                    <dd className="t-success">{fmt(t.profit)}</dd>
                  </div>
                  <div>
                    <dt>អត្រាចំណេញ</dt>
                    <dd style={{ fontWeight: 400 }}>{margin(t.profit, t.sale)}</dd>
                  </div>
                </>
              )}
            </dl>
            {!readOnly && (
              <Link href="/sellers" style={{ fontSize: 13, fontWeight: 500 }}>
                ចែកចំណេញតាមអ្នកលក់
              </Link>
            )}
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

      <ViewDialog
        order={viewing}
        meta={viewMeta}
        seller={viewing ? (names.get(prefixOf(viewing.code)) ?? "") : ""}
        onClose={() => setViewingId(null)}
        onEdit={
          readOnly
            ? undefined
            : () => {
                setViewingId(null);
                setEditing(viewing);
              }
        }
        onPrint={() => viewing && printInvoice(viewing)}
      />
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
      <BulkDeleteDialog orders={bulkDeleting} meta={meta} onClose={() => setBulkDeleting(null)} onYes={confirmBulkDelete} />
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

