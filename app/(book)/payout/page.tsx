import type { Metadata } from "next";
import PayoutPage from "@/components/payout/PayoutPage";

export const metadata: Metadata = { title: "ទូទាត់ប្រចាំអាទិត្យ" };

export default function Page() {
  return <PayoutPage />;
}
