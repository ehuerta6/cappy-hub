import { expect, it } from "vitest";
import {
  catalogUrl,
  selectedCatalogCategory,
  selectedCatalogPage,
} from "@/app/(protected)/officers/catalogs/navigation";

it("defaults to Positions and falls back safely for invalid categories", () => {
  expect(selectedCatalogCategory(undefined)).toBe("positions");
  expect(selectedCatalogCategory("unknown")).toBe("positions");
  expect(selectedCatalogCategory(["branches", "locations"])).toBe("positions");
  expect(selectedCatalogCategory("locations")).toBe("locations");
});

it("accepts only positive safe page numbers", () => {
  expect(selectedCatalogPage(undefined)).toBe(1);
  expect(selectedCatalogPage("0")).toBe(1);
  expect(selectedCatalogPage("-1")).toBe(1);
  expect(selectedCatalogPage("1.5")).toBe(1);
  expect(selectedCatalogPage("9007199254740992")).toBe(1);
  expect(selectedCatalogPage("4")).toBe(4);
});

it("builds same-route category URLs and drops pagination when changing category", () => {
  expect(catalogUrl("positions")).toBe("/officers/catalogs?category=positions");
  expect(catalogUrl("branches", 2)).toBe(
    "/officers/catalogs?category=branches&page=2",
  );
  expect(catalogUrl("locations")).not.toContain("page=");
});

it("keeps Deleted state when changing pages", () => {
  expect(catalogUrl("types", 2, "deleted")).toBe(
    "/officers/catalogs?category=types&status=deleted&page=2",
  );
});
