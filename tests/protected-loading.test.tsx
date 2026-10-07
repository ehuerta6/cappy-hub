import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Loading from "@/app/(protected)/loading";

it("announces protected page loading with a restrained, compact-width-safe region", () => {
  const html = renderToStaticMarkup(createElement(Loading));

  expect(html).toContain('<div aria-busy="true"');
  expect(html).not.toMatch(/<main\b/i);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('aria-atomic="true"');
  expect(html).toContain("Loading page…");
  expect(html).toContain("min-w-0");
  expect(html).toContain("max-w-full");
  expect(html).toContain("text-muted");
  expect(html).not.toMatch(/spinner|progress|animate-|skeleton/i);
});
