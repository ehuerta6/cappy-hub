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
          priority: "important",
          created_at: "2026-11-09T12:00:00Z",
          read_at: null,
        },
        {
          id: 42,
          title: "Signup confirmed",
          message: "You signed up.",
          priority: "confirmation",
          created_at: "2026-11-09T11:00:00Z",
          read_at: "2026-11-09T11:30:00Z",
        },
      ]}
    />,
  );

  expect(html).toContain('aria-label="Notification history"');
  expect(html).toContain("Event updated");
  expect(html).toContain("Unread");
  expect(html).toContain("Mark as read");
  expect(html).toContain("Mark as unread");
  expect(html).toContain('name="notification_id" value="41"');
  expect(html).toContain('name="notification_id" value="42"');
});
