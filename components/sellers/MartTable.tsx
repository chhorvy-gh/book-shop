"use client";

// The profit-by-seller page's month mart by mart, like the workbook kept by hand: for each mart, its sales, cost, profit
// and number of orders in weeks 1–5 and in the whole month; with several marts, every mart together last. Every order
// of the mart counts, whoever the seller; cancelled orders do not. A week the month does not have is "—".
import { fmt } from "@/lib/format";
import { martLabel, monthLabel, weekOrders } from "@/lib/periods";
import type { Month, SaleBookState } from "@/lib/types";

const WEEKS = [1, 2, 3, 4, 5];
type Sums = { sale: number; cost: number; profit: number; orders: number };
const ZERO: Sums = { sale: 0, cost: 0, profit: 0, orders: 0 };
const add = (a: Sums, b: Sums): Sums => ({ sale: a.sale + b.sale, cost: a.cost + b.cost, profit: a.profit + b.profit, orders: a.orders + b.orders });

// One mart (or every mart): a row per week, then the month's total.
function Sheet({ title, weeks }: { title: string; weeks: (Sums | null)[] }) {
  const total = weeks.reduce<Sums>((a, s) => (s ? add(a, s) : a), ZERO);
  const cells = (s: Sums | null) =>
    s ? (
      <>
        <td className={s.sale ? "r" : "r muted"}>{fmt(s.sale)}</td>
        <td className={s.cost ? "r" : "r muted"}>{fmt(s.cost)}</td>
        <td className={`r strong ${!s.profit ? "muted" : s.profit < 0 ? "t-danger" : "t-success"}`}>{fmt(s.profit)}</td>
        <td className={s.orders ? "r" : "r muted"}>{s.orders}</td>
      </>
    ) : (
      <td className="r muted" colSpan={4}>
        —
      </td>
    );
  return (
    <div className="mart-sheet">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">អាទិត្យ</th>
              <th scope="col" className="r">
                លុយលក់
              </th>
              <th scope="col" className="r">
                លុយដើម
              </th>
              <th scope="col" className="r">
                ចំណេញ
              </th>
              <th scope="col" className="r">
                ការបញ្ជាទិញ
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((s, i) => (
              <tr key={i}>
                <td className="muted">{WEEKS[i]}</td>
                {cells(s)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>សរុប</td>
              <td className="r">{fmt(total.sale)}</td>
              <td className="r">{fmt(total.cost)}</td>
              <td className={`r ${total.profit < 0 ? "t-danger" : "t-success"}`}>{fmt(total.profit)}</td>
              <td className="r">{total.orders}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function MartTable({ state, month }: { state: SaleBookState; month: Month }) {
  // Each mart's sums in each week of the month by its number; null where the month has no such week.
  const marts = state.marts.map((id) => ({
    id,
    weeks: WEEKS.map((no) => {
      const w = month.weeks.find((x) => x.no === no);
      if (!w) return null;
      return weekOrders(state, month, w)
        .filter((o) => o.mart === id && o.status !== "x")
        .reduce<Sums>((a, o) => add(a, { sale: o.sale, cost: o.cost, profit: o.sale - o.cost, orders: 1 }), ZERO);
    }),
  }));
  const all = WEEKS.map((_, i) => (marts.some((m) => m.weeks[i]) ? marts.reduce<Sums>((a, m) => add(a, m.weeks[i] ?? ZERO), ZERO) : null));

  return (
    <section className="card" aria-labelledby="mart-title">
      <div className="card-head">
        <h2 id="mart-title" style={{ fontSize: 16 }}>
          {`សរុបតាម Mart · ${monthLabel(month)}`}
        </h2>
        <span className="sub">ការបញ្ជាទិញទាំងអស់ក្នុង Mart នីមួយៗ · មិនរាប់ការបញ្ជាទិញដែលបោះបង់</span>
      </div>
      <div className="mart-sheets">
        {marts.map((m) => (
          <Sheet key={m.id} title={martLabel(state, m.id)} weeks={m.weeks} />
        ))}
        {marts.length > 1 && <Sheet title="គ្រប់ Mart" weeks={all} />}
      </div>
    </section>
  );
}
