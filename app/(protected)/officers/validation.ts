import * as zod from "zod";
import {
  optionalSafeIntegerStringSchema,
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";

const applicationRoleSchema = zod.enum(["admin", "officer"]);

export const saveOfficerInputSchema = zod
  .object({
    id: optionalSafeIntegerStringSchema("Officer not found"),
    name: requiredTrimmedStringSchema("Name is required"),
    utep_email: zod.string().transform((email) => email.trim()),
    personal_email: zod.string().transform((email) => email.trim()),
    position_id: safeIntegerStringSchema("Select a valid position"),
    classification: zod
      .union([
        zod.enum(["freshman", "sophomore", "junior", "senior", "graduate"], {
          error: "Select a valid classification",
        }),
        zod.literal(""),
      ])
      .transform((classification) => classification || undefined),
    status: zod.string(),
    branches: zod.array(safeIntegerStringSchema("Select valid branches")),
  })
  .superRefine((officerInput, context) => {
    if (!officerInput.utep_email && !officerInput.personal_email) {
      context.addIssue({
        code: "custom",
        path: ["utep_email"],
        message: "Provide at least one email",
      });
    }
    if (
      officerInput.id !== undefined &&
      !["active", "inactive"].includes(officerInput.status)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Select a valid officer status",
      });
    }
  });

export const applicationRoleChangeInputSchema = zod.object({
  officer_id: positiveSafeIntegerStringSchema("Invalid role assignment"),
  role: applicationRoleSchema,
});
