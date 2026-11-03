// Loads the mockup's sample data into the shop: week 3 of October 2026 with its two mart sheets, payout sheet,
// adjustments and pay-later notes; weeks 1–2 of October as payout totals; July–September as past-month totals;
// and October's month-end sheet. For trying the app; it only adds, never deletes.
import type { Firestore } from "firebase/firestore";
import { writeMany, type MonthDoc, type NoteDoc, type OrderDoc, type SettingsDoc, type WeekDoc } from "./db";
import { toDollars } from "./format";
import { monthId, weekKey } from "./periods";
import {
  CODE_FLOOR,
  SAMPLE_ADJUSTMENTS,
  SAMPLE_EARLIER_WEEKS,
  SAMPLE_MONTH,
  SAMPLE_MONTH_END,
  SAMPLE_NOTES,
  SAMPLE_PAST_MONTHS,
  SAMPLE_PAYOUT,
  SAMPLE_RATE,
  SAMPLE_SELLERS,
  SAMPLE_SHARE,
  SAMPLE_WEEK,
  sampleMarts,
} from "./sample-data";

export async function loadSample(db: Firestore, by: string, current: { sellers: { name: string; code: string }[]; marts: string[] }) {
  const writes: { path: [string, string]; data: object; merge?: boolean }[] = [];
  const mid = monthId(SAMPLE_MONTH);
  const key = weekKey(SAMPLE_MONTH, SAMPLE_WEEK);
  const at = Date.now();

  // Sellers and marts the shop does not have yet; the sample's rate and share.
  const have = new Set(current.sellers.map((s) => s.code));
  // Mart names the shop gave are left as they are.
  const settings: Omit<SettingsDoc, "martNames"> = {
    rate: SAMPLE_RATE,
    share: SAMPLE_SHARE,
    marts: Array.from(new Set([...current.marts, "1", "2"])),
    sellers: [...current.sellers, ...SAMPLE_SELLERS.filter(([, code]) => !have.has(code)).map(([name, code]) => ({ name, code }))],
  };
  writes.push({ path: ["settings", "shop"], data: settings, merge: true });

  // July–September: totals only. Each total sits in week 1, as the months have no weeks to show.
  for (const h of SAMPLE_PAST_MONTHS) {
    const pay = Object.fromEntries(Object.entries(h.totals).map(([name, total]) => [name, [total, null, null, null, null]]));
    const data: MonthDoc = { y: h.y, m: h.m, historyOnly: true, sample: true, closed: { pay, weeks: h.weeks, at } };
    writes.push({ path: ["months", monthId(h)], data });
  }

  // October: weeks 1–2 as payouts without sheets, week 3 with its sheets.
  const extraPay = Object.fromEntries(Object.entries(SAMPLE_EARLIER_WEEKS).map(([name, [w1, w2]]) => [name, [w1, w2, null, null, null]]));
  writes.push({
    path: ["months", mid],
    data: { y: SAMPLE_MONTH.y, m: SAMPLE_MONTH.m, sample: true, extraPay, weeks: { [SAMPLE_WEEK.no]: { date: SAMPLE_WEEK.date } } } satisfies MonthDoc,
    merge: true,
  });
  const week: WeekDoc = {
    monthId: mid,
    no: SAMPLE_WEEK.no,
    codeFloor: CODE_FLOOR,
    adjustments: Object.fromEntries(
      Object.entries(SAMPLE_ADJUSTMENTS).map(([mart, list]) => [mart, list.map(([no, code, amount]) => ({ no, code, amount }))]),
    ),
    payout: SAMPLE_PAYOUT,
  };
  writes.push({ path: ["weeks", key], data: week, merge: true });

  // The orders keep their sample ids ("m1-13"), so loading twice does not make copies.
  for (const mart of sampleMarts()) {
    mart.orders.forEach((o, i) => {
      const { id, ...rest } = o;
      const data: OrderDoc = { ...rest, weekKey: key, monthId: mid, mart: mart.id, at: at + i, by };
      writes.push({ path: ["orders", `sample-${id}`], data });
    });
  }
  SAMPLE_NOTES.forEach((n, i) => {
    const data: NoteDoc = { ...n, weekKey: key, monthId: mid, at: at + i, by };
    writes.push({ path: ["notes", `sample-note-${i + 1}`], data });
  });

  // October's month-end sheet, turned into whole dollars at the sample rate.
  const asText = (n: number) => (n ? String(toDollars(n, SAMPLE_RATE)) : "");
  const rows = Object.fromEntries(
    Object.entries(SAMPLE_MONTH_END).map(([name, r]) => [name, { advance: asText(r.advance), debt: asText(r.debt), note: r.note }]),
  );
  writes.push({ path: ["settlements", mid], data: { rows }, merge: true });

  // The months and settings go last: the pages appear once a month exists, and by then its orders are in.
  const last = (w: (typeof writes)[number]) => w.path[0] === "months" || w.path[0] === "settings";
  await writeMany(db, [...writes.filter((w) => !last(w)), ...writes.filter(last)]);
  return mid;
}
