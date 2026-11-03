"use client";

// The sales page's smaller dialogs, as in the mockup: new seller, edit/delete a mart, delete an order, Excel export.
import { useEffect, useRef, useState } from "react";
import { downloadSales, EXPORT_ERROR } from "@/lib/export";
import { BAD_SELLER_CODE, fmt } from "@/lib/format";
import { STATUS, totals } from "@/lib/orders";
import { martLabel } from "@/lib/periods";
import { TRASH_NAME } from "@/lib/trash";
import type { Mart, Order, Seller } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { Dialog, Tabs } from "../ui";

// Focus a box once the dialog has opened (showModal runs after the dialog's contents mount).
function useFocusOnOpen(ref: React.RefObject<HTMLInputElement | HTMLButtonElement | null>, select = false) {
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (select && el instanceof HTMLInputElement) el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [ref, select]);
}

// ---------- New seller ----------
// A name and the letters their order codes start with (សុខ → សុខ1, សុខ2 …). Until the code is typed by hand it follows
// the name without a leading «បង». Opened from an unknown code in the form, it starts with that code's letters.

function SellerForm({ name0, code0, onClose, onAdded }: { name0: string; code0: string; onClose: () => void; onAdded: (s: Seller) => void }) {
  const { state, addSeller } = useSaleBook();
  const [name, setName] = useState(name0);
  const [code, setCode] = useState(code0 || name0.replace(/^បង\s*/, ""));
  const [codeTyped, setCodeTyped] = useState(!!code0);
  const [error, setError] = useState<{ text: string; field: "name" | "code" } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  useFocusOnOpen(name0 ? codeRef : nameRef, !!name0);
  const c = code.trim();
  const help = c && !BAD_SELLER_CODE.test(c) ? `កូដការបញ្ជាទិញ៖ ${c}1, ${c}2, ${c}3 …` : "តែអក្សរ · លេខបន្ថែមដោយស្វ័យប្រវត្តិ";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, " ");
    // A name or code may not be another seller's name or code: the pages look sellers up by either.
    const owner = (v: string) => state.sellers.find((s) => s.name === v || s.code === v);
    const fail = (text: string, field: "name" | "code") => {
      setError({ text, field });
      (field === "name" ? nameRef : codeRef).current?.focus();
    };
    if (!n) return fail("បញ្ចូលឈ្មោះអ្នកលក់", "name");
    const byName = owner(n);
    if (byName) return fail(byName.name === n ? `មានអ្នកលក់ឈ្មោះ «${n}» រួចហើយ` : `«${n}» ជាកូដរបស់ ${byName.name} រួចហើយ · ដាក់ឈ្មោះផ្សេង`, "name");
    if (!c) return fail("បញ្ចូលកូដ", "code");
    if (BAD_SELLER_CODE.test(c)) return fail("កូដមិនអាចមានលេខ វង់ក្រចក ឬដកឃ្លា · លេខបន្ថែមដោយស្វ័យប្រវត្តិ", "code");
    const byCode = owner(c);
    if (byCode) return fail(`កូដ «${c}» ជារបស់ ${byCode.name} រួចហើយ`, "code");
    addSeller({ name: n, code: c });
    onAdded({ name: n, code: c });
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="seller-dialog-title">បន្ថែមអ្នកលក់ថ្មី</h2>
        <span className="sub">បង្ហាញក្នុងគ្រប់ទំព័រ · ចំណេញតាមអ្នកលក់ ទូទាត់ប្រចាំអាទិត្យ សង្ខេបប្រចាំខែ</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        <label className="field" htmlFor="seller-name">
          ឈ្មោះ
          <input
            ref={nameRef}
            className="input"
            id="seller-name"
            type="text"
            maxLength={20}
            autoComplete="off"
            placeholder="ឧ. បងសុខ"
            value={name}
            aria-invalid={error?.field === "name" ? true : undefined}
            aria-describedby="seller-error"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              if (!codeTyped) setCode(e.target.value.trim().replace(/^បង\s*/, ""));
            }}
          />
        </label>
        <label className="field" htmlFor="seller-code">
          កូដ
          <input
            ref={codeRef}
            className="input code-input"
            id="seller-code"
            type="text"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            placeholder="ឧ. សុខ"
            value={code}
            aria-invalid={error?.field === "code" ? true : undefined}
            aria-describedby="seller-code-help seller-error"
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
              setCodeTyped(e.target.value.trim() !== "");
            }}
          />
        </label>
      </div>
      <span className="sub" id="seller-code-help" style={{ marginTop: -6 }}>
        {help}
      </span>
      {error && (
        <span className="field-error" id="seller-error" role="alert">
          {error.text}
        </span>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-default" onClick={onClose}>
          បោះបង់
        </button>
        <button type="submit" className="btn btn-primary">
          បន្ថែមអ្នកលក់
        </button>
      </div>
    </form>
  );
}

