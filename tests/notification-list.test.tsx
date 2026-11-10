import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../app/(protected)/notifications/actions", () => ({
  openNotification: vi.fn(),
  setNotificationReadStatus: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import NotificationList from "../app/(protected)/notifications/notification-list";

it("offers a separate per-item status action without replacing the open action", () => {
  const html = renderToStaticMarkup(
    <NotificationList
      notifications={[
        {
          id: 41,
          title: "Event updated",
          message: "The location changed.",
          kind: "event.changed",
          entity_type: "event",
          priority: "important",
          created_at: "2026-11-09T12:00:00Z",
          read_at: null,
        },
        {
          id: 42,
          title: "Signup confirmed",
          message: "You signed up.",
          kind: "event.signup_confirmed",
          entity_type: "event",
          priority: "confirmation",
          created_at: "2026-11-09T11:00:00Z",
          read_at: "2026-11-09T11:30:00Z",
        },
        {
          id: 43,
          title: "Points updated",
          message: "2.00000 Points",
          kind: "point.changed",
          entity_type: "point",
          priority: "important",
          created_at: "2026-11-09T10:00:00Z",
          read_at: null,
        },
      ]}
    />,
  );

  expect(html).toContain('aria-label="Notification history"');
  expect(html).toContain("Event updated");
  expect(html).toContain("Unread");
  expect(html).toContain("Mark as read");
  expect(html).toContain("Mark as unread");
  expect(html).toContain('<time dateTime="2026-11-09T12:00:00Z">');
  expect(html).toContain("Event · Needs attention");
  expect(html).toContain("Points · Needs attention");
  expect(html).toContain("2 Points");
  expect(html).not.toContain("2.00000 Points");
  expect(html).toContain('name="notification_id" value="41"');
  expect(html).toContain('name="notification_id" value="42"');
});
