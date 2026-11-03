import type { Metadata } from "next";
import SellersPage from "@/components/sellers/SellersPage";

export const metadata: Metadata = { title: "ចំណេញតាមអ្នកលក់" };

export default function Page() {
  return <SellersPage />;
}
