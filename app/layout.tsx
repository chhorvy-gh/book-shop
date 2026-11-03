import type { Metadata, Viewport } from "next";
import { Inter, Kantumruy_Pro } from "next/font/google";
import Gate from "@/components/Gate";
import { SaleBookProvider } from "@/components/store";
import "./mockup.css";
import "./app.css";

// Inter draws Latin letters and numbers; Khmer falls through to Kantumruy Pro (the mockup's two fonts).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const kantumruy = Kantumruy_Pro({ variable: "--font-kantumruy", subsets: ["khmer", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { template: "%s · សៀវភៅលក់", default: "សៀវភៅលក់" },
  description: "LL Sales Book: weekly sales sheets, profit by seller, payouts and month-end settlement.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km" className={`${inter.variable} ${kantumruy.variable}`}>
      <body>
        <SaleBookProvider>
          <Gate>{children}</Gate>
        </SaleBookProvider>
      </body>
    </html>
  );
}
