import { redirect } from "next/navigation";

/** The backend's messages point people at /settings/ai; the screen lives at Agent & AI. */
export default function SettingsAiPage() {
  redirect("/settings/agent");
}
