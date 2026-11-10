import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceLinksList } from "@/components/resource-links-list";
import {
  eventResourceLinksInputSchema,
  taskResourceLinksInputSchema,
} from "@/lib/resource-links";

const signupLink = {
  id: 1,
  kind: "signup_sheet" as const,
  label: "Signup sheet",
  url: "https://example.org/signup",
  legacy_key: "signup_sheet" as const,
  sort_order: 0,
};

it("renders no resource section when there are no links", () => {
  expect(renderToStaticMarkup(<ResourceLinksList resources={[]} />)).toBe("");
});

it("renders labeled safe links and keeps the native roster boundary clear", () => {
  const html = renderToStaticMarkup(
    <ResourceLinksList
      resources={[
        signupLink,
        {
          id: 2,
          kind: "custom",
          label: "Team documentation",
          url: "https://example.org/guide",
        },
      ]}
    />,
  );
  expect(html).toContain('href="https://example.org/signup"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("Signup sheet");
  expect(html).toContain("Team documentation");
  expect(html).toContain(
    "Cappy Hub signups, capacity, and participation remain separate.",
  );
});

it("validates arbitrary custom labels and rejects unsafe URLs", () => {
  const value = JSON.stringify([
    {
      kind: "custom",
      label: "Guide for interviewers",
      url: "https://example.org/guide",
      legacy_key: null,
    },
  ]);
  expect(eventResourceLinksInputSchema.safeParse(value).success).toBe(true);
  expect(taskResourceLinksInputSchema.safeParse(value).success).toBe(true);
  expect(
    taskResourceLinksInputSchema.safeParse(
      JSON.stringify([{ ...signupLink, id: undefined, sort_order: undefined }]),
    ).success,
  ).toBe(false);
  expect(
    eventResourceLinksInputSchema.safeParse(
      value.replace("https://example.org/guide", "javascript:alert(1)"),
    ).success,
  ).toBe(false);
});

it("preserves all migrated Event link fields and rejects duplicate legacy rows", () => {
  const value = JSON.stringify([
    {
      kind: "slides",
      label: "Slides",
      url: "https://example.org/slides",
      legacy_key: "slides",
    },
    {
      kind: "meeting_notes",
      label: "Meeting notes",
      url: "https://example.org/notes",
      legacy_key: "meeting_notes",
    },
    signupLink,
  ]);
  const parsed = eventResourceLinksInputSchema.safeParse(value);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toHaveLength(3);

  const duplicates = JSON.parse(value) as Array<Record<string, unknown>>;
  duplicates.push({
    ...duplicates[0],
    url: "https://example.org/another-slides",
  });
  expect(
    eventResourceLinksInputSchema.safeParse(JSON.stringify(duplicates)).success,
  ).toBe(false);
});

it("allows long URLs on existing legacy Event links but caps new resources", () => {
  const longUrl = `https://example.org/${"x".repeat(2050)}`;
  const legacy = JSON.stringify([
    {
      kind: "slides",
      label: "Slides",
      url: longUrl,
      legacy_key: "slides",
    },
  ]);
  const custom = JSON.stringify([
    { kind: "custom", label: "Guide", url: longUrl, legacy_key: null },
  ]);

  expect(eventResourceLinksInputSchema.safeParse(legacy).success).toBe(true);
  expect(eventResourceLinksInputSchema.safeParse(custom).success).toBe(false);
  expect(taskResourceLinksInputSchema.safeParse(legacy).success).toBe(false);
});
