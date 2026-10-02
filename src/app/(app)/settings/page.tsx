"use client";

import { PageBody } from "@/components/page";
import { LinkedChatsSection } from "@/components/settings/general-chats";
import { DeleteAccountSection, SessionSection, YourDataSection } from "@/components/settings/general-data";
import { ProfileSection } from "@/components/settings/general-profile";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useMe } from "@/lib/api/hooks";

export default function GeneralSettingsPage() {
  const me = useMe();

  return (
    <PageBody>
      <div className="grid items-start gap-x-7 gap-y-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {me.isPending ? (
            <Card>
              <SkeletonRows rows={3} />
            </Card>
          ) : me.isError ? (
            <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          ) : (
            <ProfileSection key={me.data.id} me={me.data} />
          )}
          <LinkedChatsSection />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <YourDataSection />
          {me.data && <SessionSection email={me.data.email} />}
          <DeleteAccountSection />
        </div>
      </div>
    </PageBody>
  );
}
