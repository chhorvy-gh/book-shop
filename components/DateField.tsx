"use client";

// A date box in the app's look, in place of <input type="date">: the browser's own calendar cannot be styled and
// speaks English ("November 2026", "Su Mo Tu"). Shows "08-11-2026" and opens a calendar with Khmer month and day
// names; the week being made (range) is shaded so both ends can be seen while picking either one.
// The calendar is a popover, so it sits above a dialog without being clipped by it.
import { useEffect, useRef, useState } from "react";
import { MONTH_NAMES, dayCount, flipDate, monthLabel, shiftDay } from "@/lib/periods";
import { Icon } from "./icons";

const DAY_SHORT = ["អា", "ច", "អ", "ព", "ព្រ", "សុ", "ស"];
const DAY_NAMES = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];

// Values are date input values ("2026-11-08"), which sort like dates.
const pad = (n: number) => String(n).padStart(2, "0");
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekday = (v: string) => new Date(`${v}T00:00:00`).getDay();
const todayValue = () => toValue(new Date());
// The same day n months on, kept inside a shorter month (31 Jan + 1 month → 28 Feb).
function shiftMonth(v: string, n: number) {
  const [y, m, d] = v.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0);
  return toValue(new Date(last.getFullYear(), last.getMonth(), Math.min(d, last.getDate())));
}
// The 6 weeks (Sunday first) shown for the month of v: always 6, so the calendar keeps its height.
function monthWeeks(v: string) {
  const [y, m] = v.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = toValue(new Date(y, m - 1, 1 - first.getDay()));
  return Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => shiftDay(start, r * 7 + c)));
}

const GAP = 6; // between the box and the calendar
const EDGE = 8; // kept clear of the window's edges

// The open calendar under its box, or above it when there is no room below; inside the window either way.
function place(box: HTMLElement | null, pop: HTMLElement | null) {
  if (!box || !pop || !pop.matches(":popover-open")) return;
  const r = box.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = pop;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const below = r.bottom + GAP;
  const above = r.top - GAP - h;
  const top = below + h <= vh - EDGE ? below : above >= EDGE ? above : Math.max(EDGE, vh - EDGE - h);
  pop.style.left = `${Math.max(EDGE, Math.min(r.left, vw - w - EDGE))}px`;
  pop.style.top = `${top}px`;
}

