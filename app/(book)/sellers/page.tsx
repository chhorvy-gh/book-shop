import type { Metadata } from "next";
import SellersPage from "@/components/sellers/SellersPage";

export const metadata: Metadata = { title: "ចំណេញអ្នកលក់" };

export default function Page() {
  return <SellersPage />;
}
