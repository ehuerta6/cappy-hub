import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { RecoverySurface } from "@/components/recovery-surface";
import { mutationError } from "@/lib/mutation-error";

it("uses a shared, compact recovery surface with readable long text", () => {
  const html = renderToStaticMarkup(
    createElement(
      RecoverySurface,
      {
        title: "Access denied",
        description: "This account cannot access Cappy Hub.",
      },
      createElement("button", null, "Sign out and try another account"),
    ),
  );

  expect(html).toContain('aria-labelledby="recovery-title"');
  expect(html).toContain("max-w-sm");
  expect(html).toContain("break-words");
  expect(html).toContain("Sign out and try another account");
});

it("shows a generic load error and keeps the retry action", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorPage, { reset: () => {} }),
  );

  expect(html).toContain(">Unable to load this page</h1>");
  expect(html).toContain("Try again");
  expect(html).not.toMatch(/supabase|configuration|connection/i);
});

it("uses record-wide not-found copy and keeps the Dashboard link", () => {
  const html = renderToStaticMarkup(createElement(NotFound));

  expect(html).toContain(">Record not found</h1>");
  expect(html).toContain("record or page");
  expect(html).not.toMatch(/officer|event|task|point/i);
  expect(html).toContain('href="/"');
  expect(html).toContain("Back to dashboard");
});

it("does not show the obsolete upcoming-only Event edit message", () => {
  expect(mutationError("Only upcoming events can be edited")).toBe(
    "Could not save changes",
  );
  expect(mutationError("This event cannot be edited")).toBe(
    "This event cannot be edited",
  );
});

it("explains when an archived or cancelled Event cannot be newly linked", () => {
  expect(
    mutationError("Archived or cancelled Events cannot be newly linked"),
  ).toBe("Archived or cancelled Events cannot be newly linked");
});

it("explains why protected recurring Tasks must be deleted individually", () => {
  expect(
    mutationError("Completed or awarded Tasks must be deleted individually"),
  ).toBe("Completed or awarded Tasks must be deleted individually");
});

it("maps duplicate primary Event awards to a clear domain message", () => {
  expect(
    mutationError(
      'duplicate key value violates unique constraint "one_active_primary_event_award_per_officer"',
    ),
  ).toBe("This Officer already has an active award for this Event.");
  expect(
    mutationError("This Officer already has an active award for this Event."),
  ).toBe("This Officer already has an active award for this Event.");
});
