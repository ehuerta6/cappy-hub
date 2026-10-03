import { signOut } from "@/app/auth/actions";

export default function AccessDeniedPage() {
  return (
    <section className="mx-auto max-w-sm rounded-lg border border-border bg-surface/40 p-6">
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="mt-3 text-sm text-secondary">
        This Google account does not have access to Cappy Hub.
      </p>
      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="rounded border border-border-strong px-4 py-2 text-sm"
        >
          Sign out and try another account
        </button>
      </form>
    </section>
  );
}
