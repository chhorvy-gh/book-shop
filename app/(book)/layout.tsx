import Shell from "@/components/Shell";

// Every page but the phone entry shares the sidebar.
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
