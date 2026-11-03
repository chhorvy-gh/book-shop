import type { Metadata } from "next";
import NotesPage from "@/components/notes/NotesPage";

export const metadata: Metadata = { title: "កំណត់ចំណាំ" };

export default function Page() {
  return <NotesPage />;
}
