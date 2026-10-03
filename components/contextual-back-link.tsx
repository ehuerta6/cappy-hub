import type { ReactNode } from "react";
import { safeReturnTo, returnLinkLabel } from "@/lib/return-context";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ContextualBackLink({
  href,
  children,
  returnTo,
}: {
  href: string;
  returnTo?: unknown;
  children: ReactNode;
}) {
  const destination = safeReturnTo(returnTo);
  return (
    <Link
      href={destination ?? href}
      className="inline-flex min-h-10 items-center gap-2 text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {destination ? returnLinkLabel(destination, children) : children}
    </Link>
  );
}
