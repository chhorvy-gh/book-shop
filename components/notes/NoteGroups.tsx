"use client";

// The notes on screen as cards of tables: by due date (soonest first), by seller (most money left first) or one table.
// Amount and note edit in place; the flag marks a row yellow, the status chip marks it collected (green).
import { useState } from "react";
import { fmt } from "@/lib/format";
import { dueStatus, type DueInfo } from "@/lib/logic/due";
import { remaining, type NoteItem } from "@/lib/logic/notes";
import type { Note } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { chipClass, MoneyCell, SavedInput } from "../ui";
import { SellerChip } from "./parts";

export type View = "due" | "seller" | "table";

interface Group {
  key: string;
  title: string;
  info: DueInfo | null; // the due date of a due-date group
  items: NoteItem[];
}

function makeGroups(list: NoteItem[], view: View): Group[] {
  if (!list.length) return [];
  if (view === "table") return [{ key: "all", title: "បញ្ជីទាំងអស់", info: null, items: list }];
  const map = new Map<string, Group>();
  for (const it of list) {
    const key = view === "due" ? it.info.key : it.seller || "~";
    let g = map.get(key);
    if (!g) {
      g = { key, title: view === "due" ? it.info.label : it.seller || "មិនស្គាល់អ្នកលក់", info: it.info, items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  const groups = [...map.values()];
  if (view === "due") return groups.sort((a, b) => (a.info?.sort ?? 0) - (b.info?.sort ?? 0));
  for (const g of groups) g.items.sort((a, b) => a.info.sort - b.info.sort);
  return groups.sort((a, b) => remaining(b.items) - remaining(a.items));
}

const isAmount = (el: EventTarget | null) => el instanceof HTMLInputElement && el.dataset.field === "amount";

export default function NoteGroups({
  list,
  view,
  today,
  newId,
  emptyText,
}: {
  list: NoteItem[]; // the notes that pass the period, filter and search
  view: View;
  today: Date;
  newId: string | null; // the note added last, tinted until the next one
  emptyText: string;
}) {
  const { updateNote } = useSaleBook();
  // By seller, the cards sort by money left, which changes as an amount is typed. As in the mockup, the cards keep
  // their order while amounts are being typed (only their sums follow), so the row being typed in does not jump away.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  let groups = makeGroups(list, view);
  if (frozen && view === "seller") {
    const at = (key: string) => (frozen.includes(key) ? frozen.indexOf(key) : frozen.length);
    groups = groups.slice().sort((a, b) => at(a.key) - at(b.key));
  }
  const keys = groups.map((g) => g.key);
  const act = (id: string, patch: Partial<Omit<Note, "id">>) => {
    setFrozen(null);
    updateNote(id, patch);
  };

  const showDue = view !== "due";
  return (
    <div
      className="stack"
      id="groups"
      style={{ gap: 16, lineHeight: 1.6 }}
      onFocus={(e) => {
        if (isAmount(e.target)) setFrozen((f) => f ?? keys);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFrozen(null);
      }}
    >
      {!groups.length ? (
        <div className="card empty-card">{emptyText}</div>
      ) : (
        groups.map((g) => {
          const chip = view === "due" && g.info ? dueStatus(g.info, g.items.every((i) => i.collected), today) : null;
          return (
            <section key={g.key} className="card table-card" aria-label={g.title}>
              <div className="group-head">
                <h2>{g.title}</h2>
                {chip && <span className={chipClass(chip.tone)}>{chip.label}</span>}
                <span className="spacer" />
                <span className="sub num">
                  {`${g.items.length} ការបញ្ជាទិញ · នៅសល់ `}
                  <b style={{ color: "var(--fg)" }}>{fmt(remaining(g.items))}</b>
                </span>
              </div>
              {/* Every card gets the same column widths, so the columns line up from one card to the next. */}
              <div className="table-wrap">
                <table className="data fixed" style={{ minWidth: showDue ? 920 : 760 }}>
                  <colgroup>
                    <col style={{ width: 60 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 88 }} />
                    {showDue && <col style={{ width: 168 }} />}
                    <col style={{ width: 130 }} />
                    <col />
                    <col style={{ width: 172 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">លេខ</th>
                      <th scope="col">កូដ</th>
                      <th scope="col">អ្នកលក់</th>
                      {showDue && <th scope="col">ថ្ងៃកំណត់</th>}
                      <th scope="col" className="r">
                        ចំនួនលុយ
                      </th>
                      <th scope="col">កំណត់ចំណាំ</th>
                      <th scope="col" className="r">
                        ស្ថានភាព
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => {
                      const st = dueStatus(it.info, it.collected, today);
                      const cls = [it.collected ? "is-collected" : it.flagged ? "is-flagged" : "", it.id === newId ? "is-new" : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <tr key={it.id} className={cls || undefined}>
                          <td className="muted">{it.no}</td>
                          <td className="strong">{it.code}</td>
                          <td>
                            <SellerChip seller={it.seller} />
                          </td>
                          {showDue && <td>{it.info.label}</td>}
                          <td className="cell">
                            <MoneyCell
                              field="amount"
                              value={it.amount}
                              onChange={(n) => updateNote(it.id, { amount: n })}
                              label={`ចំនួនលុយ ${it.code}`}
                            />
                          </td>
                          <td className="cell">
                            <SavedInput
                              className="cell-input note"
                              data-field="note"
                              type="text"
                              value={it.note}
                              onSave={(v) => updateNote(it.id, { note: v })}
                              placeholder="បន្ថែមកំណត់ចំណាំ"
                              aria-label={`កំណត់ចំណាំ ${it.code}`}
                            />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="flag-btn"
                                aria-pressed={it.flagged}
                                aria-label={`សម្គាល់ពណ៌លឿង ${it.code}`}
                                title="សម្គាល់ពណ៌លឿង"
                                onClick={() => act(it.id, { flagged: !it.flagged })}
                              >
                                <Icon name="flag" size={16} />
                              </button>
                              <button
                                type="button"
                                className={chipClass(st.tone)}
                                aria-pressed={it.collected}
                                title="ចុចពេលប្រមូលលុយបាន"
                                aria-label={`${it.code}: ${st.label}។ ចុចដើម្បីប្តូរ`}
                                onClick={() => act(it.id, { collected: !it.collected })}
                              >
                                {st.label}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
