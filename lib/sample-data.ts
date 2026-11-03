// Sample data copied from the mockup (week-3 Excel sheets, 03-10-2026).
// Every page starts from this data until something is saved in the browser; swap it for API calls once a backend has sales endpoints.
import type { Item, Mart, Note, Status } from "./types";

// [display name, code prefix]: orders of បងណា are ហេង1, ហេង2 …
export const SAMPLE_SELLERS: [string, string][] = [
  ["បងណា", "ហេង"], ["បងអិត", "អិត"], ["បងនាង", "នាង"], ["បងច្រិច", "ច្រិច"], ["បងទូច", "កនីដ្ឋា"],
  ["បងធា", "ធា"], ["ឡែន", "ឡែន"], ["រក្សា", "ក្សា"], ["ស្រីកា", "ស្រីកា"], ["សុជាតា", "សុជាតា"],
  ["លីដា", "លីដា"], ["នីតា", "នីតា"], ["លីន", "លីន"], ["ណាណា", "ណាណា"], ["ស្រីអូន", "ស្រីអូន"],
  ["ស្រីនាថ", "ស្រីនាថ"], ["រ័ត្ន", "រ័ត្ន"], ["លីលី", "លីលី"], ["សក្កដា", "សក្កដា"], ["ធីតា", "ធីតា"],
  ["អាតា", "អាតា"],
];

// Highest code number already used per prefix in earlier sheets, so new codes do not repeat them.
export const CODE_FLOOR: Record<string, number> = {"ហេង": 35, "អិត": 15, "ច្រិច": 8, "ធា": 10, "ឡែន": 9, "ក្សា": 12, "កនីដ្ឋា": 3, "សុជាតា": 4, "នីតា": 3, "អាតា": 9, "ស្រីកា": 2};

// [no, code, cost, sale, status]: p = paid, u = unpaid, x = cancelled.
type Row = [number, string, number, number, Status];

