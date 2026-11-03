// Excel files laid out like the workbooks kept by hand.
// A week's sales sheet: orders in blocks of 30 side by side (no, code, cost, sale, profit), totals under each block,
// and the week's totals on the right. A cost-only export keeps just the order number and cost: no codes (they carry
// the seller's name), no row of column names and no week column on the right.
// ExcelJS is loaded the first time a file is made, so it does not weigh on the pages.
import type { Cell, Workbook, Worksheet } from "exceljs";
import type { Status } from "./types";

const BLOCK = 30; // orders per block
const FIRST = 3; // first order row; row 1 is the title, row 2 the headings (the cost-only sheet has none)
type ColKey = "no" | "code" | "cost" | "sale" | "profit";
// Columns of one block: [key, heading, width]. The cost-only export keeps no and cost.
const COLS: [ColKey, string, number][] = [
  ["no", "លេខ", 5],
  ["code", "កូដ", 13],
  ["cost", "លុយដើម", 10],
  ["sale", "លុយលក់", 10],
  ["profit", "ចំណេញ", 10],
];
const COST_COLS: ColKey[] = ["no", "cost"];
const MONEY: ColKey[] = ["cost", "sale", "profit"];
const COLOR = {
  title: "FFFF9900",
  head: "FFD9D9D9",
  profit: "FFC0C0C0",
  paid: "FFFF9900",
  cancelled: "FFFF0000",
  total: "FFA6A6A6",
  sale: "FFE6B8AF",
  yellow: "FFFFFF00",
};

async function load() {
  const mod = await import("exceljs");
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

const paint = (cell: Cell, argb: string) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
};

// Excel takes one font per run of text, so Khmer runs get the Khmer font and the rest (English, numbers, "·", "–")
// gets Inter; a cell that mixes both becomes rich text. Khmer uses Khmer OS Battambang rather than the app's
// Kantumruy Pro: it is already on most Khmer computers, and a spreadsheet app that cannot find the named font
// draws Khmer too small to read. It is a tall font, so the title row is given room for it.
const FONT = { latin: "Inter", khmer: "Khmer OS Battambang" };
const KHMER = /[ក-៿᧠-᧿​-‍]/;
const RUNS = /[ក-៿᧠-᧿​-‍]+|[^ក-៿᧠-᧿​-‍]+/g;
function setFonts(ws: Worksheet) {
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      if (cell.master !== cell) return; // merged: the master cell carries the text
      const font = { size: 11, ...cell.font };
      const name = (text: string) => (KHMER.test(text) ? FONT.khmer : FONT.latin);
      const v = cell.value;
      const runs = typeof v === "string" ? v.match(RUNS) : null;
      if (runs && runs.length > 1) {
        cell.value = { richText: runs.map((text) => ({ text, font: { ...font, name: name(text) } })) };
      }
      cell.font = { ...font, name: typeof v === "string" ? name(v) : FONT.latin };
    }),
  );
}

// One order row of a sales sheet; status p = paid (orange number), u = unpaid, x = cancelled (red, not counted).
export interface ExportRow {
  no: number;
  code: string;
  cost: number;
  sale: number;
  status: Status;
}

