import * as zod from "zod";

// Next.js represents repeated query keys as arrays. Treat them as invalid
// values and let the page-specific schema fall back to its normal default.
export const searchParamStringSchema = zod.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  zod.string(),
);

// Database IDs may be negative in the synthetic local dataset.
export const optionalListIdSchema = searchParamStringSchema.transform(
  (value) => {
    const parsed = zod
      .string()
      .trim()
      .regex(/^-?\d+$/)
      .transform(Number)
      .refine((id) => Number.isSafeInteger(id) && id !== 0)
      .safeParse(value);
    return parsed.success ? parsed.data : undefined;
  },
);
