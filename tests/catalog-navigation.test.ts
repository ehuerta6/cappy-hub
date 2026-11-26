import { expect, it } from "vitest";
import {
  catalogUrl,
  selectedCatalogCategory,
} from "@/app/(protected)/officers/catalogs/navigation";

it("defaults to Positions and falls back safely for invalid categories", () => {
  expect(selectedCatalogCategory(undefined)).toBe("positions");
  expect(selectedCatalogCategory("unknown")).toBe("positions");
  expect(selectedCatalogCategory(["branches", "locations"])).toBe("positions");
  expect(selectedCatalogCategory("locations")).toBe("locations");
});

it("builds same-route category URLs without pagination parameters", () => {
  expect(catalogUrl("positions")).toBe("/officers/catalogs?category=positions");
  expect(catalogUrl("branches")).toBe("/officers/catalogs?category=branches");
  expect(catalogUrl("locations")).not.toContain("page=");
  expect(catalogUrl("task-types")).toBe(
    "/officers/catalogs?category=task-types",
  );
});

it("preserves Deleted status when switching categories", () => {
  expect(catalogUrl("types", "deleted")).toBe(
    "/officers/catalogs?category=types&status=deleted",
  );
});
