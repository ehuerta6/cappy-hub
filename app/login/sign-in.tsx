"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const LOCAL_PASSWORD = "CappyLocal123!";
const LOCAL_ACCOUNTS = [
  { label: "Admin", email: "admin@cappy.test" },
  { label: "President", email: "president@cappy.test" },
  { label: "VP Operations", email: "vp-operations@cappy.test" },
  { label: "VP Academics", email: "vp-academics@cappy.test" },
  { label: "Intro Lead", email: "intro-lead@cappy.test" },
  { label: "ICPC Lead", email: "icpc-lead@cappy.test" },
  { label: "Officer", email: "officer@cappy.test" },
  { label: "Inactive Officer", email: "inactive@cappy.test" },
] as const;

export default function GoogleSignIn() {
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
      setError(`Local sign-in failed: ${error.message}`);
      setBusy("");
      return;
    }

    window.location.assign("/");
  }

  return (
    <div className="mt-6">
      {isLocal ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Local development accounts</p>
          <div className="flex flex-wrap gap-2">
            {LOCAL_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => signInLocally(account.email)}
                className="rounded border border-zinc-500 px-3 py-2 text-sm disabled:opacity-50"
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
          className="rounded border border-zinc-500 px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy === "google" ? "Signing in..." : "Continue with Google"}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
