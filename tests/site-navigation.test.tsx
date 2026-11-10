import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/authorization", () => ({ getAuthorizationContext: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathState.current,
  useSearchParams: () => new URLSearchParams(pathState.search),
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}));

const { pathState } = vi.hoisted(() => ({
  pathState: { current: "/calendar", search: "" },
}));

import SiteNavigation from "@/components/site-navigation";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";

beforeEach(() => {
  pathState.current = "/calendar";
  pathState.search = "";
});

it("includes the selected URL context in write forms", () => {
  pathState.search = "";
  expect(renderToStaticMarkup(<AcademicPeriodWriteContextField />)).toContain(
    'name="writable_period" value="current"',
  );

  pathState.search = "period=524";
  expect(renderToStaticMarkup(<AcademicPeriodWriteContextField />)).toContain(
    'name="writable_period" value="524"',
  );

  pathState.search = "period=none";
  expect(renderToStaticMarkup(<AcademicPeriodWriteContextField />)).toContain(
    'name="writable_period" value="none"',
  );
});

it("renders the CIC mark decoratively inside the Cappy Hub home link", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toMatch(
    /<a[^>]*href="\/"[^>]*><img[^>]*alt=""[^>]*aria-hidden="true"[^>]*favicon\.ico[^>]*\/><span[^>]*>Cappy Hub<\/span><\/a>/,
  );
  expect(
    html.match(
      /<a[^>]*href="\/"[^>]*><img[^>]*alt=""[^>]*aria-hidden="true"[^>]*favicon\.ico[^>]*\/><span[^>]*>Cappy Hub<\/span><\/a>/g,
    ),
  ).toHaveLength(1);
  expect(html).toContain('aria-label="Switch to light theme"');
  expect(html).toContain(">Officer</span>");
  expect(html).toContain('aria-label="Main navigation"');
});

it("shows Calendar in the protected navigation and marks it active", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toMatch(/aria-current="page"[^>]*href="\/calendar"/);
  expect(html).toContain(">Calendar</a>");
  expect(html).toMatch(/aria-current="page"[^>]*href="\/calendar"/);
  expect(html).toContain('aria-label="Notifications"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Recent notifications");
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

it("renders the notification preview behind an accessible disclosure button", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation
      isAdmin={false}
      account={<span>Officer</span>}
      unreadNotificationCount={2}
    />,
  );
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-controls="notification-preview"');
  expect(html).toContain('aria-label="Notifications, 2 unread"');
  expect(html).not.toContain("<details");
});

it("keeps an overflowing unread count compact and accessible", () => {
  const html = renderToStaticMarkup(
    <SiteNavigation
      isAdmin={false}
      account={<span>Officer</span>}
      unreadNotificationCount={100}
    />,
  );

  expect(html).toContain('aria-label="Notifications, 100 unread"');
  expect(html).toContain(">99+</span>");
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

it.each(["lead", "officer"])("omits Admin navigation for %s", (role) => {
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>{role}</span>} />,
  );

  expect(html).not.toContain('href="/admin"');
});

it("does not expose a System Log destination in the authenticated shell", () => {
  pathState.current = "/calendar";
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={true} account={<span>Admin</span>} />,
  );

  expect(html).not.toContain('href="/system-log"');
  expect(html).not.toContain("System Log");
});

it("keeps nested records active under their primary navigation section", () => {
  pathState.current = "/officers/42/edit";
  const html = renderToStaticMarkup(
    <SiteNavigation isAdmin={false} account={<span>Officer</span>} />,
  );

  expect(html).toMatch(/aria-current="page"[^>]*href="\/officers"/);
  pathState.current = "/calendar";
});
