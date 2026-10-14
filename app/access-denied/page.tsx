import { signOut } from "@/app/auth/actions";
import {
  RecoverySurface,
  recoveryActionClassName,
} from "@/components/recovery-surface";

export default function AccessDeniedPage() {
  return (
    <RecoverySurface
      title="Access denied"
      description="This Google account does not have access to Cappy Hub."
    >
      <form action={signOut} className="mt-6">
        <button type="submit" className={recoveryActionClassName}>
          Sign out and try another account
        </button>
      </form>
    </RecoverySurface>
  );
}
