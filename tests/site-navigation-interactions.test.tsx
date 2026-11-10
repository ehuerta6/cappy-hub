// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useSearchParams: () => new URLSearchParams(),
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
