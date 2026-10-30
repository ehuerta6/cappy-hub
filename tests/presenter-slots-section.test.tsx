import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PresenterSlotsSection, {
  type PresenterSlot,
} from "@/app/(protected)/events/presenter-slots-section";

const slot = (overrides: Partial<PresenterSlot>): PresenterSlot => ({
  id: 1,
  position: 1,
  officer_id: null,
  presentation_title: null,
  difficulty: null,
  resource_url: null,
  prep_notes: null,
  officers: null,
  ...overrides,
});

it("shows historical presentation records without active controls", () => {
  const html = renderToStaticMarkup(
    createElement(PresenterSlotsSection, {
      slots: [
        slot({
          id: 11,
          position: 2,
          officer_id: 8,
          officers: { id: 8, name: "Avery Chen" },
          presentation_title: "Two Sum",
          difficulty: "Medium",
          resource_url: "https://example.org/two-sum",
          prep_notes: "Use a hash map.",
        }),
        slot({ id: 12, position: 3 }),
      ],
    }),
  );

  expect(html).toContain('aria-label="Historical presentations"');
  expect(html).toContain("Presentation 2");
  expect(html).toContain("Avery Chen");
  expect(html).toContain("Two Sum");
  expect(html).toContain("Medium");
  expect(html).toContain('href="https://example.org/two-sum"');
  expect(html).toContain("Use a hash map.");
  expect(html).toContain("No assigned Officer");
  for (const activeControl of [
    "Volunteer",
    "Step down",
    "Assign presenter",
    "Move up",
    "Edit details",
    "Add presenter slot",
    "Easy",
    "Hard",
  ]) {
    expect(html).not.toContain(activeControl);
  }
});

it("omits an empty historical presentation section", () => {
  expect(
    renderToStaticMarkup(createElement(PresenterSlotsSection, { slots: [] })),
  ).toBe("");
});
