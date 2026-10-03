import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/calendar" }));

import SiteNavigation from "@/components/site-navigation";

it("shows Calendar in the protected navigation and marks it active", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toMatch(/aria-current="page"[^>]*href="\/calendar"/);
  expect(html).toContain(">Calendar</a>");
  expect(html).not.toContain("System Log");
});