const MART_1: Row[] = [
  [1, "ស្រីនាថ1", 81000, 95000, "p"], [2, "អិត1", 0, 32000, "u"], [3, "នាង1", 183000, 203000, "p"],
  [4, "អាតា1", 33500, 35500, "p"], [5, "អាតា2", 71000, 80000, "p"], [6, "ស្រីអូន1", 70000, 82500, "u"],
  [7, "ធា1", 167000, 177000, "p"], [8, "ធា2", 76000, 85000, "u"], [9, "អិត2", 128400, 141000, "p"],
  [10, "អាតា3", 64600, 77000, "p"], [11, "អិត3", 130000, 143000, "p"], [12, "អាតា4", 38000, 49000, "p"],
  [13, "ហេង1", 109000, 126000, "u"], [14, "ហេង3", 55500, 58500, "p"], [15, "ច្រិច2", 141500, 157000, "p"],
  [16, "លីន1", 71500, 80500, "p"], [17, "ឡែន1", 60000, 64000, "p"], [18, "អាតា5", 47000, 64000, "p"],
  [19, "ក្សា1", 203000, 240000, "u"], [20, "Nam chung", 184800, 207300, "p"], [21, "ហេង6", 96000, 103000, "u"],
  [22, "ស្រីកា1", 49800, 59000, "p"], [23, "ដាដា2", 15000, 17000, "p"], [24, "ដាដា1", 85500, 95500, "p"],
  [25, "សុជាតា1", 88500, 106500, "u"], [26, "នីតា1", 90000, 97000, "u"], [27, "សុជាតា2", 92000, 108000, "p"],
  [28, "ហេង7", 47000, 49000, "u"], [29, "ធា5", 152000, 174000, "p"], [30, "អិត5", 192000, 217000, "u"],
  [31, "ធា6", 161000, 182500, "p"], [32, "ក្សា2", 85500, 98000, "p"], [33, "ហេង8", 136000, 149200, "p"],
  [34, "អាតា6", 69000, 76500, "p"], [35, "ហេង9", 33000, 37000, "p"], [36, "ក្សា3", 60000, 68000, "p"],
  [37, "នីតា2", 58500, 63500, "p"], [38, "នាង3", 59500, 69800, "p"], [39, "ស្រីអូន2", 27500, 31500, "p"],
  [40, "ហេង10", 91000, 102000, "p"], [41, "ធា7", 18500, 20500, "p"], [42, "ក្សា4", 88500, 103800, "p"],
  [43, "កនីដ្ឋា1", 92000, 105500, "p"], [44, "រ័ត្ន1", 246500, 267500, "u"], [45, "ហេង12", 22500, 25500, "p"],
  [46, "អិត6", 78000, 86500, "p"], [47, "ច្រិច3", 22000, 25500, "p"], [48, "ហេង15", 31000, 34000, "p"],
  [49, "អាតា7", 71500, 82000, "p"], [50, "អិត7", 45000, 51000, "p"], [51, "កនីដ្ឋា2", 98000, 107500, "p"],
  [52, "ក្សា5", 111500, 121000, "p"], [53, "កនីដ្ឋា3", 59000, 70000, "p"], [54, "ស្រីកា2", 43000, 51000, "p"],
  [55, "ហេង16", 46500, 51000, "u"], [56, "ឡែន3", 25000, 28000, "p"], [57, "ច្រិច4", 142000, 168500, "p"],
  [58, "នាង4", 134000, 147000, "p"], [59, "ហេង19", 16500, 18500, "p"], [60, "រ័ត្ន2", 139000, 157600, "u"],
  [61, "ក្សា6", 69000, 80000, "p"], [62, "អិត11", 133000, 147500, "p"], [63, "អិត10", 20500, 22500, "u"],
  [64, "អិត12", 35000, 41500, "p"], [65, "ធា8", 15000, 17000, "p"], [66, "ធា9", 27500, 30500, "p"],
  [67, "ឡែន6", 60000, 68000, "p"], [68, "ឡែន7", 46000, 51000, "p"], [69, "សក្កដា1", 123500, 135500, "p"],
  [70, "អាតា8", 44000, 51000, "p"], [71, "ហេង21", 58000, 65000, "p"], [72, "ច្រិច5", 322000, 361000, "p"],
  [73, "សុជាតា4", 129000, 140000, "u"], [74, "ហេង22", 57000, 67600, "p"], [75, "ឡែន8", 36500, 40500, "p"],
  [76, "អិត13", 83000, 97400, "p"], [77, "ហេង23", 22500, 25500, "u"], [78, "ហេង24", 61000, 57000, "p"],
  [79, "ហេង25", 58000, 66500, "p"], [80, "ហេង26", 41500, 46500, "p"], [81, "អិត14", 12500, 14500, "p"],
  [82, "ក្សា8", 95500, 109500, "p"], [83, "នីតា3", 72000, 79000, "p"], [84, "រ័ត្ន3", 128500, 142500, "p"],
  [85, "ហេង27", 45000, 51000, "p"], [86, "អិត15", 47000, 51000, "p"], [87, "ហេង28", 41000, 44500, "p"],
  [88, "ហេង29", 124000, 139000, "p"], [89, "ឡែន9", 56500, 65500, "u"], [90, "ច្រិច6", 119500, 137000, "u"],
  [91, "ក្សា11", 51000, 60500, "u"], [92, "ហេង31", 110000, 122000, "u"], [93, "ហេង32", 107500, 120500, "u"],
  [94, "ច្រិច7", 116000, 131500, "p"], [95, "ធា10", 12500, 14000, "u"], [96, "ហេង33", 117800, 138800, "u"],
];

const MART_2: Row[] = [
  [1, "នាង2", 45500, 51500, "p"], [2, "ធា3", 71500, 78500, "p"], [3, "ហេង2", 43000, 46500, "p"],
  [4, "ច្រិច1", 112200, 129000, "p"], [5, "ហេង4", 40500, 49000, "p"], [6, "ហេង5", 64000, 69000, "u"],
  [7, "អិត4", 47000, 62000, "p"], [8, "ធា4", 26000, 30000, "p"], [9, "សុជាតា3", 35000, 39000, "p"],
  [10, "ឡែន2", 64000, 69000, "p"], [11, "លីលី1", 22000, 25000, "p"], [12, "ហេង11", 228000, 236000, "p"],
  [13, "ហេង13", 30500, 37500, "p"], [14, "ហេង14", 25000, 33000, "p"], [15, "ស្រីនាថ2", 55500, 59000, "p"],
  [16, "ក្សា7", 35000, 39000, "u"], [17, "ហេង17", 35000, 39000, "p"], [18, "ឡែន4", 18000, 20000, "p"],
  [19, "ហេង18", 43000, 49000, "p"], [20, "អិត8", 21000, 25000, "p"], [21, "ឡែន5", 64000, 72500, "p"],
  [22, "ក្សា9", 51000, 57000, "p"], [23, "អិត9", 31000, 35000, "u"], [24, "នាង5", 34500, 42000, "p"],
  [25, "ហេង20", 73000, 80000, "p"], [26, "ក្សា10", 17000, 19000, "p"], [27, "ហេង30", 79000, 94000, "p"],
  [28, "អាតា9", 141500, 164000, "p"], [29, "—", 0, 0, "x"], [30, "ក្សា12", 59000, 71000, "p"],
  [31, "ច្រិច8", 107400, 128500, "p"], [32, "ហេង34", 57000, 66000, "u"], [33, "ហេង35", 44500, 50000, "p"],
];

