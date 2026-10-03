import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { pathState } = vi.hoisted(() => ({
  pathState: { current: "/calendar" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.current,
}));

import SiteNavigation from "@/components/site-navigation";

it("shows Calendar in the protected navigation and marks it active", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toMatch(/aria-current="page"[^>]*href="\/calendar"/);
  expect(html).toContain(">Calendar</a>");
  expect(html).toContain(
    'aria-label="Main navigation, current section: Calendar"',
  );
  expect(html).toContain("<details");
  expect(html).toContain('aria-label="Main navigation"');
  for (const href of [
    "/",
    "/events",
    "/tasks",
    "/calendar",
    "/officers",
    "/points",
  ])
    expect(html).toContain(`href="${href}"`);
  expect(html).not.toContain(">Admin</a>");
  expect(html).toContain('aria-label="Switch to light theme"');
  expect(html).toContain(">Officer</span>");
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
  expect(adminHtml).not.toContain('href="/system-log"');
  expect(officerHtml).not.toContain('href="/admin"');
  expect(officerHtml).not.toContain('href="/system-log"');
});

it("marks Admin as the current section from its System Log workflow", () => {
  pathState.current = "/system-log";
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={true} account={<span>Admin</span>} />,
  );

  expect(html).toContain(
    'aria-label="Main navigation, current section: Admin"',
  );
  expect(html).toMatch(/aria-current="page"[^>]*href="\/admin"/);
  expect(html).not.toContain('href="/system-log"');
  pathState.current = "/calendar";
});

it("keeps nested records active under their primary navigation section", () => {
  pathState.current = "/officers/42/edit";
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toContain(
    'aria-label="Main navigation, current section: Officers"',
  );
  expect(html).toMatch(/aria-current="page"[^>]*href="\/officers"/);
  pathState.current = "/calendar";
});
