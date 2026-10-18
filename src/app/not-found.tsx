import { ErrorScreen } from "@/components/error-screen";

export default function NotFound() {
  return <ErrorScreen title="Page not found" message="That address doesn’t exist, or it has moved." />;
}