// Item lists as pasted from Telegram ("ឆ្អឹងគោសាច់4គីឡូ52000"). The sample makes them up from each order's totals,
// the same way the mockup does; the real app keeps the list that was pasted.
const PRODUCTS: [string, string, number][] = [
  ["ឆ្អឹងគោសាច់", "គីឡូ", 13000], ["គល់ស្លឹកគ្រៃ", "គីឡូ", 9000], ["មាន់ស្រែ", "ក្បាល", 26000],
  ["ជើងមាន់", "គីឡូ", 9000], ["សាច់ជ្រូក", "គីឡូ", 28500], ["សាច់គោ", "គីឡូ", 40000],
  ["ត្រីរ៉ស់", "គីឡូ", 16000], ["បង្គា", "គីឡូ", 45000], ["ស្លាបមាន់", "គីឡូ", 14000],
  ["ឆ្អឹងជំនីជ្រូក", "គីឡូ", 22000], ["ទាស្រែ", "ក្បាល", 30000], ["ត្រីងៀត", "កញ្ចប់", 15000],
];

// Lines are rounded to 500 and the last one takes what is left, so they add up to the order exactly.
function spread(total: number, weights: number[]) {
  const sum = weights.reduce((a, w) => a + w, 0);
  let left = total;
  return weights.map((w, i) => {
    const v = i === weights.length - 1 ? left : Math.round((total * w) / sum / 500) * 500;
    left -= v;
    return v;
  });
}

// Seeded, so the server and the browser make the same lists.
function makeItems(seed: number, cost: number, sale: number): Item[] {
  if (!(sale > 0)) return [];
  let s = seed;
  const rand = (n: number) => {
    s = (s * 9301 + 49297) % 233280;
    return Math.floor((s / 233280) * n);
  };
  const pool = PRODUCTS.slice();
  const count = Math.min(2 + rand(4), Math.max(1, Math.floor(sale / 10000)));
  const lines = [];
  for (let i = 0; i < count; i++) {
    const [name, unit, price] = pool.splice(rand(pool.length), 1)[0];
    lines.push({ name, unit, price, qty: Math.max(1, Math.round(sale / count / price)) });
  }
  const sales = spread(sale, lines.map((l) => l.qty * l.price));
  const costs = spread(cost, sales);
  return lines.map((l, i) => ({ name: l.name, qty: l.qty, unit: l.unit, cost: costs[i], sale: sales[i] }));
}

export function sampleMarts(): Mart[] {
  return [
    ["1", "Mart 1", MART_1],
    ["2", "Mart 2", MART_2],
  ].map(([id, label, rows], k) => ({
    id: id as string,
    label: label as string,
    orders: (rows as Row[]).map(([no, code, cost, sale, status]) => ({
      id: `m${id}-${no}`,
      no,
      code,
      cost,
      sale,
      status,
      items: makeItems((k + 1) * 1000 + no, cost, sale),
    })),
  }));
}

// ---------- The sample week and month ----------
// The sample week is week 3 of October 2026; weeks 1–2 of that month exist only as payout totals.
export const SAMPLE_MONTH = { y: 2026, m: 10 };
export const SAMPLE_WEEK = { no: 3, date: "03-10-2026" };
export const SAMPLE_RATE = 0.00068; // 1 riel → $
export const SAMPLE_SHARE = 25; // % of a seller's profit the shop keeps

