import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { mutationError } from "@/lib/mutation-error";

it("shows a generic load error and keeps the retry action", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorPage, { reset: () => {} }),
  );

  expect(html).toContain("<h1>Unable to load this page</h1>");
  expect(html).toContain("Try again");
  expect(html).not.toMatch(/supabase|configuration|connection/i);
});

it("uses record-wide not-found copy and keeps the Dashboard link", () => {
  const html = renderToStaticMarkup(createElement(NotFound));

  expect(html).toContain("<h1>Record not found</h1>");
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
