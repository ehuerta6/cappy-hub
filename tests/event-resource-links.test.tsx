import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventResourceLinks from "@/app/(protected)/events/event-resource-links";

const renderLinks = (values: {
  slidesUrl?: string | null;
  meetingNotesUrl?: string | null;
  signupSheetUrl?: string | null;
}) =>
  renderToStaticMarkup(
    <EventResourceLinks
      slidesUrl={values.slidesUrl ?? null}
      meetingNotesUrl={values.meetingNotesUrl ?? null}
      signupSheetUrl={values.signupSheetUrl ?? null}
    />,
  );

it("renders no links section when no Event resources are present", () => {
  expect(renderLinks({})).toBe("");
});

it("renders signup sheet only when present and preserves existing resource links", () => {
  const signupOnly = renderLinks({
    signupSheetUrl: "https://example.org/signup",
  });
  expect(signupOnly).toContain("Open external roster / signup sheet");
  expect(signupOnly).toContain('href="https://example.org/signup"');
  expect(signupOnly).toContain(
    "External Google Sheet resource. Cappy Hub signups, capacity, waitlist, and participation are managed separately.",
  );
  expect(signupOnly).not.toContain("Open slides");
  expect(signupOnly).not.toContain("Open notes");

  const all = renderLinks({
    slidesUrl: "https://example.org/slides",
    meetingNotesUrl: "https://example.org/notes",
    signupSheetUrl: "https://example.org/signup",
  });
  expect(all).toContain("Open slides");
  expect(all).toContain("Open notes");
  expect(all).toContain("Open external roster / signup sheet");
});
