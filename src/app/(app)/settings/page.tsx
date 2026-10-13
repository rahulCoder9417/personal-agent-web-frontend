"use client";

import { PageBody } from "@/components/page";
import { LinkedChatsSection } from "@/components/settings/general-chats";
import { AccountSection, YourDataSection } from "@/components/settings/general-data";
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
        <ProfileSection key={me.data.id} me={me.data} />
      )}
      <LinkedChatsSection />
      <YourDataSection />
      <AccountSection email={me.data?.email} />
    </PageBody>
  );
}
