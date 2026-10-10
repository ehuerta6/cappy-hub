"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="w-full flex-1">
      <h1>Unable to load this page</h1>
      <p>
        This page could not be loaded. If the problem continues, contact a Cappy
        Hub maintainer.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
