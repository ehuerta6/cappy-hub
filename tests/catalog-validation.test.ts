import { expect, it } from "vitest";
import { catalogMutationInputSchema } from "@/app/(protected)/officers/catalogs/validation";

it("models only valid catalog operation combinations", () => {
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "create",
      name: "Denver",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "position",
      operation: "rename",
      id: "4",
      name: "Lead",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "delete",
      id: "4",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "rename",
      id: "",
      name: "Denver",
    }).success,
  ).toBe(false);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "create",
      id: "4",
      name: "",
    }).success,
  ).toBe(false);
});
