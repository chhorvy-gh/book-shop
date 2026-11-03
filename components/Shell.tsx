"use client";

// The frame of every page but the phone entry (the mockup's .app with its sidebar from renderNav):
// brand, the pages, the week being worked on, and who is signed in.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialOf } from "@/lib/format";
import { hasMonths, monthLabel, pickedWeek, weekLabel, weekRange } from "@/lib/periods";
import Welcome from "./Welcome";
import { Icon, type IconName } from "./icons";
import { useSaleBook } from "./store";

// [path, Khmer name, English name, icon], in the mockup's order; the account page is the app's own.
export const NAV: [string, string, string, IconName][] = [
  ["/", "ផ្ទាំងសង្ខេប", "Overview", "chart"],
  ["/calculator", "គណនារហ័ស", "Quick calculator", "receipt"],
  ["/sales", "តារាងលក់", "Sales sheet", "file"],
  ["/sellers", "ចំណេញតាមអ្នកលក់", "Profit by seller", "pie"],
  ["/payout", "ទូទាត់ប្រចាំអាទិត្យ", "Weekly payout", "dollar"],
  ["/monthly", "សង្ខេបប្រចាំខែ", "Monthly summary", "calendar"],
  ["/settlement", "ទូទាត់ចុងខែ", "Month-end", "calc"],
  ["/notes", "កំណត់ចំណាំ", "Pay-later notes", "note"],
  ["/account", "គណនី", "Account", "user"],
];

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        ឆ
      </div>
      <div className="stack">
        <b>សៀវភៅលក់</b>
        <span className="sub">Chhorvy Sales Book</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { state, access, signOut } = useSaleBook();
  const shown = hasMonths(state) ? pickedWeek(state) : null;
  const name = access.user?.displayName || access.email;
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav" aria-label="ម៉ឺនុយ">
        {NAV.map(([href, km, en, icon]) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            <Icon name={icon} />
            <span className="stack">
              <span>{km}</span>
              <small>{en}</small>
            </span>
          </Link>
        ))}
      </nav>
      <div className="week-card">
        <span className="sub">អាទិត្យកំពុងគិត</span>
        <span className="strong">
          {!shown ? "—" : shown.week ? `${weekLabel(shown.week)} · ${weekRange(shown.week)}` : monthLabel(shown.month)}
        </span>
      </div>
      <div className="user-card">
        <span className="avatar" aria-hidden="true">
          {initialOf(name).toUpperCase()}
        </span>
        <span className="stack">
          <span className="strong" style={{ fontSize: 13 }}>
            {access.user?.displayName || "—"}
          </span>
          <span className="sub" title={access.email}>
            {access.email}
          </span>
        </span>
        <button type="button" className="row-btn" onClick={() => void signOut()} aria-label="ចេញពីគណនី" title="ចេញពីគណនី">
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state } = useSaleBook();
  // A shop with no month yet starts on the welcome card. The account page (to add people) and the calculator
  // (it needs no month) still open.
  const empty = !hasMonths(state) && pathname !== "/account" && pathname !== "/calculator";
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{empty ? <Welcome /> : children}</main>
    </div>
  );
}
