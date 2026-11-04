"use client";

// Small pieces the pages share, drawing the mockup's own markup and classes (app/mockup.css):
// segmented tabs, the switch, dialogs, table cells that edit in place, the status line.
import { useEffect, useRef, useState } from "react";
import { fmt, parseMoney } from "@/lib/format";
import { Icon } from "./icons";

export type Tone = "accent" | "success" | "warning" | "danger" | "default";
// The chip class of a tone: "chip chip-success" …
export const chipClass = (tone: Tone = "default") => (tone === "default" ? "chip" : `chip chip-${tone}`);

// ---------- Segmented tabs (.tabs) ----------

export interface TabItem<T extends string> {
  key: T;
  label: React.ReactNode;
  count?: React.ReactNode; // shown lighter after the label (<span class="count">)
}

export function Tabs<T extends string>({
  items,
  value,
  onPick,
  label,
  labelledBy,
  id,
  style,
}: {
  items: TabItem<T>[];
  value: T;
  onPick: (key: T) => void;
  label?: string;
  labelledBy?: string;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="tabs" role="group" aria-label={label} aria-labelledby={labelledBy} id={id} style={style}>
      {items.map((it) => (
        <button key={it.key} type="button" data-key={it.key} aria-pressed={it.key === value} onClick={() => onPick(it.key)}>
          {it.label}
          {it.count !== undefined && (
            <>
              {" "}
              <span className="count">{it.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Switch (.switch) ----------

export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" id={id} checked={checked} aria-label={ariaLabel} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span className="switch-text">{label}</span>}
    </label>
  );
}

// ---------- Dialog (<dialog class="dialog">) ----------

// A modal <dialog>, opened and closed by `open`. Esc or the × in the top corner asks onClose, like the mockup's dialogs.
// The × comes after the contents so the box each dialog focuses first stays the same; CSS puts it in the corner.
export function Dialog({
  open,
  onClose,
  wide,
  labelledBy,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  labelledBy?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={wide ? "dialog dialog-wide" : "dialog"}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          {children}
          <button type="button" className="dialog-close" aria-label="បិទ" title="បិទ" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </>
      )}
    </dialog>
  );
}

// ---------- Boxes bound to saved data ----------
// Saved values come back from Firestore a moment after they are written, so a box being typed in shows its own copy
// of the text until it is left; otherwise a keystroke could flicker away or the cursor jump to the end.

// Moves focus to the same column's box in the next (dir 1) or previous (dir -1) table row, or leaves the box.
export function moveInColumn(input: HTMLInputElement, dir: 1 | -1) {
  const tr = input.closest("tr");
  const field = input.dataset.field;
  let row = dir > 0 ? tr?.nextElementSibling : tr?.previousElementSibling;
  while (row) {
    const target = row.querySelector<HTMLInputElement>(`input[data-field="${field}"]:not(:disabled)`);
    if (target) return target.focus();
    row = dir > 0 ? row.nextElementSibling : row.previousElementSibling;
  }
  input.blur();
}

// An amount cell (.cell-input): "81,000" until focused, plain digits while typing; every keystroke is kept
// (so totals follow at once). Enter / ↓ go to the next row, ↑ to the one before, Esc puts back what was there
// when the cell was entered. className adds "quiet", "is-edited", "is-minus" …
export function MoneyCell({
  value,
  onChange,
  field,
  label,
  className = "cell-input quiet",
  title,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  field: string; // the column, for moving between rows
  label: string;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const before = useRef(0);
  return (
    <input
      className={className}
      data-field={field}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      aria-label={label}
      title={title}
      disabled={disabled}
      value={draft ?? (value ? fmt(value) : "")}
      onFocus={(e) => {
        before.current = value;
        setDraft(value ? String(value) : "");
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseMoney(e.target.value));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          moveInColumn(e.currentTarget, 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveInColumn(e.currentTarget, -1);
        } else if (e.key === "Escape") {
          onChange(before.current);
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// A text or number box bound to saved text: shows its own copy while focused and saves after a short pause
// (and when left), so typing a sentence is a few saves, not one per letter. Enter moves to the same column in the
// next row when the box has a data-field.
export function SavedInput({
  value,
  onSave,
  delay = 400,
  ...rest
}: {
  value: string;
  onSave: (value: string) => void;
  delay?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  // The latest value and save function, for a save that lands after a re-render or when the box goes away.
  const latest = useRef({ value, onSave });
  useEffect(() => {
    latest.current = { value, onSave };
  });
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null && pending.current !== latest.current.value) latest.current.onSave(pending.current);
    pending.current = null;
  };
  // Save what is still waiting when the box goes away.
  useEffect(() => () => flush(), []);
  return (
    <input
      {...rest}
      value={draft ?? value}
      onFocus={(e) => {
        setDraft(value);
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        pending.current = e.target.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, delay);
      }}
      onBlur={(e) => {
        flush();
        setDraft(null);
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.currentTarget.dataset.field) {
          e.preventDefault();
          flush();
          moveInColumn(e.currentTarget, 1);
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
}

// ---------- Status line (the mockup's #export-note) ----------

// A line under the period bar saying what just happened; show("…") / show("…", true) for a failure, hide().
export function useNote() {
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const element = note ? (
    <p className={`page-note ${note.error ? "t-danger" : "t-accent"}`} role="status">
      {note.text}
    </p>
  ) : null;
  return { show: (text: string, error = false) => setNote({ text, error }), hide: () => setNote(null), element };
}

// While something loads.
export function Loading() {
  return (
    <div className="page-loading">
      <span className="spinner" role="status" aria-label="កំពុងផ្ទុក" />
    </div>
  );
}
