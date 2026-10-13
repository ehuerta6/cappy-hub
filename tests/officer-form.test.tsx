import { beforeEach, expect, it, vi } from "vitest";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tables } from "@/lib/database.types";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: vi.fn(),
}));
vi.mock("@/app/(protected)/officers/actions", () => ({
  saveOfficer: vi.fn(),
}));

import OfficerForm from "@/app/(protected)/officers/new/officer-form";

const branches = [
  { id: 2, name: "Engineering" },
  { id: 3, name: "Mathematics" },
];
const positions = [
  { id: 4, name: "Officer" },
  { id: 5, name: "Retired custom position" },
];
const officer = {
  id: 602,
  name: "Alex Example",
  utep_email: "alex@example.edu",
  personal_email: "alex.personal@example.com",
  position_id: 5,
  classification: "senior",
  status: "inactive",
} as Tables<"officers">;

function renderForm({ editing = false }: { editing?: boolean } = {}) {
  return renderToStaticMarkup(
    createElement(OfficerForm, {
      branches,
      positions,
      ...(editing
        ? { officer, branchIds: [3], returnTo: "/officers?q=alex&page=2" }
        : {}),
    }),
  );
}

beforeEach(() => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
});

it("renders create fields with exact names and preserves the one-email rule", () => {
  const html = renderForm();

  expect(html).toMatch(/required=""[^>]*name="name"/);
  expect(html).toMatch(/type="email"[^>]*name="utep_email"/);
  expect(html).toMatch(/type="email"[^>]*name="personal_email"/);
  expect(html).toMatch(/name="position_id" required=""/);
  expect(html).toContain('name="classification"');
  expect(html).toContain('name="branches" value="2"');
  expect(html).toContain('name="branches" value="3"');
  expect(html).not.toContain('name="status"');
  expect(html).not.toContain('name="application_role"');
  expect(html).toContain("Provide at least one email address.");
  expect(html).toContain("Classification (optional)");
  expect(html).toContain("Branches (optional)");
});

it("keeps edit-only status, inactive catalog values, context, and submitted values", () => {
  vi.mocked(useActionState).mockReturnValue([
    {
      error: "Position is required",
      success: "",
      fieldErrors: { position_id: "Select a valid position" },
      values: {
        id: "602",
        name: "Alex Retained",
        utep_email: "alex.retained@example.edu",
        personal_email: "",
        position_id: "5",
        classification: "senior",
        status: "inactive",
        branches: ["3"],
      },
    },
    vi.fn(),
    false,
  ] as never);
  const html = renderForm({ editing: true });

  expect(html).toContain('name="id" value="602"');
  expect(html).toContain('name="returnTo" value="/officers?q=alex&amp;page=2"');
  expect(html).toContain('name="status"');
  expect(html).toContain('value="inactive" selected=""');
  expect(html).toContain(
    '<option value="5" selected="">Retired custom position</option>',
  );
  expect(html).toContain('value="Alex Retained"');
  expect(html).toContain('value="alex.retained@example.edu"');
  expect(html).toContain('name="personal_email" value=""');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain("Select a valid position");
  expect(html).toContain('checked="" value="3"');
  expect(html).toContain('name="branches" value="2"');
});
