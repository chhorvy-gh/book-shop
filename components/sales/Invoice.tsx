"use client";

// The customer's invoice for one order (the mockup's .invoice): the ② sale list and its total; cost and profit never go
// on paper. Item lines that do not add up to the order's sale get one adjustment line, so the paper always adds up.
// Put straight under <body> while printing; mockup.css hides everything else on paper.
import { createPortal } from "react-dom";
import { fmt, todayText } from "@/lib/format";
import { STATUS, saleLines } from "@/lib/orders";
import type { InvoiceData } from "@/lib/types";
import { LogoMark } from "../icons";

export default function Invoice({ data }: { data: InvoiceData }) {
  const lines = saleLines(data);
  if (!lines.length) lines.push([`ទំនិញតាមការបញ្ជាទិញ #${data.no}`, "", data.sale]);
  const meta: [string, React.ReactNode][] = [
    ["លេខកូដ", <b key="c">{data.code || "—"}</b>],
    ["ការបញ្ជាទិញ", `#${data.no}`],
    ["អ្នកលក់", data.seller || "—"],
    ["ផ្សារ", data.mart],
    ["អាទិត្យ", data.period],
    ["ថ្ងៃបោះពុម្ព", todayText()],
  ];
  return createPortal(
    <div className="invoice" aria-hidden="true">
      <header className="inv-head">
        <div className="inv-brand">
          <span className="inv-mark">
            <LogoMark size={18} />
          </span>
          <span>
            <b>សៀវភៅលក់</b>
            <small>LL Sales Book</small>
          </span>
        </div>
        <div className="inv-title">
          <h1>វិក្កយបត្រ</h1>
          <small>INVOICE</small>
        </div>
      </header>
      <dl className="inv-meta">
        {meta.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </div>
        ))}
      </dl>
      <table className="inv-items">
        <thead>
          <tr>
            <th>ល.រ</th>
            <th>ទំនិញ</th>
            <th>ចំនួន</th>
            <th>ទឹកប្រាក់ (៛)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(([name, qty, amount], k) => (
            <tr key={k}>
              <td>{k + 1}</td>
              <td>{name}</td>
              <td>{qty || "—"}</td>
              <td>{amount ? fmt(amount) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>សរុប</th>
            <td>{fmt(data.sale)} ៛</td>
          </tr>
        </tfoot>
      </table>
      <div className="inv-foot">
        <span className={`inv-stamp is-${data.status}`}>{STATUS[data.status].label}</span>
        <span>សូមអរគុណ!</span>
      </div>
    </div>,
    document.body,
  );
}
