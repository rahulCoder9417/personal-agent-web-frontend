"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Button, InlineError } from "@/components/ui";

// These use Clerk's hooks, so they may only be rendered when ClerkProvider is in the tree
// (that is, never in demo mode).

export function ClerkSignOutButton() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button pending={pending} onClick={() => void run()}>
        Sign out
      </Button>
      <InlineError error={error} />
    </div>
  );
}

/** The last step of deleting the account. Clerk removes the user; the backend clears the data when it hears about it. */
export function ClerkDeleteAccountButton({ confirmed }: { confirmed: boolean }) {
  const { user, isLoaded } = useUser();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    if (!user) return;
    setPending(true);
    setError(null);
    try {
      await user.delete();
      // A full page load on purpose: the session is gone, so nothing cached should survive.
      window.location.replace(`${window.location.origin}/sign-in`);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        variant="primary"
        className="border-danger bg-danger hover:bg-danger"
        disabled={!confirmed || !isLoaded || !user}
        pending={pending}
        onClick={() => void run()}
      >
        Delete forever
      </Button>
      <InlineError error={error} />
    </div>
  );
}
