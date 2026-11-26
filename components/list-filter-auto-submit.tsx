"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Route } from "next";
import Form from "next/form";

/**
 * Client-side Next.js Form wrapper for ListFilterBar that renders the
 * <form role="search"> directly (no intermediate <div>) so all direct-child
 * CSS rules in globals.css (form[role="search"] > label, etc.) apply intact,
 * while auto-submitting whenever a <select> or date input changes.
 */
export function AutoSubmitFilterForm({
  action,
  label,
  className,
  children,
}: {
  action: Route;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Form
      action={action}
      role="search"
      aria-label={label}
      className={className}
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement && target.type === "date")
        ) {
          target.form?.requestSubmit();
        }
      }}
    >
      {children}
    </Form>
  );
}

export function FilterSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-11 lg:min-h-0"
    >
      {pending ? "Filtering…" : "Apply filters"}
    </button>
  );
}
