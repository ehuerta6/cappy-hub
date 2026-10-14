import { getCurrentOfficer } from "@/lib/current-officer";
import { redirect } from "next/navigation";
import GoogleSignIn from "./sign-in";
import { RecoverySurface } from "@/components/recovery-surface";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentOfficer()) redirect("/");
  const { error } = await searchParams;
  return (
    <RecoverySurface
      title="Cappy Hub"
      description="Coding Interview Club administration"
    >
      {error === "auth" && (
        <p role="alert" className="mt-4 break-words text-sm text-danger">
          Google sign-in could not be completed. Please try again.
        </p>
      )}
      <GoogleSignIn />
    </RecoverySurface>
  );
}
