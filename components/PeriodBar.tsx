"use client";

// Month picker + week tabs at the top of a page (the mockup's renderPeriodBar), tied to the month and week every page
// shares. mode "week": one week (a whole-month pick shows the month's last week); "month-or-week": also a «ទាំងខែ» tab
// (week null); "month": the month only. afterMonth sits between the month and the tabs (the sales page's «ខែថ្មី»);
// children come after the tabs; addLink puts the link to the sales page on the right.
import Link from "next/link";
import { bookMonths, monthId, monthLabel, picked, pickedWeek, weekLabel, weekShort } from "@/lib/periods";
import { Icon } from "./icons";
import { useSaleBook } from "./store";
import { Tabs } from "./ui";

export default function PeriodBar({
  mode,
  afterMonth,
  children,
  addLink,
  tabsLabel = "ជ្រើសអាទិត្យ",
}: {
  mode: "week" | "month-or-week" | "month";
  afterMonth?: React.ReactNode;
  children?: React.ReactNode;
  addLink?: boolean;
  tabsLabel?: string;
}) {
  const { state, setPick } = useSaleBook();
  const { month, week } = mode === "week" ? pickedWeek(state) : picked(state);
  const months = bookMonths(state);

  return (
    <div className="period-bar">
      <label className="period-month" htmlFor="month-sel">
        <Icon name="month" />
        <span className="sr-only">ខែ</span>
        <select
          className="select"
          id="month-sel"
          value={monthId(month)}
          onChange={(e) => {
            const mo = months.find((x) => monthId(x) === e.target.value);
            if (!mo) return;
            const last = mo.weeks[mo.weeks.length - 1];
            // A whole-month view stays whole; otherwise the new month opens on its last week.
            setPick(monthId(mo), mode === "month" || (mode === "month-or-week" && !week) ? null : (last?.no ?? null));
          }}
        >
          {months.map((mo) => (
            <option key={monthId(mo)} value={monthId(mo)}>
              {monthLabel(mo)}
            </option>
          ))}
        </select>
      </label>
      {afterMonth}
      {mode !== "month" && (
        <Tabs
          label={tabsLabel}
          value={week ? String(week.no) : "all"}
          onPick={(key) => setPick(monthId(month), key === "all" ? null : Number(key))}
          items={[
            ...(mode === "month-or-week" ? [{ key: "all", label: "ទាំងខែ", count: `${month.weeks.length} អាទិត្យ` }] : []),
            ...month.weeks.map((w) => ({ key: String(w.no), label: weekLabel(w), count: weekShort(w) })),
          ]}
        />
      )}
      {children}
      {addLink && (
        <Link className="sub" href="/sales" style={{ marginLeft: "auto" }}>
          បន្ថែមខែ ឬអាទិត្យ នៅតារាងលក់
        </Link>
      )}
    </div>
  );
}
