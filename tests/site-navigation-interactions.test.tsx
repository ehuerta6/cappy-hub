// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const { markAllNotificationsRead, routerRefresh } = vi.hoisted(() => ({
  markAllNotificationsRead: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("next/image", () => ({
  default: (props: object) => createElement("img", props),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) =>
    createElement("a", { href, ...props }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/notifications/actions", () => ({
  markAllNotificationsRead: markAllNotificationsRead,
  openNotification: vi.fn(),
}));
vi.mock("@/components/theme-toggle", () => ({ default: () => null }));
vi.mock("@/components/academic-period-selector", () => ({
  default: () => null,
}));

import SiteNavigation from "@/components/site-navigation";

let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  markAllNotificationsRead.mockReset();
  routerRefresh.mockReset();
});

it("marks all unread notices from the header, including when none are in the preview", async () => {
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
      createElement(SiteNavigation, {
        isAdmin: false,
        account: createElement("span", null, "Officer"),
        recentNotifications: [],
        unreadNotificationCount: 8,
      }),
    );
  });
  const bell = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="notification-preview"]',
  )!;
  act(() => bell.click());
  expect(container.textContent).toContain("Mark all as read");
  expect(container.querySelector("#notification-preview ul")).toBeNull();

  const markAllButton = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Mark all as read",
    );
  await act(async () => markAllButton()?.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not mark notifications as read",
  );
  expect(bell.getAttribute("aria-label")).toBe("Notifications, 8 unread");
  expect(routerRefresh).not.toHaveBeenCalled();

  await act(async () => markAllButton()?.click());
  expect(markAllNotificationsRead).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("All caught up");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(bell.getAttribute("aria-label")).toBe("Notifications");
  expect(routerRefresh).toHaveBeenCalledOnce();
});

it("keeps the preview open for inside clicks, dismisses it, and restores focus on Escape", () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(SiteNavigation, {
        isAdmin: false,
        account: createElement("span", null, "Officer"),
        recentNotifications: [
          {
            id: 1,
            title: "Event update",
            message: "Location changed.",
            kind: "event.changed",
            entity_type: "event",
            created_at: "2026-11-09T12:00:00Z",
            read_at: null,
          },
        ],
        unreadNotificationCount: 1,
      }),
    );
  });

  const bell = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="notification-preview"]',
  )!;
  act(() => bell.click());
  expect(container.querySelector("#notification-preview")).not.toBeNull();
  expect(container.querySelector("#notification-preview ul li")).not.toBeNull();
  expect(container.textContent).toContain("Event");
  expect(
    container.querySelector('time[datetime="2026-11-09T12:00:00Z"]'),
  ).not.toBeNull();

  act(() => {
    container
      .querySelector("#notification-preview")
      ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(container.querySelector("#notification-preview")).not.toBeNull();

  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(container.querySelector("#notification-preview")).toBeNull();
  expect(document.activeElement).toBe(bell);

  act(() => bell.click());
  act(() => {
    container
      .querySelector('a[href="/notifications"]')
      ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(container.querySelector("#notification-preview")).not.toBeNull();
  act(() => {
    const inboxLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/notifications"]',
    );
    inboxLink?.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    inboxLink?.click();
  });
  expect(container.querySelector("#notification-preview")).toBeNull();

  act(() => bell.click());
  act(() =>
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
  );
  expect(container.querySelector("#notification-preview")).toBeNull();

  act(() => bell.click());
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(container.querySelector("#notification-preview")).toBeNull();
  expect(document.activeElement).toBe(bell);
});

it("dismisses the mobile controls menu and restores focus to the toggle on Escape", () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(SiteNavigation, {
        isAdmin: false,
        account: createElement("span", null, "Officer"),
        recentNotifications: [],
        unreadNotificationCount: 0,
      }),
    );
  });

  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="shell-controls"]',
  )!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");

  act(() => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");

  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);
});
