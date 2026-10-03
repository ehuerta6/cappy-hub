import { expect, it } from "vitest";
import { safeIntegerStringSchema } from "@/lib/validation";

it("accepts safe integer strings and rejects blank, malformed, and unsafe IDs", () => {
  const identifierSchema = safeIntegerStringSchema("Invalid identifier");
  expect(identifierSchema.parse("-12")).toBe(-12);
  expect(identifierSchema.parse(" 12 ")).toBe(12);
  expect(identifierSchema.safeParse("").success).toBe(false);
  expect(identifierSchema.safeParse("12x").success).toBe(false);
  expect(identifierSchema.safeParse("9007199254740992").success).toBe(false);
});
