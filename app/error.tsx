"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <h1>Unable to load this page</h1>
      <p>Check your Supabase configuration and connection.</p>
      <button onClick={reset}>Try again</button>
    </>
  );
}
