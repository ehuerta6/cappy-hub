import { getCurrentOfficer } from "@/lib/current-officer";
import { redirect } from "next/navigation";
import GoogleSignIn from "./sign-in";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentOfficer()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="w-full flex-1">
      <section className="mx-auto max-w-sm rounded-lg border border-border bg-surface/40 p-6">
        <h1 className="text-xl font-semibold">Cappy Hub</h1>
        <p className="mt-2 text-sm text-muted">
          Coding Interview Club administration
        </p>
        {error === "auth" && (
          <p role="alert" className="mt-4 text-sm text-danger">
            Google sign-in could not be completed. Please try again.
          </p>
        )}
        <GoogleSignIn />
      </section>
    </main>
  );
}
