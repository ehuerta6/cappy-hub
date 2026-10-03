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
});

it("denies direct access to non-admins", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "officer",
  } as never);

  await expect(AdminPage()).rejects.toThrow("Not found");
});
