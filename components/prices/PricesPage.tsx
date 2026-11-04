"use client";

// «តម្លៃលក់» (sale prices): the shop's items with what each costs and what it sells for, per unit, and the profit on
// it. Items are added in the form at the top; their prices are changed right in the table (like amounts on the sales
// sheet), their name and unit with ✎. Owners and members only: cost prices are kept from viewers.
import { useEffect, useRef, useState } from "react";
import { fmt, latinDigits, margin, parseMoney } from "@/lib/format";
import { priceTitle } from "@/lib/history";
import type { PriceItem } from "@/lib/types";
import { Icon } from "../icons";
import { pagesOf, usePrices, useSaleBook } from "../store";
import { Dialog, Loading, MoneyCell } from "../ui";

const NAME_MAX = 60;
const UNIT_MAX = 20;

type Fields = Omit<PriceItem, "id">;
type FieldName = "name" | "cost" | "sale";

// A name or unit as it is saved: trimmed, one space between words.
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
// Two items are the same when name and unit match, whatever the case or spacing.
const sameItem = (a: Pick<Fields, "name" | "unit">, b: Pick<Fields, "name" | "unit">) =>
  tidy(a.name).toLowerCase() === tidy(b.name).toLowerCase() && tidy(a.unit).toLowerCase() === tidy(b.unit).toLowerCase();
// Money typed in a box ("44,000", "៤៤០០០") → a number, 0 when empty.
const money = (text: string) => parseMoney(latinDigits(text));
const profitClass = (p: number) => `strong ${p < 0 ? "t-danger" : p > 0 ? "t-success" : "muted"}`;

// The four boxes, checked: the error to show and which box it belongs to, or the item to save.
function check(f: { name: string; unit: string; cost: string; sale: string }, list: PriceItem[], self?: string): { error: string; field: FieldName } | Fields {
  const name = tidy(f.name);
  const unit = tidy(f.unit);
  if (!name) return { error: "បញ្ចូលឈ្មោះទំនិញ", field: "name" };
  const twin = list.find((p) => p.id !== self && sameItem(p, { name, unit }));
  if (twin) return { error: `មាន «${priceTitle(twin)}» ក្នុងតារាងរួចហើយ · កែតម្លៃរបស់វានៅក្នុងតារាង`, field: "name" };
  const cost = money(f.cost);
  const sale = money(f.sale);
  if (!(cost > 0)) return { error: "បញ្ចូលលុយដើម", field: "cost" };
  if (!(sale > 0)) return { error: "បញ្ចូលលុយលក់", field: "sale" };
  return { name, unit, cost, sale };
}

// "ចំណេញ 5,000 · 10.0% ក្នុងមួយគីឡូ" under the boxes, while both prices are typed.
function ProfitHint({ cost, sale, unit }: { cost: number; sale: number; unit: string }) {
  if (!(cost > 0 && sale > 0)) return <span className="sub"> </span>;
  const p = sale - cost;
  return (
    <span className={`sub${p < 0 ? " t-danger" : ""}`}>
      {p < 0 ? "លុយលក់ទាបជាងលុយដើម · ខាត " : "ចំណេញ "}
      <b className="num">{fmt(Math.abs(p))}</b>
      {` · ${margin(p, sale)}${tidy(unit) ? ` ក្នុងមួយ${tidy(unit)}` : ""}`}
    </span>
  );
}

