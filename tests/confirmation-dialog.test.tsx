import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/events/actions", () => ({
  cancelEvent: vi.fn(),
  removeEvent: vi.fn(),
}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  removeTask: vi.fn(),
}));
vi.mock("@/app/(protected)/officers/warning-actions", () => ({
  createWarning: vi.fn(),
  decideWarning: vi.fn(),
  deleteWarning: vi.fn(),
}));
vi.mock("@/app/(protected)/points/actions", () => ({
  editPointTransaction: vi.fn(),
  removePointTransaction: vi.fn(),
}));

import {
  ConfirmationDialog,
  confirmationContextValue,
  focusTriggerWhenReady,
} from "@/components/confirmation-dialog";
import { ActionFeedback } from "@/components/ui";
import { recurrenceScopeLabels } from "@/components/recurrence-scope";
import {
  CancelForm,
  RemoveEventForm,
} from "@/app/(protected)/events/event-controls";
import { TaskRemoveForm } from "@/app/(protected)/tasks/task-remove-form";
import {
  DeleteWarningForm,
  WarningDecisionForm,
} from "@/app/(protected)/officers/warning-forms";
import PointActions from "@/app/(protected)/points/point-actions";

const series = {
  id: 12,
  revision: 3,
  recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
};

it("labels the native dialog and gives only Confirm submit behavior", () => {
  const html = renderToStaticMarkup(
    createElement(
      "form",
      { action: async () => {} },
      createElement(ConfirmationDialog, {
        title: "Remove Task?",
        description: "This removes the selected Task.",
        triggerLabel: "Remove task",
        confirmLabel: "Remove Task",
        destructive: true,
      }),
    ),
  );

  const titleId = html.match(/<h2 id="([^"]+)"/)?.[1];
  const descriptionId = html.match(/<p id="([^"]+)"/)?.[1];
  expect(html).toContain("<dialog");
  expect(titleId).toBeTruthy();
  expect(descriptionId).toBeTruthy();
  expect(html).toContain(`aria-labelledby="${titleId}"`);
  expect(html).toContain(`aria-describedby="${descriptionId}"`);
  expect(html).toContain('<button type="button"');
  expect(html.match(/type="submit"/g)).toHaveLength(1);
  expect(html).toContain("Cancel");
  expect(html).toContain("Remove Task");
});

it("restores focus only to a connected enabled trigger when submission is idle", () => {
  const focus = vi.fn();

  focusTriggerWhenReady({ disabled: false, isConnected: true, focus }, false);
  expect(focus).toHaveBeenCalledOnce();

  const disabledFocus = vi.fn();
  focusTriggerWhenReady(
    { disabled: true, isConnected: true, focus: disabledFocus },
    false,
  );
  expect(disabledFocus).not.toHaveBeenCalled();

  const pendingFocus = vi.fn();
  focusTriggerWhenReady(
    { disabled: true, isConnected: true, focus: pendingFocus },
    true,
  );
  expect(pendingFocus).not.toHaveBeenCalled();

  const disconnectedFocus = vi.fn();
  focusTriggerWhenReady(
    { disabled: false, isConnected: false, focus: disconnectedFocus },
    false,
  );
  expect(disconnectedFocus).not.toHaveBeenCalled();
  expect(() => focusTriggerWhenReady(null, false)).not.toThrow();
});

it.each([
  ["occurrence", "This occurrence"],
  ["following", "This and following occurrences"],
  ["series", "All occurrences"],
])(
  "reads the selected recurrence scope %s from form values",
  (scope, label) => {
    const formData = new FormData();
    formData.set("scope", scope);
    expect(
      confirmationContextValue(formData, {
        label: "Scope",
        fieldName: "scope",
        values: recurrenceScopeLabels,
        defaultValue: "occurrence",
      }),
    ).toBe(label);
  },
);

it("shows action-specific Event cancel and removal confirmations", () => {
  const cancelHtml = renderToStaticMarkup(
    createElement(CancelForm, {
      eventId: 9,
      series,
      requestKey: "00000000-0000-4000-8000-000000000001",
    }),
  );
  const removeHtml = renderToStaticMarkup(
    createElement(RemoveEventForm, {
      eventId: 9,
      series,
      requestKey: "00000000-0000-4000-8000-000000000001",
    }),
  );

  expect(cancelHtml).toContain("Cancel Event?");
  expect(cancelHtml).toContain("This applies cancellation to the selected");
  expect(cancelHtml).toContain("This occurrence");
  expect(removeHtml).toContain("Remove Event?");
  expect(removeHtml).toContain("Existing protected history remains");
  expect(removeHtml).toContain("This occurrence");
});

it("shows scope and protected-history consequences for recurring Task removal", () => {
  const html = renderToStaticMarkup(
    createElement(TaskRemoveForm, {
      taskId: 24,
      series,
      requestKey: "00000000-0000-4000-8000-000000000002",
    }),
  );

  expect(html).toContain("Remove Task?");
  expect(html).toContain("Protected completion and award history");
  expect(html).toContain("This occurrence");
  expect(html).toContain("All occurrences");
});

it("preserves warning decision submit values inside the dialogs", () => {
  const decisionHtml = renderToStaticMarkup(
    createElement(WarningDecisionForm, { warningId: 7 }),
  );
  const deleteHtml = renderToStaticMarkup(
    createElement(DeleteWarningForm, { warningId: 7, officerId: 3 }),
  );

  expect(decisionHtml).toContain("Approve warning?");
  expect(decisionHtml).toContain("Reject warning?");
  expect(decisionHtml).toContain('name="decision"');
  expect(decisionHtml).toContain('value="approved"');
  expect(decisionHtml).toContain('value="rejected"');
  expect(deleteHtml).toContain("Delete warning?");
  expect(deleteHtml).toContain("Its System Log record remains.");
});

it("explains that Point transaction removal is logical and retains feedback", () => {
  const pointHtml = renderToStaticMarkup(
    createElement(PointActions, { transactionId: 8, points: 2 }),
  );
  const feedbackHtml = renderToStaticMarkup(
    createElement("form", null, [
      createElement(ActionFeedback, {
        key: "success",
        state: { error: "", success: "Point transaction removed" },
      }),
      createElement(ActionFeedback, {
        key: "error",
        state: { error: "Admin required", success: "" },
      }),
    ]),
  );

  expect(pointHtml).toContain("Remove Point transaction?");
  expect(pointHtml).toContain("marks the Point transaction as removed");
  expect(pointHtml).toContain("The removal is recorded in the System Log.");
  expect(feedbackHtml).toContain('role="status"');
  expect(feedbackHtml).toContain('role="alert"');
});
