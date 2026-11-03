"use client";

// A seller's orders for the week or month on the profit-by-seller page, opened from the card's detail button:
// each order's number and code (and its mart when not the first), and a button that copies the seller's name and those
// codes (to paste in Telegram).
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import type { SellerLine } from "@/lib/periods";
import { Icon } from "../icons";
import { Dialog } from "../ui";

export interface SellerDetail {
  name: string;
  code: string;
  period: string; // the page's month, or month and week
  groups: { title: string; lines: SellerLine[] }[]; // the orders by week and then by code, as the card lists them
  martName: (mart: string) => string; // a mart's label, shown beside orders not from the first mart
}

// Orders from several weeks go under their week's name.
const titled = (d: SellerDetail) => d.groups.length > 1;

// What is copied: the name, then each order's code ("HENG12") on its own line.
function detailText(d: SellerDetail) {
  return [d.name, ...d.groups.flatMap((g) => [...(titled(d) ? ["", g.title] : []), ...g.lines.map((l) => l.code)])].join("\n");
}

export default function SellerDetailDialog({ detail, onClose }: { detail: SellerDetail | null; onClose: () => void }) {
  return (
    <Dialog open={!!detail} onClose={onClose} labelledBy="seller-detail-title" id="seller-detail">
      {detail && <DetailForm d={detail} onClose={onClose} />}
    </Dialog>
  );
}

function DetailForm({ d, onClose }: { d: SellerDetail; onClose: () => void }) {
  const copyRef = useRef<HTMLButtonElement>(null);
  // The copy button says "copied" for a moment after it is clicked.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Focus the copy button once the dialog is showing, so Enter copies; leaving clears the "copied" timer.
  useEffect(() => {
    const id = requestAnimationFrame(() => copyRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timer.current);
    };
  }, []);
  const count = d.groups.reduce((a, g) => a + g.lines.length, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">{d.period}</span>
        <h2 id="seller-detail-title">{d.name}</h2>
        <span className="sub">{`កូដ ${d.code} · ${count} ការបញ្ជាទិញ`}</span>
      </div>
      <div className="seller-detail-lines">
        {d.groups.map((g) => (
          <section key={g.title}>
            {titled(d) && <h3>{g.title}</h3>}
            <ul className="order-list">
              {g.lines.map((l, k) => (
                <li key={k}>
                  <span className="no num">{l.no}</span>
                  <span>{l.code}</span>
                  {l.mart !== "1" && <span className="sub">{d.martName(l.mart)}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="submit" className="btn btn-default">
          បិទ
        </button>
        <button
          type="button"
          className="btn btn-primary"
          id="seller-detail-copy"
          ref={copyRef}
          onClick={async () => {
            await copyText(detailText(d));
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={16} />
          <span aria-live="polite">{copied ? "បានចម្លង" : "ចម្លង"}</span>
        </button>
      </div>
    </form>
  );
}
