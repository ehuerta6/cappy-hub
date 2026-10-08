import * as zod from "zod";
import {
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
} from "@/lib/validation";

const catalogNameSchema = zod.enum(["position", "branch"], {
  error: "Invalid catalog operation",
});

export const catalogMutationInputSchema = zod.discriminatedUnion(
  "operation",
  [
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.literal("create"),
      name: requiredTrimmedStringSchema("Name is required").transform((name) =>
        name.trim(),
      ),
    }),
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.literal("rename"),
      id: positiveSafeIntegerStringSchema("Invalid catalog record"),
      name: requiredTrimmedStringSchema("Name is required").transform((name) =>
        name.trim(),
      ),
    }),
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.literal("delete"),
      id: positiveSafeIntegerStringSchema("Invalid catalog record"),
    }),
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.enum(["retire", "reactivate"]),
      id: positiveSafeIntegerStringSchema("Invalid catalog record"),
    }),
  ],
  { error: "Invalid catalog operation" },
);

export const eventLocationMutationInputSchema = zod.discriminatedUnion(
  "operation",
  [
    zod.object({
      operation: zod.literal("create"),
      name: requiredTrimmedStringSchema("Location is required").trim(),
    }),
    zod.object({
      operation: zod.literal("rename"),
      id: positiveSafeIntegerStringSchema("Invalid location"),
      name: requiredTrimmedStringSchema("Location is required").trim(),
    }),
    zod.object({
      operation: zod.literal("delete"),
      id: positiveSafeIntegerStringSchema("Invalid location"),
    }),
  ],
  { error: "Invalid location operation" },
);
