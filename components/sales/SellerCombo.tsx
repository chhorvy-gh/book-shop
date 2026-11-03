"use client";

// The seller box of the add form (the mockup's .combo): pick from the list, or type to find a seller by name or code.
// A typed name that is no one's gets a last option «+ បន្ថែមអ្នកលក់ «…»», which opens the new-seller dialog with that
// name. The box always shows the chosen seller once it loses focus.
import { useRef, useState } from "react";
import type { Seller } from "@/lib/types";
import { Icon } from "../icons";

type Option = { code: string } | { add: string };

export const sellerLabel = (sellers: Seller[], code: string) => {
  const s = sellers.find((x) => x.code === code);
  return !s ? "" : s.name === s.code ? s.code : `${s.name} (${s.code})`;
};

export default function SellerCombo({
  sellers,
  value,
  onChange,
  onAddNew,
}: {
  sellers: Seller[];
  value: string; // the chosen seller's code
  onChange: (code: string) => void;
  onAddNew: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null); // what is typed while searching; null = showing the seller
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const names = new Map(sellers.map((s) => [s.code, s.name]));

  const optionsFor = (q: string | null): Option[] => {
    const text = (q ?? "").trim().replace(/\s+/g, " ");
    const ql = text.toLowerCase();
    const opts: Option[] = sellers.filter((s) => !ql || s.name.toLowerCase().includes(ql) || s.code.toLowerCase().includes(ql)).map((s) => ({ code: s.code }));
    if (text && !sellers.some((s) => s.name === text || s.code === text)) opts.push({ add: text });
    return opts;
  };
  const options = optionsFor(typed);

  function show(q: string | null) {
    const opts = optionsFor(q);
    setOpen(true);
    setActive(!opts.length ? -1 : q !== null ? 0 : Math.max(0, opts.findIndex((o) => "code" in o && o.code === value)));
  }
  function close() {
    setOpen(false);
    setTyped(null);
    setActive(-1);
  }
  function pick(k: number) {
    const o = options[k];
    if (!o) return;
    close();
    if ("add" in o) onAddNew(o.add);
    else onChange(o.code);
  }
  function move(to: number) {
    setActive(to);
    requestAnimationFrame(() => listRef.current?.querySelector(`#seller-opt-${to}`)?.scrollIntoView({ block: "nearest" }));
  }

  return (
    <div className="combo">
      <input
        className="input combo-input"
        id="seller"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="seller-list"
        aria-activedescendant={open && active >= 0 ? `seller-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="រើស ឬវាយឈ្មោះថ្មី"
        value={typed ?? sellerLabel(sellers, value)}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => {
          if (open) return;
          e.currentTarget.select();
          show(null);
        }}
        onChange={(e) => {
          setTyped(e.target.value);
          show(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return show(typed);
            const n = options.length;
            if (!n) return;
            move((active + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
          } else if (e.key === "Enter" && open) {
            e.preventDefault(); // with the list closed, Enter adds the order
            pick(active);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
            const el = e.currentTarget;
            requestAnimationFrame(() => el.select());
          } else if (e.key === "Tab" && open && typed !== null && options[active] && "code" in options[active]) {
            pick(active);
          }
        }}
        onBlur={close}
      />
      <span className="combo-caret">
        <Icon name="down" size={16} />
      </span>
      <ul
        className="combo-list"
        id="seller-list"
        role="listbox"
        aria-labelledby="seller-label"
        hidden={!open}
        ref={listRef}
        onMouseDown={(e) => e.preventDefault()} // keeps focus in the box while choosing
      >
        {options.length ? (
          options.map((o, k) =>
            "add" in o ? (
              <li key="add" role="option" id={`seller-opt-${k}`} className={`combo-new${k === active ? " is-active" : ""}`} aria-selected={false} onClick={() => pick(k)}>
                + បន្ថែមអ្នកលក់ «{o.add}»
              </li>
            ) : (
              <li key={o.code} role="option" id={`seller-opt-${k}`} className={k === active ? "is-active" : undefined} aria-selected={o.code === value} onClick={() => pick(k)}>
                <span>{names.get(o.code)}</span>
                {names.get(o.code) !== o.code && <small>{o.code}</small>}
              </li>
            ),
          )
        ) : (
          <li className="combo-empty" role="presentation">
            វាយឈ្មោះ ដើម្បីបន្ថែមអ្នកលក់ថ្មី
          </li>
        )}
      </ul>
    </div>
  );
}
