import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(protected)/events/actions", () => ({
  bulkAddEventOfficers: vi.fn(),
  changeSignup: vi.fn(),
  selfSignup: vi.fn(),
  cancelEvent: vi.fn(),
  restoreEvent: vi.fn(),
  restoreEventArchive: vi.fn(),
  removeEvent: vi.fn(),
  leaveEventWaitlist: vi.fn(),
}));

import { BulkAddOfficersForm } from "@/app/(protected)/events/event-controls";

it("keeps bulk Event additions as a compact, grouped checkbox form", () => {
  const html = renderToStaticMarkup(
    <BulkAddOfficersForm
      eventId={17}
      officers={[
        { id: 2, name: "Alex Kim" },
        { id: 3, name: "Avery Chen" },
      ]}
    />,
  );

  expect(html).toContain('name="event_id" value="17"');
  expect(html).toContain("Select officers to add");
  expect(html).toContain("event-bulk-officer-list");
  expect(html).toContain('type="checkbox" name="officer_ids" value="2"');
  expect(html).toContain(">Add selected officers</button>");
  expect(html).not.toContain("<dialog");
});

it("keeps historical attendee and award wording in the past Event form", () => {
  const html = renderToStaticMarkup(
    <BulkAddOfficersForm
      eventId={18}
      past
      pointsPerOfficer={2.5}
      officers={[{ id: 4, name: "Casey Nguyen" }]}
    />,
  );

  expect(html).toContain("Select attendees");
  expect(html).toContain("Each new award: 2.5 points");
  expect(html).toContain(">Add attendees and award points</button>");
});
