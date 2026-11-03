"use client";

// Orders still unpaid on the sales sheet, one fold per week of the period on screen. From here an order can be
// switched between unpaid and paid, or turned into a pay-later note.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/format";
import type { Lookup } from "@/lib/logic/notes";
import { bookMonths, martLabel, monthId, monthLabel, weekKey, weekLabel, weekOrders, weekRange } from "@/lib/periods";
import type { Month, Order, Week } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { Tabs } from "../ui";
import { SellerChip } from "./parts";

export type WeekOrder = Order & { mart: string };

export default function UnpaidWeeks({
  month,
  week,
  sellerOf,
  noted,
  onAddNote,
}: {
  month: Month | null; // null = every month
  week: Week | null; // null = the whole month
  sellerOf: Lookup;
  noted: Set<string>; // "weekKey|code" of orders whose week already has a note for the code
  onAddNote: (key: string, order: WeekOrder) => void;
}) {
  const { state, setPick, updateOrder } = useSaleBook();
  const router = useRouter();
  // Which sheet the list shows: "all" or a mart id.
  const [martPick, setMart] = useState("all");
  // A week opens by itself when it is the only one shown; after that it stays as it was left.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // ស្ថានភាព switches an order between មិនទាន់បង់ and បានបង់ on the sales sheet itself. An order marked paid here
  // stays in its week's list (in green) until the page is left, so a wrong click can be undone. The order is kept
  // too: a closed month that is not on screen only has its unpaid orders in the book, so a paid one would vanish.
  const [paidHere, setPaidHere] = useState<Map<string, { key: string; order: WeekOrder }>>(() => new Map());

  const mart = martPick === "all" || state.marts.includes(martPick) ? martPick : "all";
  const months = month ? [month] : bookMonths(state).slice().reverse();
  const martAt = (id: string) => state.marts.indexOf(id);

  // Mart tabs count the unpaid orders of each sheet over the whole period, whichever tab is picked.
  const counts: Record<string, number> = { all: 0 };
  for (const id of state.marts) counts[id] = 0;
  const weeks = months.flatMap((mo) =>
    mo.weeks
      .filter((w) => !week || w.no === week.no)
      .map((w) => {
        const key = weekKey(mo, w);
        const live = weekOrders(state, mo, w);
        const kept = [...paidHere.values()]
          .filter((x) => x.key === key && !live.some((o) => o.id === x.order.id))
          .map((x): WeekOrder => ({ ...x.order, status: "p" }));
        const shown = live
          .filter((o) => o.status === "u" || (o.status === "p" && paidHere.has(o.id)))
          .concat(kept)
          .sort((a, b) => martAt(a.mart) - martAt(b.mart) || a.no - b.no);
        for (const o of shown) {
          if (o.status !== "u") continue;
          counts.all += 1;
          counts[o.mart] = (counts[o.mart] ?? 0) + 1;
        }
        const list = mart === "all" ? shown : shown.filter((o) => o.mart === mart);
        return { mo, w, key, list, due: list.filter((o) => o.status === "u") };
      }),
  );
  const all = weeks.flatMap((x) => x.due);

  // មិនទាន់បង់ ⇄ បានបង់, saved on the sales sheet; the button keeps the focus, as its row stays where it is.
  const toggle = (key: string, o: WeekOrder) => {
    const status = o.status === "u" ? "p" : "u";
    if (status === "p") setPaidHere((m) => new Map(m).set(o.id, { key, order: o }));
    updateOrder(o.id, { status });
  };

  const openSheet = (mo: Month, w: Week) => {
    setPick(monthId(mo), w.no);
    router.push("/sales");
  };

  return (
    <section className="card table-card" aria-labelledby="up-title">
      <div className="group-head">
        <h2 id="up-title">មិនទាន់បង់ · តាមអាទិត្យ</h2>
        <span className="sub">ការបញ្ជាទិញ «មិនទាន់បង់» ក្នុងតារាងលក់</span>
        <span className="spacer" />
        <Tabs
          id="up-mart"
          label="បង្ហាញតាម Mart"
          value={mart}
          onPick={setMart}
          items={[
            { key: "all", label: "ទាំងអស់", count: counts.all },
            ...state.marts.map((id) => ({ key: id, label: martLabel(state, id), count: counts[id] })),
          ]}
        />
        {/* The total over all weeks; with one week its own head already says it. */}
        <span className="sub num" id="up-sum">
          {weeks.length > 1 && all.length > 0 && (
            <>
              {`${all.length} ការបញ្ជាទិញ · `}
              <b style={{ color: "var(--fg)" }}>{fmt(all.reduce((a, o) => a + o.sale, 0))}</b>
            </>
          )}
        </span>
      </div>
      <div id="up-weeks">
        {!weeks.length ? (
          <p className="empty-card" style={{ margin: 0 }}>
            មិនទាន់មានអាទិត្យក្នុងខែនេះ
          </p>
        ) : (
          weeks.map(({ mo, w, key, list, due }) => {
            const head = (
              <>
                <span className="strong">{weekLabel(w) + (month ? "" : ` · ${monthLabel(mo)}`)}</span>
                <span className="sub num">{weekRange(w)}</span>
                <span className="spacer" />
                {due.length ? (
                  <span className="sub num">
                    {`${due.length} ការបញ្ជាទិញ · `}
                    <b style={{ color: "var(--fg)" }}>{fmt(due.reduce((a, o) => a + o.sale, 0))}</b>
                  </span>
                ) : (
                  <span className="chip chip-success">បង់គ្រប់ហើយ</span>
                )}
              </>
            );
            if (!list.length) {
              return (
                <div key={key} className="fold-head is-static">
                  {head}
                </div>
              );
            }
            return (
              <details
                key={key}
                className="fold"
                open={open[key] ?? weeks.length === 1}
                // Also fires when a week opens by itself, so it then stays open, as in the mockup.
                onToggle={(e) => {
                  const now = e.currentTarget.open;
                  setOpen((o) => (o[key] === now ? o : { ...o, [key]: now }));
                }}
              >
                <summary className="fold-head">
                  <Icon name="next" size={16} />
                  {head}
                </summary>
                <div className="table-wrap">
                  <table className="data fixed" style={{ minWidth: 720 }}>
                    <colgroup>
                      <col style={{ width: 60 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 120 }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">លេខ</th>
                        <th scope="col">Mart</th>
                        <th scope="col">កូដ</th>
                        <th scope="col">អ្នកលក់</th>
                        <th scope="col" className="r">
                          លុយលក់
                        </th>
                        <th scope="col">ស្ថានភាព</th>
                        <th scope="col">
                          <span className="sr-only">សកម្មភាព</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o) => {
                        const paid = o.status === "p";
                        const label = paid ? "បានបង់" : "មិនទាន់បង់";
                        return (
                          <tr key={o.id} className={paid ? "is-collected" : undefined}>
                            <td className="muted">{o.no}</td>
                            <td>{martLabel(state, o.mart)}</td>
                            <td className="strong">{o.code}</td>
                            <td>
                              <SellerChip seller={sellerOf(o.code)} />
                            </td>
                            <td className="r strong">{fmt(o.sale)}</td>
                            <td>
                              <button
                                type="button"
                                className={`chip ${paid ? "chip-success" : "chip-warning"}`}
                                aria-pressed={paid}
                                title="ចុចដើម្បីប្តូរ"
                                aria-label={`${o.code}: ${label}។ ចុចដើម្បីប្តូរ`}
                                onClick={() => toggle(key, o)}
                              >
                                {label}
                              </button>
                            </td>
                            <td>
                              <div className="row-actions">
                                {noted.has(`${key}|${o.code}`) ? (
                                  <span className="chip chip-accent">មានកំណត់ចំណាំ</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="row-btn"
                                    aria-label={`បន្ថែមកំណត់ចំណាំ ${o.code}`}
                                    onClick={() => onAddNote(key, o)}
                                  >
                                    <Icon name="plus" size={14} />
                                    កំណត់ចំណាំ
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="fold-foot">
                  <button type="button" className="row-btn" onClick={() => openSheet(mo, w)}>
                    បើកក្នុងតារាងលក់
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}
