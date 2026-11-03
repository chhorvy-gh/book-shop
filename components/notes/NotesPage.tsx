"use client";

// Pay-later notes (the mockup's notes.html): orders whose money is collected later, by due date, by seller or as one
// table, with the money still to collect per month and the orders still unpaid on the sales sheet.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, latinDigits, todayText } from "@/lib/format";
import { startOfToday } from "@/lib/logic/due";
import { inMonth, isLate, isSoon, noteItems, sellerLookup, sum, type NoteItem } from "@/lib/logic/notes";
import { bookMonths, monthId, monthLabel, picked, weekLabel } from "@/lib/periods";
import type { Month, Week } from "@/lib/types";
import { Icon } from "../icons";
import { useSaleBook } from "../store";
import { Tabs } from "../ui";
import AddNoteForm, { type AddNoteFormHandle } from "./AddNoteForm";
import MonthTiles from "./MonthTiles";
import NoteGroups, { type View } from "./NoteGroups";
import UnpaidWeeks from "./UnpaidWeeks";

type Filter = "all" | "open" | "done" | "flag";
const passes = (i: NoteItem, f: Filter) => f === "all" || (f === "open" ? !i.collected : f === "done" ? i.collected : i.flagged);

export default function NotesPage() {
  const { state, setPick } = useSaleBook();
  // Due days count from today's date, read once when the page opens.
  const [today] = useState(startOfToday);
  const [view, setView] = useState<View>("due");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // «គ្រប់ខែ» stays on this page; picking one month or week is shared with the other pages.
  const [allMonths, setAllMonths] = useState(false);
  // The note added last (tinted), and whether to bring it into view once its row is there.
  const [newId, setNewId] = useState<string | null>(null);
  const scrollToNew = useRef(false);
  const form = useRef<AddNoteFormHandle>(null);

  const sellerOf = useMemo(() => sellerLookup(state.sellers), [state.sellers]);
  const items = useMemo(() => noteItems(state, today, sellerOf), [state, today, sellerOf]);

  const pick = picked(state);
  const month = allMonths ? null : pick.month;
  const week = allMonths ? null : pick.week;
  // The notes of the period on screen, before the status filter and search.
  const scope = items.filter((i) => (!month || inMonth(i, month)) && (!week || i.w.no === week.no));
  const q = latinDigits(query.trim()).toLowerCase();
  const visible = scope.filter(
    (i) => passes(i, filter) && (!q || i.code.toLowerCase().includes(q) || i.seller.includes(q) || i.note.toLowerCase().includes(q)),
  );
  const count = (f: Filter) => scope.filter((i) => passes(i, f)).length;

  const open = scope.filter((i) => !i.collected);
  const late = scope.filter(isLate);
  const soon = scope.filter(isSoon);
  const done = scope.filter((i) => i.collected);
  const soonDays = Array.from(new Set(soon.map((i) => i.info.label)));
  const noted = new Set(items.map((i) => `${i.key}|${i.code}`));

  // A new note's row appears once the book has it; then it is scrolled to, once.
  useEffect(() => {
    if (!scrollToNew.current) return;
    const row = document.querySelector("#groups tr.is-new");
    if (!row) return;
    scrollToNew.current = false;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  const pickMonth = (mo: Month | null) => {
    setAllMonths(!mo);
    if (mo) setPick(monthId(mo), null);
  };

  // Show the new note: switch to its week when another month or week is on screen, and clear the filter and search.
  const added = (id: string, mo: Month, w: Week) => {
    setNewId(id);
    scrollToNew.current = true;
    const otherMonth = !!month && monthId(month) !== monthId(mo);
    const otherWeek = !!week && (otherMonth || week.no !== w.no);
    if (otherMonth || otherWeek) setPick(monthId(mo), w.no);
    setFilter("all");
    setQuery("");
  };

  const eyebrow = `លុយត្រូវប្រមូល · ${month ? `${monthLabel(month)} · ${week ? weekLabel(week) : "ទាំងខែ"}` : "គ្រប់ខែ"} · គិតត្រឹម ${todayText(today)}`;

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">
            {eyebrow}
          </span>
          <h1>កំណត់ចំណាំ</h1>
        </div>
        <Tabs<View>
          id="view-tabs"
          label="របៀបបង្ហាញ"
          value={view}
          onPick={setView}
          items={[
            { key: "due", label: "តាមថ្ងៃកំណត់" },
            { key: "seller", label: "តាមអ្នកលក់" },
            { key: "table", label: "តារាង" },
          ]}
        />
      </header>

      <MonthTiles
        items={items}
        months={bookMonths(state)}
        month={month}
        week={week}
        onPickMonth={pickMonth}
        onPickWeek={(no) => setPick(monthId(pick.month), no)}
      />

      <section className="kpis" aria-label="សរុប">
        <div className="kpi is-accent">
          <div className="kpi-label">
            <span>ត្រូវប្រមូលសរុប</span>
          </div>
          <span className="kpi-value">{fmt(sum(open))}</span>
          <span className="kpi-sub">{`${open.length} ការបញ្ជាទិញ`}</span>
        </div>
        <div className="kpi is-danger">
          <div className="kpi-label">
            <span>ហួសថ្ងៃកំណត់</span>
          </div>
          <span className="kpi-value">{fmt(sum(late))}</span>
          <span className="kpi-sub">{late.length ? `${late.length} · ${late.map((i) => i.code).join(", ")}` : "គ្មាន"}</span>
        </div>
        <div className="kpi is-warning">
          <div className="kpi-label">
            <span>ដល់ថ្ងៃក្នុង 7 ថ្ងៃ</span>
          </div>
          <span className="kpi-value">{fmt(sum(soon))}</span>
          <span className="kpi-sub">{soon.length ? `${soon.length} ការបញ្ជាទិញ · ${soonDays.join(", ")}` : "គ្មាន"}</span>
        </div>
        <div className="kpi is-success">
          <div className="kpi-label">
            <span>បានប្រមូល</span>
          </div>
          <span className="kpi-value">{fmt(sum(done))}</span>
          <span className="kpi-sub">{`${done.length} ការបញ្ជាទិញ`}</span>
        </div>
      </section>

      <UnpaidWeeks month={month} week={week} sellerOf={sellerOf} noted={noted} onAddNote={(key, o) => form.current?.fill(key, o)} />

      <AddNoteForm ref={form} month={month} week={week} sellerOf={sellerOf} onAdded={added} />

      <div className="table-toolbar card" style={{ padding: "12px 16px", borderRadius: 16, flexDirection: "row" }}>
        <Tabs<Filter>
          id="filters"
          label="តម្រង"
          value={filter}
          onPick={setFilter}
          items={[
            { key: "all", label: "ទាំងអស់", count: count("all") },
            { key: "open", label: "មិនទាន់ប្រមូល", count: count("open") },
            { key: "done", label: "បានប្រមូល", count: count("done") },
            { key: "flag", label: "បានសម្គាល់", count: count("flag") },
          ]}
        />
        <div className="search">
          <Icon name="search" size={16} />
          <input
            className="input"
            id="search"
            type="search"
            placeholder="ស្វែងរកកូដ អ្នកលក់ ឬកំណត់ចំណាំ"
            aria-label="ស្វែងរក"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <NoteGroups
        list={visible}
        view={view}
        today={today}
        newId={newId}
        emptyText={scope.length ? "គ្មានកំណត់ចំណាំ ត្រូវនឹងតម្រងនេះទេ" : "មិនទាន់មានកំណត់ចំណាំក្នុងខែ ឬអាទិត្យនេះ · បន្ថែមនៅខាងលើ"}
      />
      <p className="sub" style={{ margin: 0 }}>
        ចុចលើចំនួនលុយ ឬកំណត់ចំណាំ ដើម្បីកែ · ទង់ = សម្គាល់ពណ៌លឿង · ចុចលើស្ថានភាព ពេលប្រមូលលុយបាន។
      </p>
    </>
  );
}
