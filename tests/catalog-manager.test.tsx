import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/officers/catalogs/actions", () => ({
  changeCatalog: vi.fn(),
}));

import CatalogManager from "@/app/(protected)/officers/catalogs/manager";

it("protects system Positions by machine identity and leaves deceptive custom labels editable", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogManager, {
      catalog: "position",
      title: "Positions",
      records: [
        { id: 1, name: "President display label", code: "president" },
        { id: 2, name: "President", code: null },
      ],
    }),
  );

  expect(html).toContain("President display label");
  expect(html).toContain("(required position)");
  expect(html).toContain('name="id" value="2"');
  expect(html).not.toContain('name="id" value="1"');
});

it.each([
  [
    "position",
    "Position",
    "Data Analyst",
    "A Position in use cannot be deleted.",
  ],
  [
    "branch",
    "Branch",
    "Systems",
    "Branches used by Officers, Events, or Tasks cannot be deleted.",
  ],
  [
    "event_location",
    "Event location",
    "Engineering Building",
    "Existing Events keep their recorded location.",
  ],
] as const)(
  "requires confirmation before deleting a %s and identifies its record",
  (catalog, catalogName, recordName, consequence) => {
    const html = renderToStaticMarkup(
      createElement(CatalogManager, {
        catalog,
        title: catalogName,
        records: [{ id: 8, name: recordName, code: null }],
      }),
    );

    expect(html).toContain(`<dialog`);
    expect(html).toContain(`Delete ${catalogName}?`);
    expect(html).toContain(recordName);
    expect(html).toContain(consequence);
    expect(html).toContain(`Delete ${catalogName}`);
    expect(html).toContain('name="operation" value="delete"');
    expect(html).toContain('name="id" value="8"');
    expect(html).toContain('<button type="button"');
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(`type="submit"`);
  },
);
