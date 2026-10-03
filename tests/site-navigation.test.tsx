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
  expect(html).not.toContain(">Admin</a>");
});

it("shows the Admin navigation item only to application admins", () => {
  const adminHtml = renderToStaticMarkup(
    <SiteNavigation isAdmin={true} account={<span>Admin</span>} />,
  );
  const officerHtml = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(adminHtml).toContain('href="/admin"');
  expect(adminHtml).toContain(">Admin</a>");
  expect(officerHtml).not.toContain('href="/admin"');
});
