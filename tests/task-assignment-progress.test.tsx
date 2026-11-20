import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TaskAssignmentProgress from "@/app/(protected)/tasks/task-assignment-progress";

it("shows a clear completion count and accessible meter for assigned Officers", () => {
  const html = renderToStaticMarkup(
    createElement(TaskAssignmentProgress, {
      assignments: [
        { officer_id: 1, completed_at: "2026-10-01T12:00:00Z" },
        { officer_id: 2, completed_at: "2026-10-02T12:00:00Z" },
        ...Array.from({ length: 18 }, (_, index) => ({
          officer_id: index + 3,
          completed_at: null,
        })),
      ],
    }),
  );

  expect(html).toContain("2");
  expect(html).toContain("of 20 Officers completed");
  expect(html).toContain('aria-label="Officer completion"');
  expect(html).toContain('value="2" max="20"');
});

it("keeps the unassigned state clear without showing an empty progress meter", () => {
  const html = renderToStaticMarkup(
    createElement(TaskAssignmentProgress, { assignments: [] }),
  );

  expect(html).toContain("No Officers assigned");
  expect(html).not.toContain("<progress");
});

it("shows a compact completion badge when every assigned Officer is complete", () => {
  const html = renderToStaticMarkup(
    createElement(TaskAssignmentProgress, {
      assignments: [
        { officer_id: 1, completed_at: "2026-10-01T12:00:00Z" },
        { officer_id: 2, completed_at: "2026-10-02T12:00:00Z" },
      ],
    }),
  );

  expect(html).toContain("All completed");
  expect(html).not.toContain("<progress");
});

it("treats a roster containing only removed assignments as unassigned", () => {
  const html = renderToStaticMarkup(
    createElement(TaskAssignmentProgress, {
      assignments: [
        {
          officer_id: 1,
          completed_at: null,
          removed_at: "2026-10-04T12:00:00Z",
        },
      ],
    }),
  );

  expect(html).toContain("No Officers assigned");
  expect(html).not.toContain("<progress");
});
