import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ListPagination } from "@/components/list-pagination";

const render = (props: Parameters<typeof ListPagination>[0]) =>
  renderToStaticMarkup(createElement(ListPagination, props));

it.each([
  ["/events", "Event", "events"],
  ["/tasks", "Task", "tasks"],
] as const)(
  "offers direct %s page selection and preserves filters",
  (pathname, label, countLabel) => {
    const html = render({
      pathname,
      label,
      filters: new URLSearchParams(
        "q=design&status=past&branch=2&page=2&assignee=4",
      ),
      page: 2,
      totalPages: 12,
      totalCount: 97,
      countLabel,
    });

    expect(html).toContain(`aria-label="${label} pages"`);
    expect(html).toContain(">First</a>");
    expect(html).toContain(">Previous</a>");
    expect(html).toContain(">Next</a>");
    expect(html).toContain(">Last</a>");
    expect(html).toContain(
      'aria-label="Select ' + label.toLowerCase() + ' page"',
    );
    expect(html).toContain('<option value="2" selected="">2</option>');
    expect(html).toContain('<option value="12">12</option>');
    expect(html).toContain('action="' + pathname + '" method="get"');
    expect(html).toContain('name="q" value="design"');
    expect(html).toContain('name="status" value="past"');
    expect(html).toContain('name="branch" value="2"');
    expect(html).toContain('name="assignee" value="4"');
    expect(html).not.toContain('type="hidden" name="page"');
    expect(html).toContain(
      'href="' +
        pathname +
        '?q=design&amp;status=past&amp;branch=2&amp;assignee=4&amp;page=12"',
    );
  },
);

it("disables unavailable boundary controls and omits navigation for one page", () => {
  const first = render({
    pathname: "/events",
    label: "Event",
    filters: new URLSearchParams(),
    page: 1,
    totalPages: 2,
    totalCount: 9,
    countLabel: "events",
  });
  expect(first).toContain('aria-label="Event pages"');
  expect(first).toContain(
    'type="button" class="button-secondary min-h-11 px-3 py-2" disabled=""',
  );
  expect(first).toContain(">Next</a>");

  const last = render({
    pathname: "/events",
    label: "Event",
    filters: new URLSearchParams(),
    page: 2,
    totalPages: 2,
    totalCount: 9,
    countLabel: "events",
  });
  expect(last).toContain(">Previous</a>");
  expect(last).toContain("disabled");

  const single = render({
    pathname: "/tasks",
    label: "Task",
    filters: new URLSearchParams("view=current"),
    page: 1,
    totalPages: 1,
    totalCount: 3,
    countLabel: "tasks",
  });
  expect(single).not.toContain("pages");
  expect(single).toContain("3 tasks");
});

it("uses a compact numeric direct-jump fallback for unusually many pages", () => {
  const html = render({
    pathname: "/tasks",
    label: "Task",
    filters: new URLSearchParams("view=past&status=complete"),
    page: 137,
    totalPages: 1000,
    totalCount: 8000,
    countLabel: "tasks",
  });
  expect(html).toContain('type="number"');
  expect(html).toContain('name="page"');
  expect(html).toContain('value="137"');
  expect(html).toContain("of 1000");
  expect(html).toContain('name="view" value="past"');
  expect(html).toContain('name="status" value="complete"');
  expect(html).not.toContain("<option");
});
