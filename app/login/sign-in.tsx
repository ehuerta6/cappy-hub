"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { recoveryActionClassName } from "@/components/recovery-surface";

const LOCAL_PASSWORD = "CappyLocal123!";
const LOCAL_ACCOUNTS = [
  { label: "Admin", email: "admin@cappy.test" },
  { label: "President", email: "president@cappy.test" },
  { label: "VP Operations", email: "vp-operations@cappy.test" },
  { label: "VP Academics", email: "vp-academics@cappy.test" },
  { label: "Intro Lead", email: "intro-lead@cappy.test" },
  { label: "ICPC Lead", email: "icpc-lead@cappy.test" },
  { label: "Social Lead", email: "social-lead@cappy.test" },
  { label: "Outreach Lead", email: "outreach-lead@cappy.test" },
  { label: "Multi Branch Lead", email: "multi-lead@cappy.test" },
  { label: "Secretary", email: "secretary@cappy.test" },
  { label: "Officer", email: "officer@cappy.test" },
  { label: "Inactive Officer", email: "inactive@cappy.test" },
] as const;

export default function GoogleSignIn() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isLocal =
    supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");

  async function signInWithGoogle() {
    setBusy("google");
    setError("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("Google sign-in could not start. Please try again.");
      setBusy("");
    }
  }

  async function signInLocally(email: string) {
    setBusy(email);
    setError("");

    const { error } = await createClient().auth.signInWithPassword({
      email,
      password: LOCAL_PASSWORD,
    });

    if (error) {
      setError("Local sign-in could not be completed. Please try again.");
      setBusy("");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-6">
      {isLocal ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Local development accounts</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCAL_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => signInLocally(account.email)}
                className="inline-flex min-h-11 items-center justify-center break-words rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-center text-sm font-medium text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === account.email ? "Signing in..." : account.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={signInWithGoogle}
          className={`${recoveryActionClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {busy === "google" ? "Signing in..." : "Continue with Google"}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 break-words text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
