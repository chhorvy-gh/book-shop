import type { Metadata } from "next";
import AccountPage from "@/components/account/AccountPage";

export const metadata: Metadata = { title: "គណនី" };

export default function Page() {
  return <AccountPage />;
}
