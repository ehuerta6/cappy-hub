import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(protected)/events/actions", () => ({
  saveEvent: vi.fn(),
}));

import EventForm from "@/app/(protected)/events/event-form";

const renderEventForm = (editing = false) =>
  renderToStaticMarkup(
    <EventForm
      branches={[]}
      eventTypes={
        [{ id: 9, name: "Session", available_for_new_events: true }] as never
      }
      locations={[]}
      event={
        editing
          ? ({
              id: 12,
              name: "CIC meeting",
              description: "Agenda",
              location: "Campus",
              event_type_id: 2,
              slides_url: null,
              meeting_notes_url: null,
              signup_sheet_url: "https://example.com/signup",
              event_date: "2026-10-12",
              starts_at: "2026-10-12T16:00:00.000Z",
              ends_at: "2026-10-12T17:00:00.000Z",
              recurrence_key: null,
            } as never)
          : undefined
      }
    />,
  );

it("uses operation-specific primary action wording for new and edited Events", () => {
  expect(renderEventForm()).toContain(">Create event</button>");
  expect(renderEventForm(true)).toContain(">Save event</button>");
});

it("clarifies the external sheet in create/edit forms and displays the saved URL", () => {
  const createHtml = renderEventForm();
  const html = renderEventForm(true);
  for (const formHtml of [createHtml, html]) {
    expect(formHtml).toContain("External roster / signup sheet URL (optional)");
    expect(formHtml).toContain(
      "External Google Sheet resource. Cappy Hub signups, capacity, waitlist, and participation are managed separately.",
    );
  }
  expect(html).toContain('<option value="9">Session</option>');
  expect(html).toContain('name="signup_sheet_url"');
  expect(html).toContain('value="https://example.com/signup"');
});
