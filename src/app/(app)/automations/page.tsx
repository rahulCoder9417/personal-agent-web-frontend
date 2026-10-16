"use client";

import { AutomationsList } from "@/components/automations/automation-list";
import { Page } from "@/components/page";

/**
 * Automations: every automation as a row (pull-request review included), what needs the person,
 * the drafts waiting to be saved, and templates to start from.
 */
export default function AutomationsPage() {
  return (
    <Page>
      <AutomationsList />
    </Page>
  );
}
