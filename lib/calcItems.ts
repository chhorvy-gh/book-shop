// The quick calculator's item list and note on their way to the sales page. The totals travel in the link
// (?cost=&sale=); the items and the note, too long for a link, wait in this tab's session storage until the sales page
// takes them for the new order.
import type { Item } from "./types";

const KEY = "salebook.calc-items";

export function handItems(cost: number, items: Item[], note = "") {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ cost, items, note }));
  } catch {
    /* no storage: the order is added without its list */
  }
}

// The items and note left for the totals in the link, matched by their cost, so an old list never lands on other
// amounts.
export function takeItems(cost: number): { items: Item[]; note: string } {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!d || d.cost !== cost || !Array.isArray(d.items)) return { items: [], note: "" };
    const items = d.items.filter(
      (it: Item) => it && typeof it.name === "string" && typeof it.unit === "string" && typeof it.cost === "number" && typeof it.sale === "number" && (it.qty === "" || typeof it.qty === "number"),
    );
    return { items, note: typeof d.note === "string" ? d.note : "" };
  } catch {
    return { items: [], note: "" }; // no storage (or on the server)
  }
}

export function dropItems() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to drop */
  }
}
