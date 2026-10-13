import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));

import { getAuthorizationContext } from "@/lib/authorization";
import AdminPage from "@/app/(protected)/admin/page";

beforeEach(() => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
});

it("surfaces existing administration areas and their current destinations", async () => {
  const html = renderToStaticMarkup(await AdminPage());

  expect(html).toContain("Officer access");
  expect(html).toContain('href="/officers"');
  expect(html).toContain("Positions and branches");
  expect(html).toContain('href="/officers/catalogs"');
  expect(html).toContain("Points configuration and corrections");
  expect(html).toContain('href="/points"');
  expect(html).toContain("System log");
  expect(html).toContain('href="/system-log"');
  expect(html.match(/<a\b/g)).toHaveLength(4);
  expect(html).toContain('aria-label="Administration areas"');
  expect(html).toContain("focus-visible:outline-2");
  expect(html).toContain("hover:bg-hover");
});

it.each([
  ["Lead", { applicationRole: "officer", positionCode: "lead" }],
  ["Officer", { applicationRole: "officer", positionCode: "officer" }],
])("denies direct access to %s", async (_role, actor) => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    ...actor,
  } as never);

  await expect(AdminPage()).rejects.toThrow("Not found");
});
