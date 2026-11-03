"use client";

// The frame of every page but the phone entry (the mockup's .app with its sidebar from renderNav):
// brand, the pages, the week being worked on, and who is signed in.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialOf } from "@/lib/format";
import { shownName } from "@/lib/usernames";
import { hasMonths, monthLabel, pickedWeek, weekLabel, weekRange } from "@/lib/periods";
import Welcome from "./Welcome";
import { Icon, LogoMark, type IconName } from "./icons";
import { VIEWER_HOME, useSaleBook } from "./store";

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
  ["/trash", "បានលុបថ្មីៗ", "Recently deleted", "trash"],
  ["/history", "ប្រវត្តិកែប្រែ", "Change history", "history"],
  ["/account", "គណនី", "Account", "user"],
];

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <LogoMark />
      </div>
      <div className="stack">
        <b>សៀវភៅលក់</b>
        <span className="sub">LL Sales Book</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { state, access, signOut } = useSaleBook();
  const shown = hasMonths(state) ? pickedWeek(state) : null;
  const name = access.user?.displayName || shownName(access.email);
  const nav = access.role === "viewer" ? NAV.filter(([href]) => href === VIEWER_HOME) : NAV;
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav" aria-label="ម៉ឺនុយ">
        {nav.map(([href, km, en, icon]) => (
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
            {name || "—"}
          </span>
          <span className="sub" title={shownName(access.email)}>
            {shownName(access.email)}
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
  const { state, access } = useSaleBook();
  // A shop with no month yet starts on the welcome card (a viewer, who cannot make one, is told there is nothing yet). The account page (to add people), the calculator (it needs
  // no month) and the recently deleted page (to bring a deleted month back) still open.
  const empty = !hasMonths(state) && !["/account", "/calculator", "/trash", "/history"].includes(pathname);
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {!empty ? (
          children
        ) : access.role === "viewer" ? (
          <div className="card empty-card">សៀវភៅលក់មិនទាន់មានខែណាមួយនៅឡើយ</div>
        ) : (
          <Welcome />
        )}
      </main>
    </div>
  );
}
