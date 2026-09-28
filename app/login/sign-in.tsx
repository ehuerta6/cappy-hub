"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function GoogleSignIn() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("Google sign-in could not start. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={signIn}
        className="rounded border border-zinc-500 px-4 py-2 text-sm disabled:opacity-50"
      >
        Continue with Google
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
