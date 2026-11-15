// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const { setNotificationReadStatus, markAllNotificationsRead, routerRefresh } =
  vi.hoisted(() => ({
    setNotificationReadStatus: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    routerRefresh: vi.fn(),
  }));
vi.mock("../app/(protected)/notifications/actions", () => ({
  openNotification: vi.fn(),
  markAllNotificationsRead,
  setNotificationReadStatus,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

import NotificationList from "../app/(protected)/notifications/notification-list";

let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  setNotificationReadStatus.mockReset();
  markAllNotificationsRead.mockReset();
  routerRefresh.mockReset();
});

it("updates read state after success and keeps it on screen after failure", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  setNotificationReadStatus.mockResolvedValueOnce({ ok: true });
  setNotificationReadStatus.mockResolvedValueOnce({
    ok: false,
    error: "Could not update notification status",
  });
  act(() => {
    root?.render(
      createElement(NotificationList, {
        unreadCount: 1,
        notifications: [
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
        ],
      }),
    );
  });

  await act(async () => {
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Mark as read")
      ?.click();
  });
  expect(setNotificationReadStatus).toHaveBeenNthCalledWith(1, 41, true);
  expect(routerRefresh).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Mark as unread");
  expect(container.textContent).not.toContain("Unread");

  await act(async () => {
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Mark as unread")
      ?.click();
  });
  expect(setNotificationReadStatus).toHaveBeenNthCalledWith(2, 41, false);
  expect(container.textContent).toContain("Mark as unread");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not update notification status",
  );
});

it("keeps the inbox unchanged on bulk-read failure and updates it after success", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  markAllNotificationsRead
    .mockResolvedValueOnce({
      ok: false,
      error: "Could not mark notifications as read",
    })
    .mockResolvedValueOnce({ ok: true });
  act(() => {
    root?.render(
      createElement(NotificationList, {
        unreadCount: 3,
        notifications: [
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
            title: "Older notice already read",
            message: "A prior update.",
            kind: "event.changed",
            entity_type: "event",
            priority: "important",
            created_at: "2026-11-08T12:00:00Z",
            read_at: "2026-11-08T12:30:00Z",
          },
        ],
      }),
    );
  });

  const markAllButton = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Mark all as read",
    );
  await act(async () => markAllButton()?.click());
  expect(container.textContent).toContain("Unread");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not mark notifications as read",
  );
  expect(routerRefresh).not.toHaveBeenCalled();

  await act(async () => markAllButton()?.click());
  expect(markAllNotificationsRead).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Unread");
  expect(container.textContent).not.toContain("Mark all as read");
  expect(routerRefresh).toHaveBeenCalledOnce();
});
