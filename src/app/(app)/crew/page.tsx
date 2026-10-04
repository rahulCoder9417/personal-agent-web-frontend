import type { Metadata } from "next";
import { CrewScreen } from "@/components/crew/crew-screen";

export const metadata: Metadata = { title: "Crew" };

export default function CrewPage() {
  return <CrewScreen />;
}
