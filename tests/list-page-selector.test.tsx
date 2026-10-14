// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListPageSelector } from "@/components/list-page-selector";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("submits the selected page as soon as the dropdown changes", async () => {
  const requestSubmit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => {});

  await act(async () => {
    root.render(
      createElement(ListPageSelector, {
        pathname: "/events",
        label: "Event",
        filters: [["q", "design"]],
        page: 1,
        totalPages: 3,
        pageParam: "page",
      }),
    );
  });

  const selector = host.querySelector("select");
  if (!selector) throw new Error("Page selector not found");

  await act(async () => {
    selector.value = "3";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(requestSubmit).toHaveBeenCalledTimes(1);
  expect(selector.form?.action).toContain("/events");
});

it("updates the displayed page when the page prop changes without remounting", async () => {
  await act(async () => {
    root.render(
      createElement(ListPageSelector, {
        pathname: "/events",
        label: "Event",
        filters: [],
        page: 1,
        totalPages: 3,
        pageParam: "page",
      }),
    );
  });

  await act(async () => {
    root.render(
      createElement(ListPageSelector, {
        pathname: "/events",
        label: "Event",
        filters: [],
        page: 2,
        totalPages: 3,
        pageParam: "page",
      }),
    );
  });

  expect(host.querySelector("select")?.value).toBe("2");
});

it("submits a numeric page on Enter", async () => {
  const requestSubmit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => {});

  await act(async () => {
    root.render(
      createElement(ListPageSelector, {
        pathname: "/events",
        label: "Event",
        filters: [],
        page: 1,
        totalPages: 101,
        pageParam: "page",
      }),
    );
  });

  const input = host.querySelector<HTMLInputElement>("input[type=number]");
  if (!input) throw new Error("Numeric page selector not found");

  await act(async () => {
    input.value = "12";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });

  expect(requestSubmit).toHaveBeenCalledTimes(1);
});

it("does not submit an edited numeric page when clicking an adjacent control", async () => {
  const requestSubmit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => {});

  await act(async () => {
    root.render(
      createElement(
        "div",
        null,
        createElement(ListPageSelector, {
          pathname: "/events",
          label: "Event",
          filters: [["status", "upcoming"]],
          page: 1,
          totalPages: 101,
          pageParam: "page",
        }),
        createElement("a", { href: "/events?status=upcoming&page=2" }, "Next"),
      ),
    );
  });

  const input = host.querySelector<HTMLInputElement>("input[type=number]");
  const next = host.querySelector<HTMLAnchorElement>("a");
  if (!input || !next) throw new Error("Pagination controls not found");
  next.addEventListener("click", (event) => event.preventDefault());

  await act(async () => {
    input.focus();
    input.value = "12";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
    next.click();
  });

  expect(requestSubmit).not.toHaveBeenCalled();
  expect(next.getAttribute("href")).toBe("/events?status=upcoming&page=2");
});
