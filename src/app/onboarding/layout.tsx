/** Setup runs full page, without the app's navigation. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col overflow-hidden bg-bg">{children}</div>;
}
