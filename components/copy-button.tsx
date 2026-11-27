"use client";

import { useState } from "react";
import { Check, Copy, Link2, Mail } from "lucide-react";
import { emitToast } from "@/components/toast-region";

export function CopyTextButton({
  value,
  label,
  toastMessage = "Copied to clipboard",
}: {
  value: string;
  label: string;
  toastMessage?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      emitToast(toastMessage, "success");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      emitToast("Could not copy to clipboard", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={label}
      title={label}
      className="!min-h-6 !size-6 shrink-0 inline-flex items-center justify-center !rounded !border-0 !bg-transparent !p-0 text-subtle hover:!bg-hover hover:!text-foreground"
    >
      {copied ? (
        <Check aria-hidden="true" size={12} className="text-success" />
      ) : (
        <Copy aria-hidden="true" size={12} />
      )}
    </button>
  );
}

export function CopyCanonicalLinkButton({
  path,
  label = "Copy link",
}: {
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const url =
        typeof window !== "undefined"
          ? new URL(path, window.location.origin).toString()
          : path;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      emitToast("Link copied", "success");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      emitToast("Could not copy link", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={label}
      className="button-secondary inline-flex min-h-11 items-center gap-1.5 px-3 py-2 text-sm font-medium lg:min-h-0"
    >
      {copied ? (
        <Check aria-hidden="true" size={14} className="text-success" />
      ) : (
        <Link2 aria-hidden="true" size={14} />
      )}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

export function CopyEmailsButton({
  emails,
  label = "Copy UTEP emails",
}: {
  emails: readonly string[];
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const uniqueEmails = Array.from(
    new Set(emails.map((email) => email.trim()).filter(Boolean)),
  );
  if (uniqueEmails.length === 0) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(uniqueEmails.join(", "));
      setCopied(true);
      emitToast(
        `Copied ${uniqueEmails.length} UTEP ${uniqueEmails.length === 1 ? "email" : "emails"}`,
        "success",
      );
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      emitToast("Could not copy emails", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`${label} (${uniqueEmails.length})`}
      className="button-secondary inline-flex min-h-11 items-center gap-1.5 px-3 py-2 text-sm font-medium lg:min-h-0"
    >
      {copied ? (
        <Check aria-hidden="true" size={14} className="text-success" />
      ) : (
        <Mail aria-hidden="true" size={14} />
      )}
      <span>{copied ? "Copied" : `${label} (${uniqueEmails.length})`}</span>
    </button>
  );
}
