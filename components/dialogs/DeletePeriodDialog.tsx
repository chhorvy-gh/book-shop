"use client";

// «លុបខែ» / «លុបអាទិត្យ» on the sales page: asks first, showing what goes with the month or week, then moves it to
// «បានលុបថ្មីៗ» (recently deleted), where it can be restored with its orders or deleted for good.
import { useEffect, useRef } from "react";
import { fmt } from "@/lib/format";
import { bookMonths, monthId, monthLabel, weekKey, weekLabel, weekMarts, weekRange } from "@/lib/periods";
import { TRASH_NAME } from "@/lib/trash";
import type { Month, Week } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { Dialog } from "../ui";

// week null = the whole month.
export type PeriodTarget = { month: Month; week: Week | null };

function DeleteForm({ target, onClose, onDone }: { target: PeriodTarget; onClose: () => void; onDone: (text: string) => void }) {
  const book = useSaleBook();
  const { state } = book;
  const { month, week } = target;
  const id = monthId(month);
  const noRef = useRef<HTMLButtonElement>(null);
  // "No" has the focus, so Enter keeps it.
  useEffect(() => {
    const raf = requestAnimationFrame(() => noRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // What goes with it (the month on screen is always loaded): its orders (cancelled too), their sale, its notes.
  const weeks = week ? [week] : month.weeks;
  const orders = weeks.flatMap((w) => weekMarts(state, month, w).flatMap((m) => m.orders));
  const sale = orders.reduce((a, o) => a + (o.status === "x" ? 0 : o.sale), 0);
  const notes = weeks.reduce((a, w) => a + (state.notes[weekKey(month, w)]?.length ?? 0), 0);
  const title = week ? `${weekLabel(week)} · ${weekRange(week)}` : monthLabel(month);

  function yes() {
    if (week) {
      book.deleteWeek(id, week.no);
      const rest = month.weeks.filter((w) => w.no !== week.no);
      book.setPick(id, rest[rest.length - 1]?.no ?? null);
    } else {
      book.deleteMonth(id);
      // The latest month left, on its last week; with none left the book shows its welcome card.
      const rest = bookMonths(state).filter((mo) => monthId(mo) !== id);
      const last = rest[rest.length - 1];
      if (last) book.setPick(monthId(last), last.weeks[last.weeks.length - 1]?.no ?? null);
    }
    onDone(`បានលុប${title} · ស្តារវិញបាននៅទំព័រ «${TRASH_NAME}»។`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="sub">{week ? `ក្នុង${monthLabel(month)}` : `${month.weeks.length} អាទិត្យ`}</span>
        <h2 id="delete-period-title">លុប{title}?</h2>
      </div>
      <dl className="totals">
        <div>
          <dt>ការបញ្ជាទិញ</dt>
          <dd>{orders.length}</dd>
        </div>
        <div>
          <dt>លុយលក់</dt>
          <dd>{fmt(sale)}</dd>
        </div>
        {notes > 0 && (
          <div>
            <dt>កំណត់ចំណាំ</dt>
            <dd>{notes}</dd>
          </div>
        )}
      </dl>
      <p className="alert alert-warning" style={{ margin: 0, fontSize: 14 }}>
        <Icon name="info" size={18} />
        <span>
          {week ? "អាទិត្យនេះ" : "ខែនេះ អាទិត្យទាំងអស់របស់វា"} និងការបញ្ជាទិញ ទៅនៅទំព័រ «{TRASH_NAME}» · ស្តារវិញបាន ឬលុបជារៀងរហូតពីទីនោះ។
        </span>
      </p>
      <div className="dialog-actions">
        <button type="submit" className="btn btn-default" ref={noRef}>
          ទេ ទុកវិញ
        </button>
        <button type="button" className="btn btn-danger" onClick={yes}>
          <Icon name="trash" size={16} />
          {week ? "លុបអាទិត្យ" : "លុបខែ"}
        </button>
      </div>
    </form>
  );
}

export default function DeletePeriodDialog({
  target,
  onClose,
  onDone,
}: {
  target: PeriodTarget | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={!!target} onClose={onClose} labelledBy="delete-period-title" id="delete-period-dialog">
      {target && <DeleteForm target={target} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
