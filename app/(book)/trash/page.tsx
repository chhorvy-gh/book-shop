import type { Metadata } from "next";
import TrashPage from "@/components/trash/TrashPage";

export const metadata: Metadata = { title: "បានលុបថ្មីៗ" };

export default function Page() {
  return <TrashPage />;
}