export function SellerDialog(props: { open: boolean; name0: string; code0: string; onClose: () => void; onAdded: (s: Seller) => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} labelledBy="seller-dialog-title" id="seller-dialog">
      <SellerForm {...props} />
    </Dialog>
  );
}

// ---------- Edit / delete a mart ----------
// «កែ Mart» renames the mart on screen or deletes it; Mart 1 and Mart 2 can only be renamed. Deleting a mart that has
// orders asks first, saying how many orders in how many weeks go with it. It goes to «បានលុបថ្មីៗ», where it can be
// restored with its orders.

const BAD_NAME = /[\\/?*[\]:"<>|]/; // characters an Excel tab or file name cannot hold

function MartForm({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (text: string, deleted?: boolean) => void }) {
  const book = useSaleBook();
  const { state } = book;
  const label = martLabel(state, id);
  const base = id === "1" || id === "2";
  const [name, setName] = useState(label);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ orders: number; weeks: number; sale: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  useFocusOnOpen(nameRef, true);
  // How many orders the mart has in every week, asked from the server (older months are not loaded on this device).
  useEffect(() => {
    let live = true;
    book.martStats(id).then(
      (s) => live && setStats(s),
      () => live && setStats({ orders: 0, weeks: 0, sale: 0 }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [id]);
  useEffect(() => {
    if (confirm) noRef.current?.focus();
  }, [confirm]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let n = name.trim().replace(/\s+/g, " ");
    if (n === `Mart ${id}`) n = "";
    if (BAD_NAME.test(n)) return setError('ឈ្មោះមិនអាចមានសញ្ញា \\ / ? * [ ] : " < > | ទេ');
    const next = n || `Mart ${id}`;
    if (state.marts.some((s) => s !== id && martLabel(state, s).toLowerCase() === next.toLowerCase())) {
      return setError(`ឈ្មោះ «${next}» មានរួចហើយ · ជ្រើសឈ្មោះផ្សេង`);
    }
    book.renameMart(id, n);
    onDone(label !== next ? `បានប្តូរឈ្មោះ ${label} → ${next}។` : "");
  }
  function remove() {
    setBusy(true);
    book.deleteMart(id);
    onDone(`បានលុប ${label} · ស្តារវិញបាននៅទំព័រ «${TRASH_NAME}»។`, true);
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="mart-dialog-title">កែ {label}</h2>
        <span className="sub">
          {!stats ? "…" : stats.orders ? `មានការបញ្ជាទិញ ${stats.orders} ក្នុង ${stats.weeks} អាទិត្យ` : "មិនទាន់មានការបញ្ជាទិញក្នុងអាទិត្យណាមួយ"}
        </span>
      </div>
      <label className="field" htmlFor="mart-name">
        ឈ្មោះ
        <input
          ref={nameRef}
          className="input"
          id="mart-name"
          type="text"
          maxLength={24}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Mart ${id}`}
          value={name}
          disabled={confirm}
          aria-invalid={error ? true : undefined}
          aria-describedby="mart-name-help mart-error"
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        <span className="sub" id="mart-name-help" style={{ fontWeight: 400 }}>
          ទុកទទេ ដើម្បីប្រើឈ្មោះដើម «Mart {id}»{base ? ` · Mart ${id} ជាតារាងគោល ប្តូរឈ្មោះបាន តែលុបមិនបាន` : ""}
        </span>
      </label>
      {error && (
        <span className="field-error" id="mart-error" role="alert">
          {error}
        </span>
      )}
      {!confirm ? (
        <div className="dialog-actions">
          {!base && (
            <button
              type="button"
              className="btn btn-danger-soft"
              style={{ marginRight: "auto" }}
              disabled={!stats}
              onClick={() => (stats?.orders ? setConfirm(true) : remove())}
            >
              <Icon name="trash" size={16} />
              លុប Mart
            </button>
          )}
          <button type="button" className="btn btn-default" onClick={onClose}>
            បោះបង់
          </button>
          <button type="submit" className="btn btn-primary">
            រក្សាទុក
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <p className="alert alert-danger" style={{ margin: 0, fontSize: 14 }}>
            លុប «{label}» និងការបញ្ជាទិញ {stats?.orders} ក្នុង {stats?.weeks} អាទិត្យ (លុយលក់ {fmt(stats?.sale ?? 0)})? វាទៅនៅទំព័រ «{TRASH_NAME}» ·
            ស្តារវិញបាន។
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-default" ref={noRef} onClick={() => setConfirm(false)}>
              ទេ ទុកវិញ
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
              លុបចោល
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function MartDialog(props: { open: boolean; id: string; onClose: () => void; onDone: (text: string, deleted?: boolean) => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} labelledBy="mart-dialog-title" id="mart-dialog">
      <MartForm {...props} />
    </Dialog>
  );
}

// ---------- Delete an order ----------
// Asks first, showing what goes. The other orders keep their numbers.

export function DeleteDialog({
  order,
  meta,
  seller,
  onClose,
  onYes,
}: {
  order: Order | null;
  meta: string;
  seller: string;
  onClose: () => void;
  onYes: (o: Order) => void;
}) {
  const noRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={!!order} onClose={onClose} labelledBy="del-title" id="delete-dialog">
      {order && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <FocusOnOpen target={noRef} />
          <div className="stack" style={{ gap: 4 }}>
            <span className="sub">{meta}</span>
            <h2 id="del-title">
              លុបការបញ្ជាទិញ #{order.no}
              {order.code ? ` · ${order.code}` : ""}?
            </h2>
          </div>
          <dl className="totals">
            <div>
              <dt>អ្នកលក់</dt>
              <dd>{seller || "មិនស្គាល់"}</dd>
            </div>
            <div>
              <dt>លុយដើម</dt>
              <dd>{fmt(order.cost)}</dd>
            </div>
            <div>
              <dt>លុយលក់</dt>
              <dd>{fmt(order.sale)}</dd>
            </div>
            <div>
              <dt>ស្ថានភាព</dt>
              <dd>{STATUS[order.status].label}</dd>
            </div>
          </dl>
          <p className="alert alert-danger" style={{ margin: 0, fontSize: 14 }}>
            លុបហើយ មិនអាចយកមកវិញបានទេ។ បើការបញ្ជាទិញនេះគ្រាន់តែមិនបានលក់ ប្តូរស្ថានភាពទៅ «បោះបង់» វិញ ដើម្បីទុកវាក្នុងតារាង។
          </p>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-default" ref={noRef}>
              ទេ ទុកវិញ
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onYes(order)}>
              <Icon name="trash" size={16} />
              លុបចោល
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// The ticked orders in the table, deleted together after one question, as the bin in a row asks for one.
export function BulkDeleteDialog({ orders, meta, onClose, onYes }: { orders: Order[] | null; meta: string; onClose: () => void; onYes: () => void }) {
  const noRef = useRef<HTMLButtonElement>(null);
  const list = orders ?? [];
  const codes = list.slice(0, 6).map((o) => o.code || `#${o.no}`).join(", ") + (list.length > 6 ? ` … +${list.length - 6}` : "");
  return (
    <Dialog open={!!orders} onClose={onClose} labelledBy="bulk-del-title" id="bulk-delete-dialog">
      {orders && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <FocusOnOpen target={noRef} />
          <div className="stack" style={{ gap: 4 }}>
            <span className="sub">{meta}</span>
            <h2 id="bulk-del-title">លុបការបញ្ជាទិញ {list.length}?</h2>
          </div>
          <dl className="totals">
            <div>
              <dt>កូដ</dt>
              <dd>{codes}</dd>
            </div>
            <div>
              <dt>លុយដើម</dt>
              <dd>{fmt(list.reduce((a, o) => a + o.cost, 0))}</dd>
            </div>
            <div>
              <dt>លុយលក់</dt>
              <dd>{fmt(list.reduce((a, o) => a + o.sale, 0))}</dd>
            </div>
          </dl>
          <p className="alert alert-danger" style={{ margin: 0, fontSize: 14 }}>
            លុបហើយ មិនអាចយកមកវិញបានទេ។ បើការបញ្ជាទិញគ្រាន់តែមិនបានលក់ ប្តូរស្ថានភាពទៅ «បោះបង់» វិញ ដើម្បីទុកវាក្នុងតារាង។
          </p>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-default" ref={noRef}>
              ទេ ទុកវិញ
            </button>
            <button type="button" className="btn btn-danger" onClick={onYes}>
              <Icon name="trash" size={16} />
              លុបចោល
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function FocusOnOpen({ target }: { target: React.RefObject<HTMLButtonElement | null> }) {
  useFocusOnOpen(target);
  return null;
}

// ---------- Export ----------
// Pick one mart or all of them (one tab each), and the full sheet or cost price only. It opens on the mart on screen;
// the kind picked last is kept by the page.

export type ExportKind = "full" | "cost";
const EX_KIND: Record<ExportKind, [string, string, string]> = {
  full: ["តារាងពេញ", "លេខ · កូដ · លុយដើម · លុយលក់ · ចំណេញ", "តារាងលក់"],
  cost: ["តែលុយដើម", "លេខ · លុយដើម · គ្មានកូដ (ឈ្មោះអ្នកលក់) · គ្មានឈ្មោះជួរឈរ · គ្មានលុយលក់ និងចំណេញ", "លុយដើម"],
};
const listOf = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} និង ${names[names.length - 1]}`);

function ExportForm({
  marts,
  martId,
  kind,
  onKind,
  sub,
  week,
  range,
  onClose,
  onDone,
}: {
  marts: Mart[];
  martId: string;
  kind: ExportKind;
  onKind: (k: ExportKind) => void;
  sub: string;
  week: string;
  range: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [mart, setMart] = useState(martId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = mart === "all" ? marts : marts.filter((m) => m.id === mart);
  const t = totals(chosen.flatMap((m) => m.orders));
  const costOnly = kind === "cost";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const head = `គិតលុយ${week} · ${range}`;
    setBusy(true);
    setError("");
    try {
      await downloadSales({
        fileName: `${EX_KIND[kind][2]} ${week} ${range}${mart === "all" ? "" : ` ${chosen[0].label}`}.xlsx`,
        active: Math.max(0, chosen.findIndex((m) => m.id === martId)),
        costOnly,
        sheets: chosen.map((m) => ({
          name: m.label,
          title: `${head} · ${m.label}${costOnly ? " · លុយដើម" : ""}`,
          rows: m.orders.map(({ no, code, cost, sale, status }) => ({ no, code, cost, sale, status })),
        })),
      });
      onDone(
        `បានទាញយក Excel · ${listOf(chosen.map((m) => m.label))} · ${EX_KIND[kind][0]} · ${week} · ${range}${mart === "all" ? " · Mart នីមួយៗនៅផ្ទាំងដាច់ពីគ្នា។" : "។"}`,
      );
    } catch {
      setError(EXPORT_ERROR);
    }
    setBusy(false);
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="ex-title">នាំចេញ Excel</h2>
        <span className="sub">{sub}</span>
      </div>
      <div className="field">
        <span id="ex-mart-label">Mart</span>
        <Tabs
          labelledBy="ex-mart-label"
          value={mart}
          onPick={setMart}
          style={{ alignSelf: "flex-start" }}
          items={[
            ...marts.map((m) => ({ key: m.id, label: m.label, count: totals(m.orders).count })),
            { key: "all", label: marts.length === 2 ? "ទាំងពីរ" : "ទាំងអស់" },
          ]}
        />
      </div>
      <div className="field">
        <span id="ex-kind-label">ទិន្នន័យ</span>
        <Tabs<ExportKind>
          labelledBy="ex-kind-label"
          value={kind}
          onPick={onKind}
          style={{ alignSelf: "flex-start" }}
          items={[
            { key: "full", label: EX_KIND.full[0] },
            { key: "cost", label: EX_KIND.cost[0] },
          ]}
        />
        <span className="sub" style={{ fontWeight: 400 }}>
          {EX_KIND[kind][1]}
          {mart === "all" ? " · Mart នីមួយៗនៅផ្ទាំងដាច់ពីគ្នា" : ""}
        </span>
      </div>
      {/* What goes into the file, so the numbers can be checked before downloading. */}
      <dl className="totals">
        <div>
          <dt>ការបញ្ជាទិញ</dt>
          <dd>{t.count}</dd>
        </div>
        {costOnly ? (
          <div className="total">
            <dt>លុយដើមសរុប</dt>
            <dd>{fmt(t.cost)}</dd>
          </div>
        ) : (
          <>
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
              <dd>
                <span className="t-success">{fmt(t.profit)}</span>
              </dd>
            </div>
          </>
        )}
      </dl>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-default" onClick={onClose}>
          បោះបង់
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name="download" size={16} />
          ទាញយក Excel
        </button>
      </div>
    </form>
  );
}

export function ExportDialog(props: React.ComponentProps<typeof ExportForm> & { open: boolean }) {
  const { open, ...rest } = props;
  return (
    <Dialog open={open} onClose={props.onClose} labelledBy="ex-title" id="export-dialog">
      <ExportForm {...rest} />
    </Dialog>
  );
}
