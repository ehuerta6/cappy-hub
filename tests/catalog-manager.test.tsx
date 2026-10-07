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
