import type { Metadata } from "next";
import PhoneEntry from "@/components/entry/PhoneEntry";

// Outside the (book) group: the phone page has no sidebar.
export const metadata: Metadata = { title: "បញ្ចូលការលក់ លើទូរស័ព្ទ" };

export default function Page() {
  return <PhoneEntry />;
}
