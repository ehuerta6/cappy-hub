import Image from "next/image";
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
      eyebrow="Officer Administration Portal"
      description="Coding Interview Club administration"
      icon="brand"
      headerMedia={
        <div className="inline-flex size-12 items-center justify-center rounded-xl border border-brand-border bg-brand-bg shadow-sm">
          <Image
            src="/favicon.ico"
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            className="size-7"
          />
        </div>
      }
    >
      {error === "auth" && (
        <p
          role="alert"
          className="feedback-message feedback-error mt-4 break-words text-sm"
        >
          Google sign-in could not be completed. Please try again.
        </p>
      )}
      <GoogleSignIn />
    </RecoverySurface>
  );
}
