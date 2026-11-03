import type { Metadata } from "next";
import SettlementPage from "@/components/settlement/SettlementPage";

export const metadata: Metadata = { title: "ទូទាត់ចុងខែ" };

export default function Page() {
  return <SettlementPage />;
}
