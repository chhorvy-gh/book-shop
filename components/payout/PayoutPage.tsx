"use client";

// Weekly payout (mockup/payout.html): each seller's profit less the shop's share, with what is taken off or added
// this week, turned into dollars. Deduct, add and paid are saved with the week, so they are still there next time.
import PeriodBar from "@/components/PeriodBar";
import { useSaleBook } from "@/components/store";
import { MoneyCell, SavedInput, Switch } from "@/components/ui";
import { fmt, num, usd } from "@/lib/format";
import { monthLabel, payoutRows, pickedWeek, weekKey, weekLabel, weekRange } from "@/lib/periods";

export default function PayoutPage() {
  const { state, setPayout, setRate } = useSaleBook();
  // The week shown is shared with the other pages; a whole-month pick opens that month's last week.
  const { month: mo, week: w } = pickedWeek(state);
  const rate = state.rate;
  const key = w ? weekKey(mo, w) : "";
  const rows = w ? payoutRows(state, mo, w) : [];

  // Only a seller with something to pay counts toward paid and left to pay.
  let tA = 0, tD = 0, tP = 0, tN = 0, paidN = 0, paidSum = 0, payable = 0;
  for (const r of rows) {
    tA += r.amount;
    tD += r.deduct;
    tP += r.add;
    tN += r.pay;
    if (r.pay > 0) {
      payable += 1;
      if (r.paid) {
        paidN += 1;
        paidSum += r.pay;
      }
    }
  }

  const markAll = () => {
    for (const r of rows) if (r.pay > 0 && !r.paid) setPayout(key, r.name, { paid: true });
  };

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow" id="eyebrow">
            {w ? `${monthLabel(mo)} · ${weekLabel(w)} · ${weekRange(w)}` : monthLabel(mo)}
          </span>
          <h1>ទូទាត់ប្រចាំអាទិត្យ</h1>
        </div>
        <div className="actions">
          {/* The same saved rate as every page; empty or 0 is not saved, and leaving the box shows the saved rate again. */}
          <label className="field" htmlFor="rate" style={{ width: 180 }}>
            អត្រាប្តូរ (1 → $)
            <SavedInput
              className="input num"
              id="rate"
              type="number"
              step="0.00001"
              min="0"
              value={String(rate)}
              onSave={(v) => setRate(num(v))}
            />
          </label>
          <button type="button" className="btn btn-outline" id="mark-all" onClick={markAll} disabled={!w}>
            សម្គាល់ថាបើកទាំងអស់
          </button>
        </div>
      </header>

      <PeriodBar mode="week" addLink />

      {!w ? (
        <div className="card empty-card">មិនទាន់មានអាទិត្យក្នុងខែនេះ</div>
      ) : (
        <>
          <section className="kpis" aria-label="សរុប">
            <div className="kpi is-accent">
              <div className="kpi-label">
                <span>ត្រូវបើកសរុប</span>
              </div>
              <span className="kpi-value" id="k-total-usd">
                {usd(tN, rate)}
              </span>
              <span className="kpi-sub" id="k-total-sub">{`${fmt(tN)} · ${payable} នាក់`}</span>
            </div>
            <div className="kpi">
              <div className="kpi-label">
                <span>បានបើករួច</span>
              </div>
              <span className="kpi-value" id="k-paid-usd">
                {usd(paidSum, rate)}
              </span>
              <span className="kpi-sub" id="k-paid-sub">{`${paidN} នាក់`}</span>
            </div>
            <div className="kpi">
              <div className="kpi-label">
                <span>នៅសល់ត្រូវបើក</span>
              </div>
              <span className="kpi-value t-warning" id="k-left-usd">
                {usd(tN - paidSum, rate)}
              </span>
              <span className="kpi-sub" id="k-left-sub">{`${payable - paidN} នាក់`}</span>
            </div>
          </section>

          <section className="card table-card" aria-label="តារាងទូទាត់">
            <div className="table-toolbar">
              <span className="strong">{`លុយនៅសល់ ${100 - state.share}% ដក បូក ហើយប្តូរជាដុល្លារ`}</span>
              <span className="sub">វាយលេខក្នុងប្រអប់ ដក និង បូក ដើម្បីកែ</span>
            </div>
            <div className="table-wrap">
              <table className="data fixed" style={{ minWidth: 720 }}>
                <colgroup>
                  <col style={{ width: 56 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 96 }} />
                  <col />
                  <col />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">№</th>
                    <th scope="col">ឈ្មោះ</th>
                    <th scope="col" className="r">
                      លុយនៅសល់
                    </th>
                    <th scope="col" className="r">
                      ដក
                    </th>
                    <th scope="col" className="r">
                      បូក
                    </th>
                    <th scope="col" className="r">
                      សរុប
                    </th>
                    <th scope="col" className="r">
                      $ ដុល្លារ
                    </th>
                    <th scope="col">បានបើក</th>
                  </tr>
                </thead>
                <tbody id="rows">
                  {rows.map((r, i) => {
                    const canPay = r.pay > 0;
                    return (
                      <tr key={r.name} data-i={i} className={canPay && r.paid ? "is-done" : undefined}>
                        <td className="muted">{i + 1}</td>
                        <td className="strong">{r.name}</td>
                        <td className="r">{fmt(r.amount)}</td>
                        <td className="cell">
                          <MoneyCell
                            className={r.deduct !== 0 ? "cell-input is-minus" : "cell-input"}
                            field="deduct"
                            label={`ដក សម្រាប់ ${r.name}`}
                            value={r.deduct}
                            onChange={(n) => setPayout(key, r.name, { deduct: n })}
                          />
                        </td>
                        <td className="cell">
                          <MoneyCell
                            className={r.add !== 0 ? "cell-input is-plus" : "cell-input"}
                            field="add"
                            label={`បូក សម្រាប់ ${r.name}`}
                            value={r.add}
                            onChange={(n) => setPayout(key, r.name, { add: n })}
                          />
                        </td>
                        <td className="r strong">{fmt(r.pay)}</td>
                        <td className="r strong t-accent">{usd(r.pay, rate)}</td>
                        <td>
                          {canPay ? (
                            <span>
                              <Switch
                                checked={r.paid}
                                ariaLabel={`បានបើកឱ្យ ${r.name}`}
                                onChange={(paid) => setPayout(key, r.name, { paid })}
                              />
                            </span>
                          ) : (
                            <span className="chip">គ្មានលុយ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>សរុប</td>
                    <td className="r" id="t-amount">
                      {fmt(tA)}
                    </td>
                    <td className="r t-danger" id="t-deduct">
                      {tD ? `-${fmt(tD)}` : "0"}
                    </td>
                    <td className="r t-success" id="t-add">
                      {tP ? `+${fmt(tP)}` : "0"}
                    </td>
                    <td className="r" id="t-net">
                      {fmt(tN)}
                    </td>
                    <td className="r t-accent" id="t-usd">
                      {usd(tN, rate)}
                    </td>
                    <td className="muted" style={{ fontWeight: 500 }} id="t-paid">
                      {`${paidN}/${payable} នាក់`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
