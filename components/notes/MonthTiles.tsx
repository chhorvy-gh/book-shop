"use client";

// Each month's money still to collect, with how much of the month is collected so far: an «every month» tile first,
// then each month newest first, and under them the weeks of the month picked.
import { fmt } from "@/lib/format";
import { remaining, inMonth, isLate, sum, type NoteItem } from "@/lib/logic/notes";
import { monthId, monthLabel, weekKey, weekLabel, weekShort } from "@/lib/periods";
import type { Month, Week } from "@/lib/types";
import { Tabs } from "../ui";

function Tile({ title, list, pressed, onClick }: { title: string; list: NoteItem[]; pressed: boolean; onClick: () => void }) {
  const total = sum(list);
  const left = remaining(list);
  const open = list.filter((i) => !i.collected).length;
  const late = list.filter(isLate).length;
  const done = total ? Math.round(((total - left) / total) * 100) : 0;
  return (
    <button type="button" className={`month-tile${list.length && !open ? " is-done" : ""}`} aria-pressed={pressed} onClick={onClick}>
      <span className="month-tile-title">{title}</span>
      <span className="month-tile-amount">{fmt(left)}</span>
      <span className="sub">
        {!list.length ? (
          "គ្មានកំណត់ចំណាំ"
        ) : !open ? (
          "ប្រមូលគ្រប់ហើយ"
        ) : (
          <>
            {`${open} មិនទាន់ប្រមូល`}
            {late > 0 && (
              <>
                {" · "}
                <span className="t-danger">{`ហួស ${late}`}</span>
              </>
            )}
          </>
        )}
      </span>
      <span className="meter" title={`បានប្រមូល ${done}%`}>
        <i style={{ width: `${done}%` }} />
      </span>
      <span className="sub">{`បានប្រមូល ${done}% នៃ ${fmt(total)}`}</span>
    </button>
  );
}

export default function MonthTiles({
  items,
  months,
  month,
  week,
  onPickMonth,
  onPickWeek,
}: {
  items: NoteItem[]; // every note
  months: Month[]; // the book's months, oldest first
  month: Month | null; // null = every month
  week: Week | null; // null = the whole month
  onPickMonth: (month: Month | null) => void;
  onPickWeek: (week: number | null) => void;
}) {
  return (
    <section className="card" aria-labelledby="ms-title" style={{ padding: "20px 24px", gap: 14 }}>
      <div className="card-head">
        <h2 id="ms-title" style={{ fontSize: 16 }}>
          លុយមិនទាន់ប្រមូល តាមខែ
        </h2>
        <span className="sub">ចុចលើខែ ឬអាទិត្យ ដើម្បីមើលតែកំណត់ចំណាំនោះ</span>
      </div>
      <div className="month-tiles" id="month-tiles" role="group" aria-label="ជ្រើសខែ">
        <Tile title="គ្រប់ខែ" list={items} pressed={!month} onClick={() => onPickMonth(null)} />
        {months
          .slice()
          .reverse()
          .map((mo) => (
            <Tile
              key={monthId(mo)}
              title={monthLabel(mo)}
              list={items.filter((i) => inMonth(i, mo))}
              pressed={!!month && monthId(month) === monthId(mo)}
              onClick={() => onPickMonth(mo)}
            />
          ))}
      </div>

      {/* Weeks of the month picked, each with what is still to collect from it. */}
      {month && (
        <Tabs
          id="week-tabs"
          label="ជ្រើសអាទិត្យ"
          style={{ alignSelf: "flex-start" }}
          value={week ? String(week.no) : "all"}
          onPick={(key) => onPickWeek(key === "all" ? null : Number(key))}
          items={[
            { key: "all", label: "ទាំងខែ", count: fmt(remaining(items.filter((i) => inMonth(i, month)))) },
            ...month.weeks.map((w) => ({
              key: String(w.no),
              label: weekLabel(w),
              count: `${weekShort(w)} · ${fmt(remaining(items.filter((i) => i.key === weekKey(month, w))))}`,
            })),
          ]}
        />
      )}
    </section>
  );
}
