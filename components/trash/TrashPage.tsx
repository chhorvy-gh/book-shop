"use client";

// «បានលុបថ្មីៗ» (recently deleted): the months, weeks and marts deleted on the sales page, latest first, each with how
// many orders it holds. Restoring puts one back with its orders; deleting for good removes it and what it holds.
import { useEffect, useRef, useState } from "react";
import { restoreProblem, TRASH_NAME, trashEntries, type TrashEntry } from "@/lib/trash";
import type { TrashRef } from "@/lib/types";
import { Icon, type IconName } from "../icons";
import { useSaleBook } from "../store";
import { Dialog, useNote } from "../ui";

const ICON: Record<TrashRef["kind"], IconName> = { month: "month", week: "calendar", mart: "file" };
const keyOf = (r: TrashRef) => (r.kind === "month" ? `month-${r.month}` : r.kind === "week" ? `week-${r.month}-${r.no}` : `mart-${r.id}`);
const pad = (n: number) => String(n).padStart(2, "0");
// "03-11-2026 · 14:05", day first like the book's dates.
function when(at: number) {
  const d = new Date(at);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrashPage() {
  const book = useSaleBook();
  const note = useNote();
  const entries = trashEntries(book.state);
  // The entry asking to be deleted for good, with its order count when known.
  const [purging, setPurging] = useState<{ entry: TrashEntry; count: number | null } | null>(null);

  function restore(e: TrashEntry) {
    const problem = restoreProblem(book.state, e.ref);
    if (problem) return note.show(problem, true);
    book.restore(e.ref);
    note.show(`បានស្តារ «${e.title}» វិញ · ការបញ្ជាទិញរបស់វាត្រឡប់មកវិញទាំងអស់។`);
  }

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">ខែ អាទិត្យ និង Mart ដែលបានលុបពីតារាងលក់</span>
          <h1>{TRASH_NAME}</h1>
        </div>
      </header>
      <p className="muted" style={{ margin: 0 }}>
        អ្វីដែលលុប នៅទីនេះជាមួយការបញ្ជាទិញរបស់វា ហើយមិនរាប់ក្នុងទំព័រផ្សេងទៀតទេ រហូតដល់ស្តារវិញ ឬលុបជារៀងរហូត។
      </p>
      {note.element}
      {!entries.length ? (
        <div className="card empty-card">មិនមានអ្វីដែលបានលុបទេ</div>
      ) : (
        <section className="card" aria-label={TRASH_NAME}>
          <ul className="trash-list">
            {entries.map((e) => (
              <TrashRow key={keyOf(e.ref)} entry={e} onRestore={() => restore(e)} onPurge={(count) => setPurging({ entry: e, count })} />
            ))}
          </ul>
        </section>
      )}
      <Dialog open={!!purging} onClose={() => setPurging(null)} labelledBy="purge-title" id="purge-dialog">
        {purging && (
          <PurgeForm
            entry={purging.entry}
            count={purging.count}
            onClose={() => setPurging(null)}
            onDone={(text) => {
              setPurging(null);
              if (text) note.show(text);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function TrashRow({ entry, onRestore, onPurge }: { entry: TrashEntry; onRestore: () => void; onPurge: (count: number | null) => void }) {
  const book = useSaleBook();
  // How many orders it holds, asked from the server once; null while asking or when it cannot be asked (offline).
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    book.trashOrders(entry.ref).then(
      (n) => live && setCount(n),
      () => live && setCount(null),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per entry
  }, [keyOf(entry.ref)]);

  return (
    <li>
      <span className="avatar" aria-hidden="true">
        <Icon name={ICON[entry.ref.kind]} size={18} />
      </span>
      <span className="stack">
        <span className="strong">{entry.title}</span>
        <span className="sub">{`${entry.kind} · ${entry.sub}${count === null ? "" : ` · ការបញ្ជាទិញ ${count}`}`}</span>
        <span className="sub">{`លុបនៅ ${when(entry.deleted.at)} · ${entry.deleted.by}`}</span>
      </span>
      <span className="trash-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onRestore}>
          ស្តារវិញ
        </button>
        <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => onPurge(count)}>
          <Icon name="trash" size={14} />
          លុបជារៀងរហូត
        </button>
      </span>
    </li>
  );
}

function PurgeForm({ entry, count, onClose, onDone }: { entry: TrashEntry; count: number | null; onClose: () => void; onDone: (text: string) => void }) {
  const book = useSaleBook();
  const [busy, setBusy] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  // "No" has the focus, so Enter keeps it.
  useEffect(() => {
    const raf = requestAnimationFrame(() => noRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);
  const orders = count === null ? "ការបញ្ជាទិញទាំងអស់" : `ការបញ្ជាទិញ ${count}`;

  async function yes() {
    setBusy(true);
    const ok = await book.purge(entry.ref);
    // A failure shows in the book's error banner; the entry stays here to try again.
    onDone(ok ? `បានលុប «${entry.title}» ជារៀងរហូត។` : "");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">{`${entry.kind} · ${entry.sub}`}</span>
        <h2 id="purge-title">លុប «{entry.title}» ជារៀងរហូត?</h2>
      </div>
      <p className="alert alert-danger" style={{ margin: 0, fontSize: 14 }}>
        <Icon name="alert" size={18} />
        <span>
          {entry.ref.kind === "mart"
            ? `${orders} របស់ Mart នេះក្នុងគ្រប់អាទិត្យ នឹងបាត់ទាំងស្រុង។`
            : `${orders} កំណត់ចំណាំ និងតារាងទូទាត់របស់វា នឹងបាត់ទាំងស្រុង។`}{" "}
          លុបហើយ មិនអាចយកមកវិញបានទេ។
        </span>
      </p>
      <div className="dialog-actions">
        <button type="submit" className="btn btn-default" ref={noRef} disabled={busy}>
          ទេ ទុកវិញ
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void yes()}>
          <Icon name="trash" size={16} />
          {busy ? "កំពុងលុប…" : "លុបជារៀងរហូត"}
        </button>
      </div>
    </form>
  );
}