export function DateField({
  id,
  label,
  value,
  onChange,
  invalid,
  describedBy,
  min,
  range,
  clearable,
  placeholder = "ជ្រើសថ្ងៃ",
}: {
  id: string;
  label: React.ReactNode;
  value: string; // "2026-11-08", or "" for none
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  min?: string; // days before it cannot be picked
  range?: { from: string; to: string }; // shaded from–to, both ends marked
  clearable?: boolean; // offers «សម្អាត» to leave the date empty
  placeholder?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // The day with keyboard focus; its month is the one on screen.
  const [active, setActive] = useState(value);
  const focusDay = useRef(false);
  const popId = `${id}-calendar`;
  const labelId = `${id}-label`;

  // Follow the box while the calendar is open.
  useEffect(() => {
    if (!open) return;
    const follow = () => place(triggerRef.current, popRef.current);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  // Keyboard moves: focus the day moved to once it is drawn.
  useEffect(() => {
    if (!open || !focusDay.current) return;
    focusDay.current = false;
    popRef.current?.querySelector<HTMLButtonElement>(`button[data-day="${active}"]`)?.focus();
  }, [open, active]);

  function close(refocus: boolean) {
    popRef.current?.hidePopover();
    if (refocus) triggerRef.current?.focus();
  }

  function pick(day: string) {
    if (min && day < min) return;
    onChange(day);
    close(true);
  }

  function onGridKey(e: React.KeyboardEvent) {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    let next = "";
    if (step) next = shiftDay(active, step);
    else if (e.key === "Home") next = shiftDay(active, -weekday(active));
    else if (e.key === "End") next = shiftDay(active, 6 - weekday(active));
    else if (e.key === "PageUp") next = shiftMonth(active, e.shiftKey ? -12 : -1);
    else if (e.key === "PageDown") next = shiftMonth(active, e.shiftKey ? 12 : 1);
    if (!next) return;
    e.preventDefault();
    focusDay.current = true;
    setActive(next);
  }

  const today = open ? todayValue() : "";
  const shaded = range && range.from && range.to && range.from <= range.to ? range : null;
  const todayOff = !!min && today < min;

  return (
    <div className="field">
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="input date-trigger num"
        popoverTarget={popId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${id}`}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <span className={value ? undefined : "muted"}>{value ? flipDate(value) : placeholder}</span>
        <Icon name="calendar" />
      </button>
      <div
        ref={popRef}
        id={popId}
        popover="auto"
        role="dialog"
        aria-labelledby={`${popId}-title`}
        tabIndex={-1}
        className="date-pop"
        onBeforeToggle={(e) => {
          if (e.newState !== "open") return;
          // Open on the picked day, or today (not before min) when nothing is picked yet.
          const t = todayValue();
          setActive(value || (min && t < min ? min : t));
          setOpen(true);
          requestAnimationFrame(() => {
            place(triggerRef.current, popRef.current);
            focusDay.current = false;
            popRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
          });
        }}
        onToggle={(e) => {
          if (e.newState === "closed") setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // Close only the calendar, not the dialog it sits in.
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }}
        onBlur={(e) => {
          // Tabbing out of the calendar closes it.
          const to = e.relatedTarget;
          if (to instanceof Node && !e.currentTarget.contains(to) && to !== triggerRef.current) close(false);
        }}
      >
        {open && active && (
          <>
            <div className="cal-bar">
              <button
                type="button"
                className="cal-nav"
                aria-label="ខែមុន"
                onClick={() => setActive(shiftMonth(active, -1))}
              >
                <Icon name="back" />
              </button>
              <span className="cal-title" id={`${popId}-title`} aria-live="polite">
                {monthLabel({ y: Number(active.slice(0, 4)), m: Number(active.slice(5, 7)) })}
              </span>
              <button
                type="button"
                className="cal-nav"
                aria-label="ខែបន្ទាប់"
                onClick={() => setActive(shiftMonth(active, 1))}
              >
                <Icon name="next" />
              </button>
            </div>
            <div role="grid" aria-labelledby={`${popId}-title`} className="cal-grid" onKeyDown={onGridKey}>
              <div role="row" className="cal-row">
                {DAY_SHORT.map((d, i) => (
                  <span key={i} role="columnheader" className="cal-wd" title={DAY_NAMES[i]} aria-label={DAY_NAMES[i]}>
                    {d}
                  </span>
                ))}
              </div>
              {monthWeeks(active).map((week) => (
                <div role="row" className="cal-row" key={week[0]}>
                  {week.map((day, c) => {
                    const off = !!min && day < min;
                    const inRange = !!shaded && day >= shaded.from && day <= shaded.to;
                    const end = !!shaded && (day === shaded.from || day === shaded.to);
                    const cls = ["cal-cell"];
                    if (day.slice(0, 7) !== active.slice(0, 7)) cls.push("is-out");
                    if (inRange) cls.push("in-range");
                    if (shaded && day === shaded.from) cls.push("range-start");
                    if (shaded && day === shaded.to) cls.push("range-end");
                    if (day === value || end) cls.push("is-picked");
                    if (day === today) cls.push("is-today");
                    if (off) cls.push("is-off");
                    const [y, m, d] = day.split("-").map(Number);
                    return (
                      <span key={day} role="gridcell" className={cls.join(" ")} aria-selected={day === value}>
                        <button
                          type="button"
                          data-day={day}
                          tabIndex={day === active ? 0 : -1}
                          aria-label={`ថ្ងៃ${DAY_NAMES[c]} ${d} ${MONTH_NAMES[m - 1]} ${y}`}
                          aria-current={day === today ? "date" : undefined}
                          aria-disabled={off || undefined}
                          onClick={() => pick(day)}
                        >
                          {d}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="cal-foot">
              <button type="button" className="field-link" disabled={todayOff} onClick={() => pick(today)}>
                ថ្ងៃនេះ
              </button>
              {shaded && <span className="sub num">{dayCount(shaded.from, shaded.to)} ថ្ងៃ</span>}
              {clearable && value && (
                <button
                  type="button"
                  className="field-link"
                  onClick={() => {
                    onChange("");
                    close(true);
                  }}
                >
                  សម្អាត
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
