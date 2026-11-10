import * as zod from "zod";

export const resourceLinkKinds = [
  "slides",
  "meeting_notes",
  "signup_sheet",
  "documentation",
  "custom",
] as const;

export type ResourceLinkKind = (typeof resourceLinkKinds)[number];

export type ResourceLinkDraft = {
  kind: ResourceLinkKind;
  label: string;
  url: string;
  legacy_key: "slides" | "meeting_notes" | "signup_sheet" | null;
};

export function resourceLinkLabel(kind: ResourceLinkKind) {
  switch (kind) {
    case "slides":
      return "Slides";
    case "meeting_notes":
      return "Meeting notes";
    case "signup_sheet":
      return "Signup sheet";
    case "documentation":
      return "Documentation";
    case "custom":
      return "";
  }
}

const resourceLinkSchema = zod
  .object({
    kind: zod.enum(resourceLinkKinds),
    label: zod.string().trim().min(1, "Enter a link label").max(80),
    url: zod
      .string()
      .trim()
      .min(1, "Enter a link URL")
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            Boolean(url.hostname)
          );
        } catch {
          return false;
        }
      }, "Enter a valid HTTP or HTTPS URL"),
    legacy_key: zod
      .enum(["slides", "meeting_notes", "signup_sheet"])
      .nullable()
      .default(null),
  })
  .transform((resource) => ({
    ...resource,
    label:
      resource.kind === "custom"
        ? resource.label.trim()
        : resourceLinkLabel(resource.kind),
  }));

const resourceLinksArraySchema = zod
  .array(resourceLinkSchema)
  .superRefine((rows, context) => {
    const legacyKeys = new Set<string>();
    rows.forEach((row, index) => {
      if (!row.legacy_key && row.url.length > 2048) {
        context.addIssue({
          code: "custom",
          path: [index, "url"],
          message: "New resource URLs must be 2048 characters or fewer",
        });
      }
      if (row.legacy_key && row.kind !== row.legacy_key) {
        context.addIssue({
          code: "custom",
          path: [index, "legacy_key"],
          message: "The existing Event link type cannot be changed",
        });
      }
      if (row.legacy_key && legacyKeys.has(row.legacy_key)) {
        context.addIssue({
          code: "custom",
          path: [index, "legacy_key"],
          message: "Keep one existing link for each legacy Event link type",
        });
      }
      if (row.legacy_key) legacyKeys.add(row.legacy_key);
    });
  });

function jsonInput(schema: typeof resourceLinksArraySchema) {
  return zod.preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }, schema);
}

export const resourceLinksInputSchema = jsonInput(resourceLinksArraySchema);
export const eventResourceLinksInputSchema = resourceLinksInputSchema.default(
  [],
);
export const taskResourceLinksInputSchema = jsonInput(
  resourceLinksArraySchema.superRefine((rows, context) => {
    rows.forEach((row, index) => {
      if (row.legacy_key) {
        context.addIssue({
          code: "custom",
          path: [index, "legacy_key"],
          message: "Task links cannot use Event legacy link fields",
        });
      }
    });
  }),
).default([]);

export type ResourceLinkView = ResourceLinkDraft & {
  id: number;
  sort_order: number;
};

const resourceLinkViewSchema = zod.object({
  id: zod.number().int(),
  kind: zod.enum(resourceLinkKinds),
  label: zod.string(),
  url: zod.string().url(),
  legacy_key: zod.enum(["slides", "meeting_notes", "signup_sheet"]).nullable(),
  sort_order: zod.number().int().nonnegative(),
});

export function parseResourceLinkViews(value: unknown): ResourceLinkView[] {
  return zod.array(resourceLinkViewSchema).parse(value);
}

export function resourceLinksForForm(
  links: readonly ResourceLinkView[],
): ResourceLinkDraft[] {
  return links.map(({ kind, label, url, legacy_key }) => ({
    kind,
    label,
    url,
    legacy_key,
  }));
}

export function readSubmittedResourceLinks(
  value: unknown,
): ResourceLinkDraft[] {
  if (typeof value !== "string") return [];
  const parsed = resourceLinksInputSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
