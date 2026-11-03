import type { Metadata } from "next";
import Calculator from "@/components/calculator/Calculator";

export const metadata: Metadata = { title: "គណនារហ័ស" };

export default function Page() {
  return <Calculator />;
}
