import { beforeEach, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/database.types";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: vi.fn(),
}));

vi.mock("@/lib/current-officer", () => ({ requireCurrentOfficer: vi.fn() }));
vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
  isLead: () => false,
  canSeeAllBranches: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/events",
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireCurrentOfficer } from "@/lib/current-officer";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import EventsPage from "@/app/(protected)/events/page";
import DashboardPage from "@/app/(protected)/page";
import ProtectedLayout from "@/app/(protected)/layout";
import { SelfSignupForm } from "@/app/(protected)/events/event-controls";

const actor = {
  id: 8,
  name: "Local Officer",
  positionName: "Secretary",
  applicationRole: "officer",
};
const upcoming: Pick<
  Tables<"events">,
  | "id"
  | "name"
  | "event_date"
  | "starts_at"
  | "ends_at"
  | "status"
  | "deleted_at"
  | "participation_points_per_hour_at_end"
> & {
  event_types: { name: string };
  event_branches: { branches: { name: string } }[];
  event_officers: { officer_id: number }[];
} = {
  id: 1,
  name: "Participating event",
  event_date: "2099-01-01",
  starts_at: "2099-01-01T12:00:00Z",
  ends_at: "2099-01-01T13:00:00Z",
  status: "upcoming",
  deleted_at: null,
  participation_points_per_hour_at_end: null,
  event_types: { name: "Meeting" },
  event_branches: [],
  event_officers: [{ officer_id: 8 }],
};
let events: (typeof upcoming)[];
const from = vi.fn((table: string) => {
  const result = {
    data:
      table === "events"
        ? events
        : table === "point_transactions"
          ? []
          : table === "officer_point_totals"
            ? { total_points: 12.5 }
            : { half_year_points: 99 },
    error: null,
  };
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    is: () => query,
    not: () => query,
    gt: () => query,
    order: () => query,
    limit: () => query,
    single: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return query;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  events = [
    upcoming,
    { ...upcoming, id: 2, name: "Available event", event_officers: [] },
  ];
  vi.mocked(requireCurrentOfficer).mockResolvedValue(actor as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue(actor as never);
  vi.mocked(createClient).mockResolvedValue({ from } as never);
});
const renderEvents = async () =>
  renderToStaticMarkup(await EventsPage({ searchParams: Promise.resolve({}) }));

it("groups relationships into distinct sections from one event query", async () => {
  const html = await renderEvents();
  const your = html.split('aria-label="Your events"')[1].split("</section>")[0];
  const other = html
    .split('aria-label="Other events"')[1]
    .split("</section>")[0];
  expect(your).toContain("Participating event");
  expect(your).not.toContain("Available event");
  expect(other).toContain("Available event");
  expect(other).not.toContain("Participating event");
  expect(html).not.toMatch(/Your participation|Your signup/i);
  expect(other).toContain('aria-label="Sign up for Available event"');
  expect(your).not.toContain("Sign up for");
  expect(from.mock.calls.filter(([table]) => table === "events")).toHaveLength(
    1,
  );
});

it("offers signup while happening, but never for past, cancelled, removed or processed events", async () => {
  events = [
    {
      ...upcoming,
      name: "Happening",
      starts_at: "2000-01-01T12:00:00Z",
      event_officers: [],
    },
    {
      ...upcoming,
      name: "Past",
      ends_at: "2000-01-01T13:00:00Z",
      event_officers: [],
    },
    { ...upcoming, name: "Cancelled", status: "cancelled", event_officers: [] },
    {
      ...upcoming,
      name: "Removed",
      deleted_at: "2000-01-01",
      event_officers: [],
    },
    {
      ...upcoming,
      name: "Processed",
      participation_points_per_hour_at_end: 0,
      event_officers: [],
    },
  ];
  const html = await renderEvents();
  expect(html).toContain('aria-label="Sign up for Happening"');
  for (const name of ["Past", "Cancelled", "Removed", "Processed"])
    expect(html).not.toContain(`aria-label="Sign up for ${name}"`);
});

it("shows useful empty messages without empty tables", async () => {
  events = [];
  const html = await renderEvents();
  expect(html).toContain("You are not signed up for any events.");
  expect(html).toContain("No other events available.");
  expect(html).not.toContain("<table");
});

it("shows personal name, position, database total and profile link separately from club points", async () => {
  const html = renderToStaticMarkup(await DashboardPage());
  const profile = html
    .split('aria-label="Your profile"')[1]
    .split("</section>")[0];
  expect(profile).toContain("Local Officer");
  expect(profile).toContain("Secretary");
  expect(profile).toContain("+12.5");
  expect(profile).toContain('href="/officers/8"');
  expect(profile).toContain("View profile");
  expect(html).toContain("Points this half-year");
  expect(html).toContain("+99");
});

it("places the single sign out form and officer context inside the protected header", async () => {
  const html = renderToStaticMarkup(
    await ProtectedLayout({
      children: "Page content",
      params: Promise.resolve({}),
    }),
  );
  const header = html.split("</header>")[0];
  expect(header).not.toContain("Back to");
  expect(header).toContain("Local Officer");
  expect(header).toContain("Sign out");
  expect(html.match(/Sign out/g)).toHaveLength(1);
  expect(html.split("</header>")[1].split("<script>")[0]).toBe("Page content");
  expect(header).toContain('aria-current="page"');
  expect(header).not.toContain(">Admin</a>");
  vi.mocked(requireCurrentOfficer).mockResolvedValue({
    ...actor,
    applicationRole: "admin",
  } as never);
  expect(
    renderToStaticMarkup(
      await ProtectedLayout({ children: "", params: Promise.resolve({}) }),
    ),
  ).toContain('href="/admin"');
});

it("renders a real accessible self-signup form with only the event ID", () => {
  const html = renderToStaticMarkup(
    createElement(SelfSignupForm, { eventId: 2, eventName: "Available event" }),
  );
  expect(html).toContain('name="event_id" value="2"');
  expect(html).toContain("<button");
  expect(html).not.toContain('name="officer_id"');
});

it("disables the row button while signup is pending and exposes accessible result text", () => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    true,
  ] as never);
  const pending = renderToStaticMarkup(
    createElement(SelfSignupForm, { eventId: 2, eventName: "Available event" }),
  );
  expect(pending).toContain("disabled");
  expect(pending).toContain("Signing up…");
  vi.mocked(useActionState).mockReturnValue([
    { error: "Signups are closed for this event", success: "" },
    vi.fn(),
    false,
  ] as never);
  expect(
    renderToStaticMarkup(
      createElement(SelfSignupForm, {
        eventId: 2,
        eventName: "Available event",
      }),
    ),
  ).toContain('role="alert"');
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "Officer added" },
    vi.fn(),
    false,
  ] as never);
  expect(
    renderToStaticMarkup(
      createElement(SelfSignupForm, {
        eventId: 2,
        eventName: "Available event",
      }),
    ),
  ).toContain('role="status"');
});

it("keeps main pages free of contextual navigation and shows the compact upcoming schedule", async () => {
  expect(await renderEvents()).not.toContain("Back to");
  const html = renderToStaticMarkup(await DashboardPage());
  expect(html).not.toContain("Back to");
  expect(html).toContain("Jan 1 · 5:00–6:00 AM");
});