// Adjustments noted beside each sheet of the sample week: [order no, code, amount].
export const SAMPLE_ADJUSTMENTS: Record<string, [number, string, number][]> = {"1": [[1, "ស្រីនាថ1", -26000], [3, "នាង1", -500], [14, "ហេង3", -8000], [19, "ក្សា1", -27000], [19, "ក្សា1", -2000], [22, "ស្រីកា1", -4500], [26, "នីតា1", -26000], [29, "ធា5", -6000], [30, "អិត5", 20000], [35, "ហេង9", -9000], [40, "ហេង10", -8000], [47, "ច្រិច3", 500], [57, "ច្រិច4", -5000], [62, "អិត11", -3000], [73, "សុជាតា4", -500], [74, "ហេង22", -500], [75, "ឡែន8", -4500], [76, "អិត13", 18100], [87, "ហេង28", -1000], [88, "ហេង29", -500], [94, "ច្រិច7", -4000]], "2": [[22, "ក្សា9", -4500], [31, "ច្រិច8", -2500]]};

// Weekly payout sheet of the sample week: what is taken off or added per seller, and who is paid already.
export const SAMPLE_PAYOUT: Record<string, { deduct: number; add: number; paid: boolean }> = {
  "បងណា": { deduct: 31000, add: 0, paid: false },
  "បងអិត": { deduct: 0, add: 0, paid: true },
  "បងនាង": { deduct: 0, add: 22700, paid: false },
  "បងច្រិច": { deduct: 0, add: 0, paid: true },
  "បងទូច": { deduct: 0, add: 0, paid: true },
  "បងធា": { deduct: 9000, add: 0, paid: false },
  "ឡែន": { deduct: 4000, add: 0, paid: false },
  "ស្រីកា": { deduct: 0, add: 0, paid: true },
  "នីតា": { deduct: 0, add: 0, paid: true },
  "លីន": { deduct: 0, add: 0, paid: true },
  "ស្រីអូន": { deduct: 0, add: 0, paid: true },
  "សក្កដា": { deduct: 0, add: 0, paid: true },
  "អាតា": { deduct: 4500, add: 0, paid: false },
};

// Payout totals for weeks 1 and 2 of the sample month, which have no order sheets.
export const SAMPLE_EARLIER_WEEKS: Record<string, [number, number]> = {
  "បងណា": [319000, 360850],
  "បងអិត": [55950, 38550],
  "បងនាង": [82950, 54825],
  "បងច្រិច": [45525, 77625],
  "បងទូច": [34500, 66000],
  "បងធា": [31500, 195000],
  "ឡែន": [49650, 45750],
  "រក្សា": [40275, 31500],
  "ស្រីកា": [7500, 14250],
  "សុជាតា": [59625, 89250],
  "លីដា": [0, 58000],
  "នីតា": [10875, 57075],
  "លីន": [0, 10125],
  "ណាណា": [8625, 3375],
  "ស្រីអូន": [31500, 1000],
  "ស្រីនាថ": [19500, 48200],
  "រ័ត្ន": [9000, 38250],
  "លីលី": [-2250, 18750],
  "សក្កដា": [22500, 14250],
  "ធីតា": [0, 7500],
  "អាតា": [57750, 90450],
};

// Totals per seller for the months before the sample month (sample numbers; the real app closes each month itself).
export const SAMPLE_PAST_MONTHS: { y: number; m: number; weeks: number; totals: Record<string, number> }[] = [
  { y: 2026, m: 7, weeks: 4, totals: {"បងណា": 673200, "បងអិត": 386950, "បងនាង": 225125, "បងច្រិច": 245600, "បងទូច": 198825, "បងធា": 381725, "ឡែន": 147100, "រក្សា": 292600, "ស្រីកា": 55625, "សុជាតា": 255975, "លីដា": 88750, "នីតា": 121525, "លីន": 28200, "ណាណា": 12700, "ស្រីអូន": 53825, "ស្រីនាថ": 125700, "រ័ត្ន": 135075, "លីលី": 16075, "សក្កដា": 69975, "ធីតា": 9750, "អាតា": 388675} },
  { y: 2026, m: 8, weeks: 5, totals: {"បងណា": 1747300, "បងអិត": 252675, "បងនាង": 342000, "បងច្រិច": 534750, "បងទូច": 241675, "បងធា": 518475, "ឡែន": 226150, "រក្សា": 404700, "ស្រីកា": 76625, "សុជាតា": 277750, "លីដា": 83925, "នីតា": 173950, "លីន": 24350, "ណាណា": 14450, "ស្រីអូន": 62675, "ស្រីនាថ": 127000, "រ័ត្ន": 121825, "លីលី": 42175, "សក្កដា": 79750, "ធីតា": 14800, "អាតា": 472900} },
  { y: 2026, m: 9, weeks: 4, totals: {"បងណា": 725775, "បងអិត": 237050, "បងនាង": 283900, "បងច្រិច": 321850, "បងទូច": 157450, "បងធា": 280625, "ឡែន": 226100, "រក្សា": 156800, "ស្រីកា": 41225, "សុជាតា": 216625, "លីដា": 87500, "នីតា": 146800, "លីន": 22775, "ណាណា": 11725, "ស្រីអូន": 55325, "ស្រីនាថ": 89100, "រ័ត្ន": 103950, "លីលី": 23475, "សក្កដា": 52825, "ធីតា": 10250, "អាតា": 317000} },
];

