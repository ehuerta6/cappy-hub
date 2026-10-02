import * as zod from "zod";

export function safeIntegerStringSchema(errorMessage: string) {
  return zod
    .string()
    .trim()
    .min(1, errorMessage)
    .transform(Number)
    .refine(Number.isSafeInteger, errorMessage);
}

export function positiveSafeIntegerStringSchema(errorMessage: string) {
  return safeIntegerStringSchema(errorMessage).refine(
    (identifier) => identifier > 0,
    errorMessage,
  );
}

export function optionalPositiveSafeIntegerStringSchema(errorMessage: string) {
  return zod
    .string()
    .transform((identifier) => identifier.trim())
    .transform((identifier) => (identifier ? identifier : undefined))
    .pipe(
      zod.union([
        zod.undefined(),
        positiveSafeIntegerStringSchema(errorMessage),
      ]),
    );
}

export function optionalSafeIntegerStringSchema(errorMessage: string) {
  return zod
    .string()
    .transform((identifier) => identifier.trim())
    .transform((identifier) => (identifier ? identifier : undefined))
    .pipe(zod.union([zod.undefined(), safeIntegerStringSchema(errorMessage)]));
}

export function finiteNumberStringSchema(errorMessage: string) {
  return zod
    .string()
    .trim()
    .min(1, errorMessage)
    .transform(Number)
    .refine(Number.isFinite, errorMessage);
}

export function requiredTrimmedStringSchema(errorMessage: string) {
  return zod.string().refine((input) => input.trim().length > 0, errorMessage);
}
