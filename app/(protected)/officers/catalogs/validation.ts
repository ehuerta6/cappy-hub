import * as zod from "zod";
import {
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
} from "@/lib/validation";

const catalogNameSchema = zod.enum(
  ["position", "branch", "event_type", "task_type"],
  {
    error: "Invalid catalog operation",
  },
);
const catalogColorSchema = zod.string().regex(/^#[0-9A-Fa-f]{6}$/, {
  message: "Enter a 6-digit HEX color",
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
      color: catalogColorSchema.optional(),
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
      operation: zod.literal("color"),
      id: positiveSafeIntegerStringSchema("Invalid catalog record"),
      color: catalogColorSchema,
    }),
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.literal("delete"),
      id: positiveSafeIntegerStringSchema("Invalid catalog record"),
    }),
    zod.object({
      catalog: catalogNameSchema,
      operation: zod.enum(["retire", "reactivate", "restore"]),
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
      operation: zod.enum(["delete", "restore"]),
      id: positiveSafeIntegerStringSchema("Invalid location"),
    }),
  ],
  { error: "Invalid location operation" },
);
