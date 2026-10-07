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
      eventTypes={[]}
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
