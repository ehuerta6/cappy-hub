import Link from "next/link";
import {
  RecoverySurface,
  recoveryActionClassName,
} from "@/components/recovery-surface";

export default function NotFound() {
  return (
    <RecoverySurface
      title="Record not found"
      description="The requested record or page could not be found."
    >
      <Link href="/" className={`${recoveryActionClassName} mt-6`}>
        Back to dashboard
      </Link>
    </RecoverySurface>
  );
}
