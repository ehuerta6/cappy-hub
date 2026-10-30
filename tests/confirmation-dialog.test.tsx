import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/events/actions", () => ({
  cancelEvent: vi.fn(),
  removeEvent: vi.fn(),
}));
vi.mock("@/app/(protected)/events/time-slot-actions", () => ({
  changeTimeSlotSignup: vi.fn(),
  assignBulkOfficersToTimeSlots: vi.fn(),
}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  removeTask: vi.fn(),
}));
vi.mock("@/app/(protected)/officers/warning-actions", () => ({
  createWarning: vi.fn(),
  decideWarning: vi.fn(),
  voidWarning: vi.fn(),
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
import {
  ActionFeedback,
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  dialogTitleClassName,
} from "@/components/ui";
import { recurrenceScopeLabels } from "@/components/recurrence-scope";
import {
  CancelForm,
  RemoveEventForm,
} from "@/app/(protected)/events/event-controls";
import { TaskRemoveForm } from "@/app/(protected)/tasks/task-remove-form";
import { VoidWarningForm } from "@/app/(protected)/officers/warning-forms";
import PointActions from "@/app/(protected)/points/point-actions";
import { PointHistoryState } from "@/app/(protected)/points/point-history-state";

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

it("uses one presentation recipe across existing native dialogs", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmationDialog, {
      title: "Remove?",
      description: "This action is permanent.",
      triggerLabel: "Remove",
      confirmLabel: "Remove",
      destructive: true,
    }),
  );

  expect(html).toContain(`class="${dialogSurfaceClassName}"`);
  expect(html).toContain(`class="${dialogContentClassName}"`);
  expect(html).toContain(`class="${dialogHeaderClassName}"`);
  expect(html).toContain(`class="${dialogTitleClassName}"`);
  expect(html).toContain(`class="${dialogDescriptionClassName}"`);
  expect(html).toContain(`class="${dialogFooterClassName}"`);
  expect(dialogSurfaceClassName).toContain("overflow-y-auto");
  expect(dialogContentClassName).toBe("space-y-4");
  expect(dialogHeaderClassName).toBe("space-y-1.5");
  expect(dialogTitleClassName).toContain("text-lg font-semibold");
  expect(dialogDescriptionClassName).toBe("text-sm leading-5 text-secondary");
  expect(dialogFooterClassName).toContain("border-t border-border");
  expect(html).toContain("bg-danger-bg");
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
  expect(removeHtml).toContain("Archive Event?");
  expect(removeHtml).toContain("workflow history is preserved");
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

  expect(html).toContain("Archive Task?");
  expect(html).toContain(
    "Assignments, completion, Points, and history are preserved",
  );
  expect(html).toContain("This occurrence");
  expect(html).toContain("All occurrences");
});

it("preserves the existing Warning Void confirmation until reversible removal lands", () => {
  const html = renderToStaticMarkup(
    createElement(VoidWarningForm, { warningId: 7, officerId: 3 }),
  );
  expect(html).toContain("Void warning?");
  expect(html).toContain("cannot be undone");
});

it("explains that Point transaction removal is logical and retains feedback", () => {
  const pointHtml = renderToStaticMarkup(
    createElement(
      PointHistoryState,
      { initialAmounts: [{ transactionId: 8, points: 2 }] },
      createElement(PointActions, { transactionId: 8, points: 2 }),
    ),
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
  expect(pointHtml).toContain(
    'type="button" class="button-secondary">Edit points</button>',
  );
  expect(pointHtml).not.toContain('name="points"');
  expect(pointHtml).toContain(">Remove</button>");
  expect(feedbackHtml).toContain('role="status"');
  expect(feedbackHtml).toContain('role="alert"');
});
