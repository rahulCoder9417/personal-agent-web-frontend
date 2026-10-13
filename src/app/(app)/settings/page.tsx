"use client";

import { COLUMN_ITEM, Columns, PageBody } from "@/components/page";
import { LinkedChatsSection } from "@/components/settings/general-chats";
import { DeleteAccountSection, SessionSection, YourDataSection } from "@/components/settings/general-data";
import { ProfileSection } from "@/components/settings/general-profile";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useMe } from "@/lib/api/hooks";

export default function GeneralSettingsPage() {
  const me = useMe();

  return (
    <PageBody>
      {/* One column on a phone, two on a laptop, three on a wide monitor: as many as fit. */}
      <Columns min={400}>
        <div className={COLUMN_ITEM}>
          {me.isPending ? (
            <Card>
              <SkeletonRows rows={3} />
            </Card>
          ) : me.isError ? (
            <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          ) : (
            // Starts again from the saved values once the time zone is first set (by the browser on a
            // first visit, moments after this opens), so the form doesn't offer to put UTC back.
            <ProfileSection key={`${me.data.id}-${me.data.timezoneSet}`} me={me.data} />
          )}
        </div>
        <div className={COLUMN_ITEM}>
          <LinkedChatsSection />
        </div>
        <div className={COLUMN_ITEM}>
          <YourDataSection />
        </div>
        {me.data && (
          <div className={COLUMN_ITEM}>
            <SessionSection email={me.data.email} />
          </div>
        )}
        <div className={COLUMN_ITEM}>
          <DeleteAccountSection />
        </div>
      </Columns>
    </PageBody>
  );
}