function addSheet(wb: Workbook, name: string, title: string, rows: ExportRow[], costOnly: boolean) {
  const first = costOnly ? FIRST - 1 : FIRST;
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: first - 1 }] });
  const cols = costOnly ? COLS.filter(([key]) => COST_COLS.includes(key)) : COLS;
  const WIDTH = cols.length;
  const at = {} as Record<ColKey, number>;
  cols.forEach(([key], i) => {
    at[key] = i;
  });
  const blocks = Math.max(1, Math.ceil(rows.length / BLOCK));
  const last = first + BLOCK - 1;
  const T = { cost: last + 1, sale: last + 2, count: costOnly ? last + 2 : last + 3 };
  const col = (b: number, key: ColKey) => b * WIDTH + at[key] + 1;
  const ref = (y: number, c: number) => ws.getColumn(c).letter + y;
  const S1 = blocks * WIDTH + 1;
  const S2 = S1 + 1;
  const END = costOnly ? S1 - 1 : S2; // last column used: the cost-only sheet has no week column on the right
  const kept = rows.filter((r) => r.status !== "x");
  const sum = (f: "cost" | "sale") => kept.reduce((a, r) => a + r[f], 0);

  ws.mergeCells(1, 1, 1, END);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  paint(t, COLOR.title);
  ws.getRow(1).height = 30;

  for (let b = 0; b < blocks; b++) {
    for (const [key, label, width] of cols) {
      // In the cost-only sheet the number column also holds the "Total" and "Order" labels, so it is a little wider.
      ws.getColumn(col(b, key)).width = costOnly && key === "no" ? 8 : width;
      if (costOnly) continue;
      const c = ws.getCell(2, col(b, key));
      c.value = label;
      c.font = { bold: true };
      c.alignment = { horizontal: MONEY.includes(key) ? "right" : "left" };
      paint(c, COLOR.head);
    }

    const part = rows.slice(b * BLOCK, (b + 1) * BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      const y = first + i;
      const r = part[i];
      if (!costOnly) paint(ws.getCell(y, col(b, "profit")), COLOR.profit);
      if (!r) continue;
      const no = ws.getCell(y, col(b, "no"));
      const code = costOnly ? null : ws.getCell(y, col(b, "code"));
      no.value = r.no;
      no.alignment = { horizontal: "right" };
      if (code) code.value = r.code;
      if (r.status === "x") {
        paint(no, COLOR.cancelled);
        if (code) code.font = { strike: true, color: { argb: "FF808080" } };
        continue;
      }
      if (r.status === "p") paint(no, COLOR.paid);
      ws.getCell(y, col(b, "cost")).value = r.cost;
      if (costOnly) continue;
      ws.getCell(y, col(b, "sale")).value = r.sale;
      ws.getCell(y, col(b, "profit")).value = {
        formula: `${ref(y, col(b, "sale"))}-${ref(y, col(b, "cost"))}`,
        result: r.sale - r.cost,
      };
    }

    // Block totals stay formulas, so changing a number in Excel updates them.
    const blockKept = part.filter((r) => r.status !== "x");
    const range = (key: ColKey) => `${ref(first, col(b, key))}:${ref(last, col(b, key))}`;
    const total = (key: "cost" | "sale" | "profit") =>
      blockKept.reduce((a, r) => a + (key === "profit" ? r.sale - r.cost : r[key]), 0);
    ws.getCell(T.cost, col(b, "cost")).value = { formula: `SUM(${range("cost")})`, result: total("cost") };
    if (!costOnly) {
      ws.getCell(T.sale, col(b, "sale")).value = { formula: `SUM(${range("sale")})`, result: total("sale") };
      ws.getCell(T.sale, col(b, "profit")).value = { formula: `SUM(${range("profit")})`, result: total("profit") };
    }
    // The order count sits under the code column, or under the cost in the cost-only sheet,
    // and counts the last money column filled in (sale, or cost in the cost-only sheet).
    ws.getCell(T.count, col(b, costOnly ? "cost" : "code")).value = {
      formula: `COUNT(${range(costOnly ? "cost" : "sale")})`,
      result: blockKept.length,
    };
  }

  // The week on the right (full sheet only): this week's cost, then the totals row by row.
  if (!costOnly) {
    const across = (key: ColKey, y: number) => Array.from({ length: blocks }, (_, b) => ref(y, col(b, key))).join("+");
    ws.getColumn(S1).width = 14;
    ws.getColumn(S2).width = 13;
    const label = (y: number, text: string) => {
      const c = ws.getCell(y, S1);
      c.value = text;
      c.font = { bold: true };
      return c;
    };
    label(2, "អាទិត្យនេះ");
    ws.getCell(2, S2).value = { formula: across("cost", T.cost), result: sum("cost") };
    paint(ws.getCell(2, S1), COLOR.head);
    paint(ws.getCell(2, S2), COLOR.head);
    paint(label(3, "សរុប"), COLOR.yellow);
    ws.getCell(3, S2).value = { formula: ref(2, S2), result: sum("cost") };
    paint(ws.getCell(3, S2), COLOR.yellow);
    [2, 3].forEach((y) => {
      ws.getCell(y, S2).font = { bold: true };
    });

    ws.getCell(T.cost, S1).value = { formula: across("cost", T.cost), result: sum("cost") };
    ws.getCell(T.cost, S2).value = { formula: ref(3, S2), result: sum("cost") };
    ws.getCell(T.sale, S1).value = { formula: across("sale", T.sale), result: sum("sale") };
    ws.getCell(T.sale, S2).value = { formula: across("profit", T.sale), result: sum("sale") - sum("cost") };
    ws.getCell(T.count, S1).value = "Total Order";
    ws.getCell(T.count, S2).value = { formula: across("code", T.count), result: kept.length };
  }

  ws.getCell(T.cost, 1).value = "Total";
  if (!costOnly) ws.getCell(T.sale, 1).value = "Total sale";
  ws.getCell(T.count, 1).value = "Order";
  for (let c = 1; c <= END; c++) {
    paint(ws.getCell(T.cost, c), COLOR.total);
    ws.getCell(T.cost, c).font = { bold: true };
    if (costOnly) continue;
    paint(ws.getCell(T.sale, c), COLOR.sale);
    ws.getCell(T.sale, c).font = { bold: true };
  }
  setFonts(ws);
  return ws;
}

