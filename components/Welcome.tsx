"use client";

// A shop with no month yet: make the first month (with its first week), or load the mockup's sample week to try things.
import { useState } from "react";
import Link from "next/link";
import { monthLabel } from "@/lib/periods";
import { TRASH_NAME } from "@/lib/trash";
import MonthDialog from "./dialogs/MonthDialog";
import { Icon } from "./icons";
import { salesOnly, useSaleBook } from "./store";

export default function Welcome() {
  const { state, access, loadSample } = useSaleBook();
  // A sales-only member makes the first month, but cannot load the sample (it has notes) or open the deleted page.
  const limited = salesOnly(access);
  const [monthOpen, setMonthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">សៀវភៅលក់ថ្មី</span>
          <h1>ចាប់ផ្តើម</h1>
        </div>
      </header>
      <section className="card" style={{ maxWidth: 640 }}>
        <div className="stack">
          <h2>មិនទាន់មានខែណាមួយនៅឡើយ</h2>
          <span className="sub">តារាងលក់ទុកការបញ្ជាទិញតាមខែ និងអាទិត្យ · បង្កើតខែដំបូង ដើម្បីចាប់ផ្តើមបញ្ចូលការលក់</span>
        </div>
        <ol className="steps">
          <li>
            <a
              href="#"
              className="is-now"
              onClick={(e) => {
                e.preventDefault();
                setMonthOpen(true);
              }}
            >
              <span className="dot is-now">1</span>
              <span className="stack">
                <span className="strong">បង្កើតខែដំបូង</span>
                <span className="sub">ខែ និងថ្ងៃនៃអាទិត្យទី 1</span>
              </span>
              <Icon name="arrow" size={16} />
            </a>
          </li>
          {!limited && (
            <li>
              <a
                href="#"
                aria-disabled={busy}
                onClick={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  await loadSample();
                  setBusy(false);
                }}
              >
                <span className="dot is-next">2</span>
                <span className="stack">
                  <span className="strong">{busy ? "កំពុងដាក់ទិន្នន័យគំរូ…" : "ឬ ដាក់ទិន្នន័យគំរូ ដើម្បីសាកល្បង"}</span>
                  <span className="sub">អាទិត្យទី 3 ខែតុលា 2026 · Mart 1 និង Mart 2 · អ្នកលក់ 21 នាក់ · កំណត់ចំណាំ</span>
                </span>
                <Icon name="download" size={16} />
              </a>
            </li>
          )}
        </ol>
        {!limited && state.trash.months.length > 0 && (
          <Link className="alert alert-warning" href="/trash" style={{ fontSize: 14 }}>
            <Icon name="trash" size={18} />
            <span>
              {`${state.trash.months.map((t) => monthLabel(t.month)).join(", ")} នៅក្នុង «${TRASH_NAME}» · ចុចទីនេះ ដើម្បីស្តារវិញ`}
            </span>
          </Link>
        )}
      </section>
      <MonthDialog open={monthOpen} onClose={() => setMonthOpen(false)} onDone={() => setMonthOpen(false)} />
    </>
  );
}
