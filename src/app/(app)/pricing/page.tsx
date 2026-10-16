import type { Metadata } from "next";
import { PricingScreen } from "@/components/pricing/pricing-screen";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return <PricingScreen />;
}
