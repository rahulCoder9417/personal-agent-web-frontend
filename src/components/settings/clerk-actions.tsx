"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui";

// These use Clerk's hooks, so they may only be rendered when ClerkProvider is in the tree
// (that is, never in demo mode).

export function ClerkSignOutButton() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (caught) {
      toastError("Couldn’t sign you out", caught);
      setPending(false);
    }
  };

  return (
    <Button pending={pending} onClick={() => void run()}>
      Sign out
    </Button>
  );
}

/** The last step of deleting the account. Clerk removes the user; the backend clears the data when it hears about it. */
export function ClerkDeleteAccountButton({ confirmed }: { confirmed: boolean }) {
  const { user, isLoaded } = useUser();
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (!user) return;
    setPending(true);
    try {
      await user.delete();
      // A full page load on purpose: the session is gone, so nothing cached should survive.
      window.location.replace(`${window.location.origin}/sign-in`);
    } catch (caught) {
      toastError("Couldn’t delete your account", caught);
      setPending(false);
    }
  };

  return (
    <Button
      variant="primary"
      className="border-danger bg-danger hover:bg-danger"
      disabled={!confirmed || !isLoaded || !user}
      pending={pending}
      onClick={() => void run()}
    >
      Delete forever
    </Button>
  );
}