// Month-end sheet of the sample month: advance taken, debt to cut and amount to add (riel), and the note.
export const SAMPLE_MONTH_END: Record<string, { advance: number; debt: number; add: number; note: string }> = {
  "បងអិត": { advance: 84000, debt: 0, add: 0, note: "ដក 84,000" },
  "សុជាតា": { advance: 0, debt: 425025, add: 0, note: "ដកខែថ្មី 271,000 + 154,025" },
  "លីដា": { advance: 0, debt: 0, add: 49000, note: "បូក 49,000" },
  "ស្រីនាថ": { advance: 0, debt: 0, add: 20000, note: "បូក 20,000" },
  "រ័ត្ន": { advance: 0, debt: 260000, add: 0, note: "ដក 260,000 កាត់ចុងខែហើយនៅខ្វះ" },
  "លីលី": { advance: 30000, debt: 0, add: 0, note: "បើកមុន $50 · ដកលុយ 30,000" },
  "អាតា": { advance: 114000, debt: 0, add: 0, note: "ដក 114,000" },
};

// Pay-later notes of the sample week. due: "5" … "25" = that day of the month, "YYYY-MM-DD" = a set date,
// "next" = next month, "" = not set.
export const SAMPLE_NOTES: Omit<Note, "id">[] = [
  { no: 43, code: "ស្រីនាថ1", due: "20", amount: 259300, note: "រួមទាំង ស្រីនាថ2", collected: true, flagged: false },
  { no: 39, code: "ស្រីនាថ2", due: "20", amount: 0, note: "បូករួមក្នុង #43", collected: true, flagged: false },
  { no: 12, code: "ធីតា3", due: "25", amount: 121000, note: "", collected: false, flagged: false },
  { no: 17, code: "ធីតា1", due: "25", amount: 68000, note: "", collected: false, flagged: false },
  { no: 39, code: "លីលី1", due: "20", amount: 30000, note: "", collected: false, flagged: false },
  { no: 8, code: "រ័ត្ន1", due: "5", amount: 183000, note: "", collected: false, flagged: false },
  { no: 9, code: "រ័ត្ន2", due: "5", amount: 77000, note: "", collected: false, flagged: false },
  { no: 44, code: "សុជាតា8", due: "5", amount: 112000, note: "", collected: false, flagged: false },
  { no: 68, code: "សុជាតា7", due: "10", amount: 90000, note: "", collected: false, flagged: false },
  { no: 18, code: "សុជាតា5(1)", due: "15", amount: 69000, note: "", collected: false, flagged: false },
  { no: 51, code: "រក្សា9", due: "5", amount: 71500, note: "", collected: false, flagged: false },
  { no: 64, code: "លីលី3", due: "2026-09-10", amount: 200000, note: "", collected: false, flagged: false },
  { no: 26, code: "លីលី1", due: "next", amount: 30000, note: "", collected: false, flagged: false },
  { no: 95, code: "អិត10", due: "", amount: 84000, note: "", collected: false, flagged: false },
  { no: 66, code: "ហេង31", due: "5", amount: 424000, note: "", collected: false, flagged: true },
  { no: 59, code: "ហេង16", due: "5", amount: 240000, note: "", collected: false, flagged: true },
  { no: 72, code: "ហេង23", due: "25", amount: 146500, note: "", collected: false, flagged: true },
  { no: 93, code: "ហេង38", due: "5", amount: 244500, note: "", collected: false, flagged: true },
  { no: 17, code: "ហេង39", due: "5", amount: 152000, note: "", collected: false, flagged: true },
];
