"use client";

import { useRouter } from "next/navigation";
import { toastError } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import type { Me } from "@/lib/api/client";
import { useUpdateOnboarding } from "@/lib/api/hooks";
import { welcomeLeft } from "@/lib/onboarding";
import { SettingRow, SettingsGroup } from "./settings-rows";

/**
 * The welcome tour and the "Getting started" checklist, which the account remembers: the tour can
 * be shown again (`onboardingCompleted: false`, then the tour opens), and a hidden checklist
 * brought back (`gettingStartedDismissed: false`). Both are shown at once and saved; a failed save
 * is a toast. Not shown on a backend that doesn't keep them.
 */
export function GettingStartedSection({ me }: { me: Me }) {
  const router = useRouter();
  const update = useUpdateOnboarding();
  if (me.onboardingCompletedAt === undefined || me.gettingStartedDismissedAt === undefined) return null;
  const hidden = me.gettingStartedDismissedAt !== null;

  const showTour = () => {
    welcomeLeft.clear();
    if (me.onboardingCompletedAt !== null) {
      update.mutate({ onboardingCompleted: false }, { onError: (error) => toastError("Couldn’t reset the welcome tour", error) });
    }
    router.push("/onboarding");
  };

  return (
    <SettingsGroup title="Getting started" description="What helped you set Tex up when you signed up.">
      <Card>
        <SettingRow label="Welcome tour" help="Meet the crew, then connect your AI, link Telegram and connect an app, one step at a time.">
          <div className="flex sm:justify-end">
            <Button onClick={showTour}>Show the welcome tour again</Button>
          </div>
        </SettingRow>
        <SettingRow
          label="Getting started checklist"
          help={
            hidden
              ? "Hidden. Bring it back to the sidebar and the empty chat."
              : "In the sidebar and the empty chat until your AI, an app and a first message are done; then it goes by itself."
          }
        >
          <div className="flex sm:justify-end">
            {hidden ? (
              <Button
                onClick={() =>
                  update.mutate({ gettingStartedDismissed: false }, { onError: (error) => toastError("Couldn’t bring the checklist back", error) })
                }
              >
                Show the checklist again
              </Button>
            ) : (
              <span className="text-[13px] text-muted">Not hidden</span>
            )}
          </div>
        </SettingRow>
      </Card>
    </SettingsGroup>
  );
}
