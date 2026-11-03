"use client";

// Edit one order (the mockup's #edit-dialog): its code, the ① cost list and ② sale list as pasted from Telegram,
// the amounts (summed from the lists when there are any), its status; print its invoice or delete it.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, latinDigits, prefixOf } from "@/lib/format";
import { STATUS, findCode, listText, readLists, sumItems } from "@/lib/orders";
import type { Item, Mart, Order, Status } from "@/lib/types";
import { Icon } from "../icons";
import { Dialog, Tabs } from "../ui";

export interface OrderEdit {
  code: string;
  cost: number;
  sale: number;
  status: Status;
  items: Item[];
}

function EditForm({
  order,
  meta,
  marts,
  names,
  onClose,
  onSave,
  onDelete,
  onPrint,
}: {
  order: Order;
  meta: string;
  marts: Mart[];
  names: Map<string, string>;
  onClose: () => void;
  onSave: (edit: OrderEdit) => void;
  onDelete: () => void;
  onPrint: (edit: OrderEdit) => void;
}) {
  const [code, setCode] = useState(order.code);
  const [costList, setCostList] = useState(order.items.length ? listText(order, "cost") : "");
  const [saleList, setSaleList] = useState(order.items.length ? listText(order, "sale") : "");
  // Typed totals, used while both lists are empty. Emptying the lists hands back the order's saved amounts.
  const [cost, setCost] = useState(order.cost ? String(order.cost) : "");
  const [sale, setSale] = useState(order.sale ? String(order.sale) : "");
  const [status, setStatus] = useState<Status>(order.status);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => codeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const { items, notes } = useMemo(() => readLists(costList, saleList), [costList, saleList]);
  const has = items.length > 0;
  // With item lists, the order's cost and sale are the sums of the lists; without them they are typed in.
  const totalCost = has ? sumItems(items, "cost") : parseFloat(cost) || 0;
  const totalSale = has ? sumItems(items, "sale") : parseFloat(sale) || 0;
  const profit = totalSale - totalCost;
  const changed = totalCost !== order.cost || totalSale !== order.sale;

  // Names the seller of the code; a duplicate code blocks saving, an unknown seller only warns. The code may be left
  // empty (as in the table): the order then counts for no seller until it has one.
  const clean = latinDigits(code.trim());
  const dup = clean ? findCode(marts, clean, order.id) : null;
  const seller = names.get(prefixOf(clean));
  const hint = !clean
    ? { cls: "sub", text: "គ្មានកូដ · មិនរាប់ទៅអ្នកលក់ណាទេ រហូតដល់មានកូដ" }
    : dup
      ? { cls: "field-error", text: `កូដនេះមានរួចហើយ · #${dup.no} ${dup.mart}` }
      : seller
        ? { cls: "sub", text: `អ្នកលក់៖ ${seller}` }
        : { cls: "field-error t-warning", text: "មិនស្គាល់អ្នកលក់នៃកូដនេះ" };
  const edit = (): OrderEdit => ({ code: clean, cost: totalCost, sale: totalSale, status, items });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (dup) {
      codeRef.current?.focus();
      return;
    }
    onSave(edit());
  }

  const listBox = (field: "cost" | "sale", mark: string, label: string, value: string, set: (v: string) => void, example: string) => (
    <label className="stack" htmlFor={`ed-${field}-list`} style={{ gap: 6, minWidth: 0 }}>
      <span className="item-list-label">
        {mark} បញ្ជី{label}
      </span>
      <textarea
        className="input textarea item-list-input"
        id={`ed-${field}-list`}
        rows={6}
        spellCheck={false}
        aria-describedby="ed-list-help ed-list-notes"
        placeholder={`បិទភ្ជាប់បញ្ជី${label}នៅទីនេះ…\n\nឧទាហរណ៍៖\n${example}`}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  return (
    <form noValidate onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">{meta}</span>
        <h2 id="ed-title">កែការបញ្ជាទិញ #{order.no}</h2>
      </div>
      <label className="field" htmlFor="ed-code">
        លេខកូដ
        <input
          ref={codeRef}
          className="input code-input"
          id="ed-code"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="ed-code-hint"
          aria-invalid={dup ? true : undefined}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <span id="ed-code-hint" className={hint.cls}>
          {hint.text}
        </span>
      </label>
      <div className="stack" style={{ gap: 8 }}>
        <h3>
          បញ្ជីទំនិញ <span className="sub">{has ? `· ${items.length} មុខ` : ""}</span>
        </h3>
        <div className="item-lists">
          {listBox("cost", "①", "លុយដើម", costList, setCostList, "មាន់ស្រែ1ក្បាល21500")}
          {listBox("sale", "②", "លុយលក់", saleList, setSaleList, "មាន់ស្រែ1ក្បាល24500")}
        </div>
        {notes.length > 0 && (
          <span className="sub t-warning" id="ed-list-notes" aria-live="polite">
            {notes.slice(0, 3).join(" · ")}
            {notes.length > 3 ? " · …" : ""}
          </span>
        )}
        <span className="sub" id="ed-list-help">
          មួយបន្ទាត់ មួយមុខ៖ ឈ្មោះ ចំនួន តម្លៃ (ឧ. មាន់ស្រែ1ក្បាល21500) · បន្ទាត់ទី 1 ជាលេខការបញ្ជាទិញ
        </span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
          <label className="field" htmlFor="ed-cost">
            លុយដើម
            <input
              className="input num"
              id="ed-cost"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              readOnly={has}
              value={has ? totalCost : cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="field" htmlFor="ed-sale">
            លុយលក់
            <input
              className="input num"
              id="ed-sale"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              readOnly={has}
              value={has ? totalSale : sale}
              onChange={(e) => setSale(e.target.value)}
            />
          </label>
          <div className="field">
            <span>ចំណេញ</span>
            <span className={`readout ${status === "x" || profit === 0 ? "muted" : profit < 0 ? "t-danger" : "t-success"}`}>{fmt(profit)}</span>
          </div>
        </div>
        {has && (
          <span className="sub">
            បូកពីបញ្ជីទំនិញខាងលើ{changed ? ` · មុននេះ លុយដើម ${fmt(order.cost)} · លុយលក់ ${fmt(order.sale)}` : ""}
          </span>
        )}
      </div>
      <div className="field">
        <span id="ed-status-label">ស្ថានភាព</span>
        <Tabs<Status>
          labelledBy="ed-status-label"
          value={status}
          onPick={setStatus}
          style={{ alignSelf: "flex-start" }}
          items={(Object.keys(STATUS) as Status[]).map((k) => ({ key: k, label: STATUS[k].label }))}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-danger-soft" style={{ marginRight: "auto" }} onClick={onDelete}>
          <Icon name="trash" size={16} />
          លុប
        </button>
        <button type="button" className="btn btn-outline" onClick={() => onPrint(edit())}>
          <Icon name="print" size={16} />
          បោះពុម្ពវិក្កយបត្រ
        </button>
        <button type="button" className="btn btn-default" onClick={onClose}>
          បិទ
        </button>
        <button type="submit" className="btn btn-primary">
          រក្សាទុក
        </button>
      </div>
    </form>
  );
}

export default function EditDialog(props: Omit<React.ComponentProps<typeof EditForm>, "order"> & { order: Order | null }) {
  const { order, ...rest } = props;
  return (
    <Dialog open={!!order} onClose={props.onClose} wide labelledBy="ed-title" id="edit-dialog">
      {order && <EditForm key={order.id} order={order} {...rest} />}
    </Dialog>
  );
}
