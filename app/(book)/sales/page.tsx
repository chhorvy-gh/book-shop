import type { Metadata } from "next";
import { Suspense } from "react";
import SalesPage from "@/components/sales/SalesPage";

export const metadata: Metadata = { title: "តារាងលក់" };

export default function Page() {
  // The page reads ?cost=&sale= sent from the quick calculator, which needs a Suspense boundary.
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