async function save(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SalesExportOptions {
  fileName: string; // "តារាងលក់ អាទិត្យទី 3 03-10 – 09-10-2026.xlsx"
  sheets: { name: string; title: string; rows: ExportRow[] }[]; // one tab per mart
  active?: number; // the tab to open on
  costOnly?: boolean; // order number and cost only
}

// A week's sales sheets, one tab per mart, orders in blocks of 30 side by side with totals.
export async function downloadSales(opts: SalesExportOptions) {
  const ExcelJS = await load();
  const wb = new ExcelJS.Workbook();
  opts.sheets.forEach((s) => addSheet(wb, s.name, s.title, s.rows, !!opts.costOnly));
  wb.views = [{ activeTab: Math.min(opts.active ?? 0, opts.sheets.length - 1) } as Workbook["views"][number]];
  await save(wb, opts.fileName);
}

// A formula cell: "{r}" stands for its own row; in the totals row "{first}" / "{last}" for the first / last data rows.
export interface FormulaCell {
  formula: string;
  result: number;
}
export type TableValue = string | number | null | FormulaCell;

export interface TableExportOptions {
  fileName: string;
  name: string; // the tab name
  title: string;
  // money: riel with thousands; usd: dollars with cents; usd0: whole dollars. Negative amounts show red.
  cols: { head: string; width: number; money?: boolean; usd?: boolean; usd0?: boolean }[];
  rows: TableValue[][];
  total: TableValue[];
}

const isFormula = (v: TableValue): v is FormulaCell => !!v && typeof v === "object" && "formula" in v;

// A plain table on one sheet: title, a row of column names, the rows and a totals row (the month-end sheet).
export async function downloadTable(opts: TableExportOptions) {
  const ExcelJS = await load();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.name, { views: [{ state: "frozen", ySplit: 2 }] });
  const n = opts.cols.length;
  const first = 3;
  const last = first + opts.rows.length - 1;
  const foot = last + 1;
  const fill = (v: TableValue, y: number) => (isFormula(v) ? { formula: v.formula.replace(/\{r\}/g, String(y)), result: v.result } : v);

  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = opts.title;
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  paint(t, COLOR.title);
  ws.getRow(1).height = 30;

  opts.cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const h = ws.getCell(2, i + 1);
    h.value = c.head;
    h.font = { bold: true };
    h.alignment = { horizontal: c.money || c.usd || c.usd0 ? "right" : "left" };
    paint(h, COLOR.head);
  });
  const shape = (cell: Cell, c: TableExportOptions["cols"][number]) => {
    if (c.usd) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    else if (c.usd0) cell.numFmt = '"$"#,##0;[Red]-"$"#,##0';
    else if (c.money) cell.numFmt = "#,##0;[Red]-#,##0";
  };
  opts.rows.forEach((row, k) =>
    row.forEach((v, i) => {
      const cell = ws.getCell(first + k, i + 1);
      cell.value = fill(v, first + k);
      shape(cell, opts.cols[i]);
    }),
  );
  opts.total.forEach((v, i) => {
    const cell = ws.getCell(foot, i + 1);
    cell.value = fill(
      isFormula(v) ? { ...v, formula: v.formula.replace(/\{first\}/g, String(first)).replace(/\{last\}/g, String(last)) } : v,
      foot,
    );
    shape(cell, opts.cols[i]);
  });
  for (let c = 1; c <= n; c++) {
    paint(ws.getCell(foot, c), COLOR.total);
    ws.getCell(foot, c).font = { bold: true };
  }
  setFonts(ws);
  await save(wb, opts.fileName);
}

// Shown when a file cannot be made.
export const EXPORT_ERROR = "មិនអាចបង្កើតឯកសារ Excel បានទេ · សាកម្តងទៀត។";
