"use client";

import { PageBody } from "@/components/page";
import { LinkedChatsSection } from "@/components/settings/general-chats";
import { AccountSection, YourDataSection } from "@/components/settings/general-data";
import { GettingStartedSection } from "@/components/settings/general-getting-started";
import { HelpSection } from "@/components/settings/general-help";
import { ProfileSection } from "@/components/settings/general-profile";
import { SETTINGS_COLUMN, SettingsGroup } from "@/components/settings/settings-rows";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useMe } from "@/lib/api/hooks";

/** Settings → General: one column of groups, from who you are to leaving. */
export default function GeneralSettingsPage() {
  const me = useMe();

  return (
    <PageBody className={SETTINGS_COLUMN}>
      {me.isPending ? (
        <SettingsGroup title="Profile">
          <Card>
            <SkeletonRows rows={3} />
          </Card>
        </SettingsGroup>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        // Starts again from the saved values once the time zone is first set (by the browser on a
        // first visit, moments after this opens), so the form doesn't offer to put UTC back.
        <ProfileSection key={`${me.data.id}-${me.data.timezoneSet}`} me={me.data} />
      )}
      <LinkedChatsSection />
      {me.data && <GettingStartedSection me={me.data} />}
      <HelpSection />
      <YourDataSection />
      <AccountSection email={me.data?.email} />
    </PageBody>
  );
}
