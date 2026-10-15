import type { Metadata } from "next";
import { HelpScreen } from "@/components/help/help-screen";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return <HelpScreen />;
}
