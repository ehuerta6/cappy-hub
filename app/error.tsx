"use client";

import {
  RecoverySurface,
  recoveryActionClassName,
} from "@/components/recovery-surface";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RecoverySurface
      title="Unable to load this page"
      description="This page could not be loaded. If the problem continues, contact a Cappy Hub maintainer."
    >
      <button
        type="button"
        onClick={reset}
        className={`${recoveryActionClassName} mt-6`}
      >
        Try again
      </button>
    </RecoverySurface>
  );
}
