import type { Metadata } from "next";
import MonthlyPage from "@/components/monthly/MonthlyPage";

export const metadata: Metadata = { title: "សង្ខេបប្រចាំខែ" };

export default function Page() {
  return <MonthlyPage />;
}
