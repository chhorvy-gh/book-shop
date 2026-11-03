"use client";

// «ប្រវត្តិកែប្រែ» (change history): every change made in the book, newest first, by day: who made it, when, and each
// field as it was and as it became. For owners and members. The lines are saved with the changes themselves, and
// nobody can change or remove them (firestore.rules).
import { useMemo, useState } from "react";
import type { HistoryDoc, HistoryKind } from "@/lib/db";
import {
  ACT,
  ACT_FILTERS,
  HISTORY_NAME,
  KIND,
  KIND_FILTERS,
  actIs,
  changedNothing,
  changes,
  dayOf,
  kindIs,
  placeOf,
  remark,
  searchText,
  timeOf,
  type ActFilter,
  type KindFilter,
} from "@/lib/history";
import type { SaleBookState } from "@/lib/types";
import { Icon, type IconName } from "../icons";
import { useHistory, useSaleBook } from "../store";
import { Loading, Tabs, chipClass } from "../ui";

const ICON: Record<HistoryKind, IconName> = {
  order: "receipt",
  note: "note",
  month: "month",
  week: "calendar",
  mart: "file",
  seller: "user",
  rate: "dollar",
  payout: "dollar",
  deduct: "calendar",
  settlement: "calc",
  member: "user",
  sample: "info",
};

type Line = { id: string; data: HistoryDoc };

export default function HistoryPage() {
  const { state, access } = useSaleBook();
  const editor = access.role === "owner" || access.role === "member";
  const history = useHistory(editor);
  const [kind, setKind] = useState<KindFilter>("all");
  const [act, setAct] = useState<ActFilter>("all");
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");

  // An edit that ended where it began (typed, then put back) changed nothing, so it is left out.
  const lines = useMemo(() => (history.list ?? []).filter((l) => !changedNothing(l.data)), [history.list]);
  const people = useMemo(() => Array.from(new Set(lines.map((l) => l.data.by))).sort(), [lines]);
  const needle = query.trim().toLowerCase();
  const shown = lines.filter(
    ({ data: e }) => kindIs(e, kind) && actIs(e, act) && (!who || e.by === who) && (!needle || searchText(state, e).includes(needle)),
  );
  // By day; the lines come newest first, so the days do too.
  const days: { day: string; lines: Line[] }[] = [];
  for (const l of shown) {
    const day = dayOf(l.data.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.lines.push(l);
    else days.push({ day, lines: [l] });
  }

  let body: React.ReactNode;
  if (!editor) body = <div className="card empty-card">តែម្ចាស់ហាង និងអ្នកប្រើប៉ុណ្ណោះ ដែលមើលប្រវត្តិកែប្រែបាន</div>;
  else if (history.error)
    body = (
      <p className="alert alert-danger" style={{ margin: 0 }}>
        <Icon name="alert" />
        <span>
          <b>មិនអាចបើកប្រវត្តិកែប្រែបានទេ</b> · {history.error}
        </span>
      </p>
    );
  else if (history.list === null) body = <Loading />;
  else if (!lines.length) body = <div className="card empty-card">មិនទាន់មានការផ្លាស់ប្តូរនៅឡើយ · ការបន្ថែម កែ ឬលុបពីពេលនេះទៅ នឹងបង្ហាញនៅទីនេះ</div>;
  else
    body = (
      <>
        {!days.length ? (
          <div className="card empty-card">គ្មានការផ្លាស់ប្តូរដែលត្រូវនឹងការស្វែងរកនេះទេ</div>
        ) : (
          days.map((d) => (
            <section key={d.day} className="card history-day" aria-label={d.day}>
              <div className="card-head">
                <h2>{d.day}</h2>
                <span className="sub">{`${d.lines.length} ការផ្លាស់ប្តូរ`}</span>
              </div>
              <ul className="trash-list history-list">
                {d.lines.map((l) => (
                  <HistoryRow key={l.id} state={state} e={l.data} />
                ))}
              </ul>
            </section>
          ))
        )}
        {history.more && (
          <div className="history-more">
            <button type="button" className="btn btn-outline" disabled={history.loadingMore} onClick={history.loadMore}>
              {history.loadingMore ? "កំពុងបើក…" : "បង្ហាញចាស់ជាងនេះ"}
            </button>
          </div>
        )}
      </>
    );

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">អ្វីដែលបានបន្ថែម កែ និងលុប · ថ្មីបំផុតមុនគេ</span>
          <h1>{HISTORY_NAME}</h1>
        </div>
      </header>
      <p className="muted" style={{ margin: 0 }}>
        ការផ្លាស់ប្តូរនីមួយៗ កត់ទុកជាមួយអ្នកធ្វើ ពេលវេលា និងតម្លៃមុន → ក្រោយ។ គ្មាននរណាអាចកែ ឬលុបប្រវត្តិនេះបានទេ។
      </p>
      {editor && !!lines.length && (
        <div className="history-tools">
          <Tabs<KindFilter> label="ប្រភេទ" value={kind} onPick={setKind} items={KIND_FILTERS.map(([key, label]) => ({ key, label }))} />
          <Tabs<ActFilter> label="សកម្មភាព" value={act} onPick={setAct} items={ACT_FILTERS.map(([key, label]) => ({ key, label }))} />
          {people.length > 1 && (
            <select className="select" aria-label="អ្នកធ្វើ" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">គ្រប់គ្នា</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              type="search"
              placeholder="ស្វែងរកកូដ ឈ្មោះ ឬអ៊ីមែល"
              aria-label="ស្វែងរក"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}
      {body}
    </>
  );
}

function HistoryRow({ state, e }: { state: SaleBookState; e: HistoryDoc }) {
  const place = placeOf(state, e);
  const list = changes(e);
  const note = remark(e);
  return (
    <li>
      <span className="avatar" aria-hidden="true">
        <Icon name={ICON[e.kind]} size={18} />
      </span>
      <span className="stack history-main">
        <span className="history-title">
          <span className={chipClass(ACT[e.act].tone)}>{ACT[e.act].label}</span>
          <span className="strong">{e.title || KIND[e.kind]}</span>
        </span>
        {place && <span className="sub">{place}</span>}
        {list.length > 0 && (
          <span className="history-changes">
            {list.map((c) => (
              <span key={c.label}>
                {`${c.label} `}
                {c.before !== undefined && <span className={c.after !== undefined ? "was" : undefined}>{c.before}</span>}
                {c.before !== undefined && c.after !== undefined && " → "}
                {c.after !== undefined && <b>{c.after}</b>}
              </span>
            ))}
          </span>
        )}
        {note && <span className="sub">{note}</span>}
      </span>
      <span className="history-who">
        <span className="strong num">{timeOf(e.at)}</span>
        <span className="sub" title={e.by}>
          {e.by}
        </span>
      </span>
    </li>
  );
}
