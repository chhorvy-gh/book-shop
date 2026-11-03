"use client";

// One order at a glance, from the table's «មើល» button: its number and code, seller and status, and the ② sale list as
// the invoice prints it (ល.រ · ទំនិញ · ចំនួន · ទឹកប្រាក់) with the total. Copy (the item lines and total only, to paste
// in Telegram), print and edit are one click away.
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { fmt } from "@/lib/format";
import { STATUS, saleLines } from "@/lib/orders";
import type { Order } from "@/lib/types";
import { Icon } from "../icons";
import { Dialog, chipClass } from "../ui";

interface Props {
  meta: string;
  seller: string;
  onClose: () => void;
  onEdit?: () => void; // left out for a viewer, who cannot edit
  onPrint: () => void;
}

export default function ViewDialog({ order, ...rest }: Props & { order: Order | null }) {
  return (
    <Dialog open={!!order} onClose={rest.onClose} labelledBy="view-title" id="view-dialog">
      {order && <ViewForm key={order.id} order={order} {...rest} />}
    </Dialog>
  );
}

// What is copied: one line per item ("1 ទាស្រែ 1ក្បាល 31,000"), then the total.
function copiedText(lines: [string, string, number][], sale: number) {
  const rows = lines.map(([name, qty, amount], k) => [k + 1, name, qty, amount ? fmt(amount) : "—"].filter(Boolean).join(" "));
  return [...rows, `សរុប ${fmt(sale)}`].join("\n");
}

function ViewForm({ order, meta, seller, onClose, onEdit, onPrint }: Props & { order: Order }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // The copy button says "copied" for a moment after it is clicked.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Focus the close button once the dialog is showing, so Enter or Esc closes it; leaving clears the "copied" timer.
  useEffect(() => {
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timer.current);
    };
  }, []);
  const lines = saleLines(order);
  const status = STATUS[order.status];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="view-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="sub">{meta}</span>
          <h2 id="view-title" className="view-title">
            <span className="muted num">{order.no}</span>
            <span>{order.code || "—"}</span>
          </h2>
          <span className="sub">{seller ? `អ្នកលក់៖ ${seller}` : "មិនស្គាល់អ្នកលក់"}</span>
        </div>
        <span className={chipClass(status.tone)}>{status.label}</span>
      </div>
      <div className="view-items-wrap">
        <table className="view-items">
          <thead>
            <tr>
              <th scope="col">ល.រ</th>
              <th scope="col">ទំនិញ</th>
              <th scope="col">ចំនួន</th>
              <th scope="col" className="r">
                ទឹកប្រាក់
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map(([name, qty, amount], k) => (
                <tr key={k}>
                  <td>{k + 1}</td>
                  <td>{name}</td>
                  <td>{qty || "—"}</td>
                  <td className="r">{amount ? fmt(amount) : "—"}</td>
                </tr>
              ))
            ) : (
              <tr className="empty">
                <td colSpan={4}>មិនទាន់មានបញ្ជីទំនិញ · ចុច «កែ» ដើម្បីបិទភ្ជាប់បញ្ជី</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="r">
                សរុប
              </td>
              <td className="r">{fmt(order.sale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-outline"
          disabled={!lines.length}
          title="ចម្លងបញ្ជីទំនិញ និងសរុប"
          onClick={async () => {
            await copyText(copiedText(lines, order.sale));
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={16} />
          <span aria-live="polite">{copied ? "បានចម្លង" : "ចម្លង"}</span>
        </button>
        <button type="button" className="btn btn-outline" title="បោះពុម្ពវិក្កយបត្រ" onClick={onPrint}>
          <Icon name="print" size={16} />
          បោះពុម្ព
        </button>
        {onEdit && (
          <button type="button" className="btn btn-default" onClick={onEdit}>
            <Icon name="edit" size={16} />
            កែ
          </button>
        )}
        <button type="submit" className="btn btn-primary" ref={closeRef}>
          បិទ
        </button>
      </div>
    </form>
  );
}
