import type { Metadata } from "next";
import HistoryPage from "@/components/history/HistoryPage";

export const metadata: Metadata = { title: "ប្រវត្តិកែប្រែ" };

export default function Page() {
  return <HistoryPage />;
}
