// The quick calculator's item list on its way to the sales page. The totals travel in the link (?cost=&sale=); the
// items, too long for a link, wait in this tab's session storage until the sales page takes them for the new order.
import type { Item } from "./types";

const KEY = "salebook.calc-items";

export function handItems(cost: number, items: Item[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ cost, items }));
  } catch {
    /* no storage: the order is added without its list */
  }
}

// The items left for the totals in the link, matched by their cost, so an old list never lands on other amounts.
export function takeItems(cost: number): Item[] {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!d || d.cost !== cost || !Array.isArray(d.items)) return [];
    return d.items.filter(
      (it: Item) => it && typeof it.name === "string" && typeof it.unit === "string" && typeof it.cost === "number" && typeof it.sale === "number" && (it.qty === "" || typeof it.qty === "number"),
    );
  } catch {
    return []; // no storage (or on the server)
  }
}

export function dropItems() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to drop */
  }
}
