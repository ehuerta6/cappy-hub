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
    <section className="mx-auto max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <h1 className="text-xl font-semibold">Cappy Hub</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Coding Interview Club administration
      </p>
      {error === "auth" && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          Google sign-in could not be completed. Please try again.
        </p>
      )}
      <GoogleSignIn />
    </section>
  );
}
