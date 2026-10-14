import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  listReturnUrl,
  safeReturnTo,
  withReturnTo,
} from "@/lib/return-context";
import { listPageUrl } from "@/lib/list-url";

it.each([
  undefined,
  null,
  ["/events"],
  new Blob(),
  "",
  "https://evil.example/events",
  "//evil.example/events",
  "javascript:alert(1)",
  "data:text/html,hello",
  "/login",
  "/events/7",
  "/events/7/edit",
  "/events/",
  "/events/../points",
  "/%65vents",
  "/events#fragment",
  "/events?q=%",
  "/events?q=%FF",
  "/events\\evil",
  "/events\n",
  " /events",
  "/events?returnTo=%2Fpoints",
  "/events?%72eturnTo=%2Fpoints",
  "/events?returnTo=%2Fevents%3Fq%3Dmeeting",
])("ignores unsafe or malformed return context: %s", (value) => {
  expect(safeReturnTo(value)).toBeUndefined();
  expect(withReturnTo("/events/7", value)).toBe("/events/7");
  const html = renderToStaticMarkup(
    <ContextualBackLink href="/events" returnTo={value}>
      Back to events
    </ContextualBackLink>,
  );
  expect(html).toContain('href="/events"');
  expect(html).toContain("Back to events");
});

it.each(["/officers", "/events", "/tasks", "/points", "/system-log"])(
  "accepts an exact internal list route and encoded query values: %s",
  (route) => {
    const destination = `${route}?q=hello+world%26%3F%25&page=2`;
    expect(safeReturnTo(destination)).toBe(destination);
    expect(
      new URL(
        withReturnTo("/events/7", destination),
        "https://cappy.invalid",
      ).searchParams.get("returnTo"),
    ).toBe(destination);
  },
);

it("keeps one stable list destination across detail/edit/detail and preserves existing params", () => {
  const destination = listReturnUrl("/events", {
    q: "workshop & Q&A",
    branch: "2",
    status: "upcoming",
    returnTo: "/points",
    unrelated: "ignored",
  });
  expect(destination).toBe(
    "/events?q=workshop+%26+Q%26A&status=upcoming&branch=2",
  );
  let link = withReturnTo("/events/7?tab=files#participation", destination);
  for (let i = 0; i < 10; i++) link = withReturnTo(link, destination);
  const url = new URL(link, "https://cappy.invalid");
  expect(url.searchParams.getAll("returnTo")).toEqual([destination]);
  expect(url.searchParams.get("tab")).toBe("files");
  expect(url.hash).toBe("#participation");
  expect(withReturnTo("/events/7/edit", url.searchParams.get("returnTo"))).toBe(
    withReturnTo("/events/7/edit", destination),
  );
  expect(withReturnTo(link, "//evil.example")).toBe(
    "/events/7?tab=files#participation",
  );
});

it.each(["/points", "/system-log"] as const)(
  "preserves URL pagination and filters for %s",
  (route) => {
    expect(
      listReturnUrl(route, {
        q: "change",
        page: "3",
        from: "2026-10-01",
        returnTo: "/events",
      }),
    ).toBe(`${route}?q=change&from=2026-10-01&page=3`);
  },
);

it("preserves Officers directory and review pages through record navigation", () => {
  const destination = listReturnUrl("/officers", {
    q: "Alex",
    branch: "3",
    page: "2",
    view: "warnings",
    reviewPage: "3",
    unrelated: "ignored",
  });
  expect(destination).toBe(
    "/officers?q=Alex&branch=3&page=2&view=warnings&reviewPage=3",
  );
  expect(safeReturnTo(destination)).toBe(destination);
  expect(
    new URL(
      withReturnTo("/officers/7", destination),
      "https://cappy.invalid",
    ).searchParams.get("returnTo"),
  ).toBe(destination);
  expect(listPageUrl("/officers", new URLSearchParams("q=Alex"), 2)).toBe(
    "/officers?q=Alex&page=2",
  );
});

it("preserves the Points History view and its page through record navigation", () => {
  const destination = listReturnUrl("/points", {
    view: "history",
    q: "workshop",
    officer: "12",
    page: "3",
  });

  expect(destination).toBe("/points?view=history&q=workshop&officer=12&page=3");
  expect(safeReturnTo(destination)).toBe(destination);
});

it("omits repeated query values just as list schemas do", () => {
  expect(
    listReturnUrl("/tasks", { q: ["a", "b"], status: "", branch: "2" }),
  ).toBe("/tasks?branch=2");
});

it("preserves the explicit Past Task view with workflow and assignment filters", () => {
  expect(
    listReturnUrl("/tasks", {
      q: "flyer",
      view: "past",
      status: "complete",
      branch: "2",
      assignee: "123",
      page: "3",
    }),
  ).toBe(
    "/tasks?q=flyer&view=past&status=complete&branch=2&assignee=123&page=3",
  );
  expect(
    listPageUrl("/tasks", new URLSearchParams("q=flyer&assignee=123"), 2),
  ).toBe("/tasks?q=flyer&assignee=123&page=2");
});

it("does not retain the removed Event browse parameter", () => {
  expect(
    listReturnUrl("/events", { q: "meeting", removed: "1", branch: "2" }),
  ).toBe("/events?q=meeting&branch=2");
});

it("labels a Point History return clearly without exposing the query string", () => {
  const html = renderToStaticMarkup(
    <ContextualBackLink href="/events" returnTo="/points?q=meeting&page=3">
      Back to events
    </ContextualBackLink>,
  );
  expect(html).toContain('href="/points?q=meeting&amp;page=3"');
  expect(html).toContain("Back to points</a>");
  expect(html).toContain("focus-visible:outline");
});
