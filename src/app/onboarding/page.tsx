"use client";

import { Suspense } from "react";
import { OnboardingFlow } from "@/components/onboarding/flow";

export default function OnboardingPage() {
  return (
    // The flow reads ?channel= and ?step= from the URL.
    <Suspense fallback={null}>
      <OnboardingFlow />
    </Suspense>
  );
}