// The four boxes, shared by the add form and the edit dialog. Ids start with `prefix`.
function PriceFields({
  prefix,
  values,
  onChange,
  error,
  nameRef,
  costRef,
  saleRef,
}: {
  prefix: string;
  values: { name: string; unit: string; cost: string; sale: string };
  onChange: (patch: Partial<{ name: string; unit: string; cost: string; sale: string }>) => void;
  error: { error: string; field: FieldName } | null;
  nameRef: React.Ref<HTMLInputElement>;
  costRef: React.Ref<HTMLInputElement>;
  saleRef: React.Ref<HTMLInputElement>;
}) {
  const bad = (f: FieldName) => (error?.field === f ? true : undefined);
  const errorId = `${prefix}-error`;
  return (
    <>
      <label className="field price-name" htmlFor={`${prefix}-name`}>
        ឈ្មោះទំនិញ
        <input
          ref={nameRef}
          className="input"
          id={`${prefix}-name`}
          type="text"
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="ឧ. សាច់ជ្រូក"
          value={values.name}
          aria-invalid={bad("name")}
          aria-describedby={errorId}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="field" htmlFor={`${prefix}-unit`}>
        ឯកតា
        <input
          className="input"
          id={`${prefix}-unit`}
          type="text"
          maxLength={UNIT_MAX}
          autoComplete="off"
          placeholder="ឧ. គីឡូ"
          value={values.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
        />
      </label>
      <label className="field" htmlFor={`${prefix}-cost`}>
        លុយដើម
        <input
          ref={costRef}
          className="input num"
          id={`${prefix}-cost`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={values.cost}
          aria-invalid={bad("cost")}
          aria-describedby={errorId}
          onChange={(e) => onChange({ cost: e.target.value })}
        />
      </label>
      <label className="field" htmlFor={`${prefix}-sale`}>
        លុយលក់
        <input
          ref={saleRef}
          className="input num"
          id={`${prefix}-sale`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={values.sale}
          aria-invalid={bad("sale")}
          aria-describedby={errorId}
          onChange={(e) => onChange({ sale: e.target.value })}
        />
      </label>
    </>
  );
}

const BLANK = { name: "", unit: "", cost: "", sale: "" };

function usePriceForm(start = BLANK) {
  const [values, setValues] = useState(start);
  const [error, setError] = useState<{ error: string; field: FieldName } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const saleRef = useRef<HTMLInputElement>(null);
  return {
    values,
    error,
    nameRef,
    costRef,
    saleRef,
    change: (patch: Partial<typeof BLANK>) => {
      setValues((v) => ({ ...v, ...patch }));
      setError(null);
    },
    reset: () => setValues(BLANK),
    // The item to save, or null after showing what is wrong.
    checked: (list: PriceItem[], self?: string): Fields | null => {
      const r = check(values, list, self);
      if ("error" in r) {
        setError(r);
        ({ name: nameRef, cost: costRef, sale: saleRef })[r.field].current?.focus();
        return null;
      }
      return r;
    },
  };
}

// ---------- Adding an item ----------

function AddForm({ list, onAdded }: { list: PriceItem[]; onAdded: (id: string) => void }) {
  const { addPrice } = useSaleBook();
  const form = usePriceForm();
  const { values } = form;
  return (
    <form
      className="card"
      aria-labelledby="add-title"
      style={{ padding: "20px 24px", gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const item = form.checked(list);
        if (!item) return;
        onAdded(addPrice(item));
        form.reset();
        form.nameRef.current?.focus();
      }}
    >
      <div className="card-head">
        <h2 id="add-title" style={{ fontSize: 16 }}>
          បន្ថែមទំនិញ
        </h2>
        <span className="sub">តម្លៃក្នុងមួយឯកតា · ឧ. សាច់ជ្រូក មួយគីឡូ</span>
      </div>
      <div className="price-grid">
        <PriceFields prefix="add" values={values} onChange={form.change} error={form.error} nameRef={form.nameRef} costRef={form.costRef} saleRef={form.saleRef} />
        <button type="submit" className="btn btn-primary">
          <Icon name="plus" size={16} />
          បន្ថែម
        </button>
      </div>
      {form.error ? (
        <span className="field-error" id="add-error" role="alert">
          {form.error.error}
        </span>
      ) : (
        <span id="add-error">
          <ProfitHint cost={money(values.cost)} sale={money(values.sale)} unit={values.unit} />
        </span>
      )}
    </form>
  );
}

// ---------- Editing an item (✎) and deleting one (bin) ----------

function EditForm({ item, list, onClose }: { item: PriceItem; list: PriceItem[]; onClose: () => void }) {
  const { updatePrice } = useSaleBook();
  const form = usePriceForm({ name: item.name, unit: item.unit, cost: String(item.cost), sale: String(item.sale) });
  const { values } = form;
  useEffect(() => {
    // Once the dialog is showing (showModal runs after its contents mount).
    const id = requestAnimationFrame(() => {
      form.nameRef.current?.focus();
      form.nameRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const next = form.checked(list, item.id);
        if (!next) return;
        // Only what changed, so the history line says just that.
        const patch = Object.fromEntries((Object.keys(next) as (keyof Fields)[]).filter((k) => next[k] !== item[k]).map((k) => [k, next[k]]));
        if (Object.keys(patch).length) updatePrice(item, patch);
        onClose();
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">តម្លៃលក់</span>
        <h2 id="price-edit-title">កែ «{priceTitle(item)}»</h2>
      </div>
      <div className="price-grid in-dialog">
        <PriceFields prefix="edit" values={values} onChange={form.change} error={form.error} nameRef={form.nameRef} costRef={form.costRef} saleRef={form.saleRef} />
      </div>
      {form.error ? (
        <span className="field-error" id="edit-error" role="alert">
          {form.error.error}
        </span>
      ) : (
        <span id="edit-error" style={{ marginTop: -6 }}>
          <ProfitHint cost={money(values.cost)} sale={money(values.sale)} unit={values.unit} />
        </span>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-default" onClick={onClose}>
          បោះបង់
        </button>
        <button type="submit" className="btn btn-primary">
          រក្សាទុក
        </button>
      </div>
    </form>
  );
}

function DeleteForm({ item, onClose }: { item: PriceItem; onClose: () => void }) {
  const { deletePrice } = useSaleBook();
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => noRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">តម្លៃលក់</span>
        <h2 id="price-delete-title">លុប «{priceTitle(item)}»?</h2>
      </div>
      <dl className="totals">
        <div>
          <dt>លុយដើម</dt>
          <dd>{fmt(item.cost)}</dd>
        </div>
        <div>
          <dt>លុយលក់</dt>
          <dd>{fmt(item.sale)}</dd>
        </div>
      </dl>
      <div className="dialog-actions">
        <button type="submit" className="btn btn-default" ref={noRef}>
          ទេ ទុកវិញ
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            deletePrice(item);
            onClose();
          }}
        >
          <Icon name="trash" size={16} />
          លុបចោល
        </button>
      </div>
    </form>
  );
}

// ---------- The page ----------

export default function PricesPage() {
  const { access, updatePrice } = useSaleBook();
  const { list, error } = usePrices(pagesOf(access) === null);
  const [query, setQuery] = useState("");
  const [newId, setNewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [deleting, setDeleting] = useState<PriceItem | null>(null);
  const scrollToNew = useRef(false);

  // A new item's row appears once the list has it; then it is scrolled to, once.
  useEffect(() => {
    if (!scrollToNew.current) return;
    const row = document.querySelector("#price-rows tr.is-new");
    if (!row) return;
    scrollToNew.current = false;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  const head = (
    <header className="page-head">
      <div className="stack">
        <span className="eyebrow">{list ? `${list.length} មុខ · លុយដើម និងលុយលក់ ក្នុងមួយឯកតា` : "លុយដើម និងលុយលក់ ក្នុងមួយឯកតា"}</span>
        <h1>តម្លៃលក់</h1>
      </div>
    </header>
  );

  if (error) {
    const denied = /permission/i.test(error);
    return (
      <>
        {head}
        <div className="card empty-card" role="alert">
          <span className="strong">មិនអាចបើកតារាងតម្លៃលក់បានទេ</span>
          <span className="sub">{denied ? "មូលដ្ឋានទិន្នន័យមិនទាន់អនុញ្ញាតតារាងនេះ · ម្ចាស់ហាងត្រូវដាក់ច្បាប់ firestore.rules ថ្មី" : error}</span>
        </div>
      </>
    );
  }
  if (!list) return <Loading />;

  const q = latinDigits(query.trim()).toLowerCase();
  const rows = q ? list.filter((p) => `${p.name} ${p.unit}`.toLowerCase().includes(q)) : list;

  return (
    <>
      {head}

      <AddForm
        list={list}
        onAdded={(id) => {
          setNewId(id);
          setQuery("");
          scrollToNew.current = true;
        }}
      />

      <section className="card" aria-labelledby="list-title">
        <div className="card-head" style={{ alignItems: "center" }}>
          <h2 id="list-title" style={{ fontSize: 16 }}>
            បញ្ជីតម្លៃ
          </h2>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              type="search"
              placeholder="ស្វែងរកទំនិញ"
              aria-label="ស្វែងរកទំនិញ"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap" style={{ margin: "0 -24px" }}>
          {/* The name takes what is left: at least ~175px, so a phone scrolls the table rather than cut the names. */}
          <table className="data fixed" style={{ minWidth: 760 }}>
            <colgroup>
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">ទំនិញ</th>
                <th scope="col">ឯកតា</th>
                <th scope="col" className="r">
                  <span className="th-edit">
                    លុយដើម <Icon name="edit" size={12} />
                  </span>
                </th>
                <th scope="col" className="r">
                  <span className="th-edit">
                    លុយលក់ <Icon name="edit" size={12} />
                  </span>
                </th>
                <th scope="col" className="r">
                  ចំណេញ
                </th>
                <th scope="col">
                  <span className="sr-only">កែ ឬលុប</span>
                </th>
              </tr>
            </thead>
            <tbody id="price-rows">
              {rows.length ? (
                rows.map((p) => {
                  const profit = p.sale - p.cost;
                  const title = priceTitle(p);
                  return (
                    <tr key={p.id} className={p.id === newId ? "is-new" : undefined}>
                      <td className="strong" title={p.name}>
                        {p.name}
                      </td>
                      <td title={p.unit}>{p.unit || <span className="muted">—</span>}</td>
                      <td className="cell">
                        <MoneyCell field="cost" value={p.cost} onChange={(n) => updatePrice(p, { cost: n })} label={`លុយដើម ${title}`} />
                      </td>
                      <td className="cell">
                        <MoneyCell field="sale" value={p.sale} onChange={(n) => updatePrice(p, { sale: n })} label={`លុយលក់ ${title}`} />
                      </td>
                      <td className="r">
                        {p.cost && p.sale ? (
                          <span className={profitClass(profit)}>{fmt(profit)}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions tight">
                          <button type="button" className="row-btn" aria-label={`កែ ${title}`} title="កែឈ្មោះ ឯកតា ឬតម្លៃ" onClick={() => setEditing(p)}>
                            <Icon name="edit" size={14} />
                          </button>
                          <button type="button" className="row-btn is-danger" aria-label={`លុប ${title}`} title="លុប" onClick={() => setDeleting(p)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty">
                  <td colSpan={6}>{list.length ? `គ្មានទំនិញត្រូវនឹង «${query.trim()}» ទេ` : "មិនទាន់មានទំនិញ · បន្ថែមទំនិញដំបូងនៅខាងលើ"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="sub" style={{ margin: 0 }}>
        ចុចលើលុយដើម ឬលុយលក់ ដើម្បីកែ · Enter ទៅជួរបន្ទាប់ · Esc បោះបង់ · ✎ កែឈ្មោះ ឬឯកតា។
      </p>

      <Dialog open={!!editing} onClose={() => setEditing(null)} labelledBy="price-edit-title" id="price-edit-dialog" wide>
        {editing && <EditForm key={editing.id} item={editing} list={list} onClose={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} labelledBy="price-delete-title" id="price-delete-dialog">
        {deleting && <DeleteForm key={deleting.id} item={deleting} onClose={() => setDeleting(null)} />}
      </Dialog>
    </>
  );
}
