// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/events/actions", () => ({
  saveEvent: vi.fn().mockResolvedValue({ error: "", success: "" }),
}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  createTask: vi.fn(),
  editRecurringTask: vi.fn(),
  editStandaloneTask: vi.fn(),
}));

import EventForm from "@/app/(protected)/events/event-form";
import { saveEvent } from "@/app/(protected)/events/actions";
import TaskCreateForm from "@/app/(protected)/tasks/task-create-form";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  eventPointsImpactMessage,
  recurrencePointsImpact,
  taskPointsImpactMessage,
} from "@/lib/points-impact";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const schedule = {
  event_date: "2026-10-12",
  start_time: "10:00",
  end_time: "11:00",
};
const taskImpact = {
  activeAwardCount: 3,
  correctableAwardCount: 4,
  today: "2026-11-17",
};

describe("eventPointsImpactMessage", () => {
  it("describes a date, start or end change when Officers have awards", () => {
    const message =
      "Saving recalculates automatic participation Points for 5 Officers on the affected Event occurrences.";
    expect(
      eventPointsImpactMessage(
        schedule,
        { ...schedule, event_date: "2026-10-13" },
        5,
      ),
    ).toBe(message);
    expect(
      eventPointsImpactMessage(
        schedule,
        { ...schedule, start_time: "09:30" },
        5,
      ),
    ).toBe(message);
    expect(
      eventPointsImpactMessage(schedule, { ...schedule, end_time: "12:00" }, 5),
    ).toBe(message);
    expect(
      eventPointsImpactMessage(schedule, { ...schedule, end_time: "12:00" }, 1),
    ).toContain("for 1 Officer on");
  });

  it("stays quiet without awards or without a schedule change", () => {
    expect(
      eventPointsImpactMessage(
        schedule,
        { ...schedule, event_date: "2026-10-13" },
        0,
      ),
    ).toBeNull();
    expect(eventPointsImpactMessage(schedule, { ...schedule }, 5)).toBeNull();
  });
});

describe("recurrencePointsImpact", () => {
  const occurrences = [
    { recurrenceKey: "2026-11-01", officerIds: ["1", "2"] },
    { recurrenceKey: "2026-11-08", officerIds: ["2", "3"] },
    { recurrenceKey: "2026-11-15", officerIds: ["4"] },
  ];

  it("counts distinct Officers in the selected recurrence scope", () => {
    expect(
      recurrencePointsImpact(occurrences, "occurrence", "2026-11-08")
        .correctableAwardCount,
    ).toBe(2);
    expect(
      recurrencePointsImpact(occurrences, "following", "2026-11-08")
        .correctableAwardCount,
    ).toBe(3);
    expect(
      recurrencePointsImpact(occurrences, "series", "2026-11-08")
        .correctableAwardCount,
    ).toBe(4);
  });
});

describe("taskPointsImpactMessage", () => {
  const original = { points: 5, due_date: "2026-11-01" };

  it("describes a Point-value change, counting suspended awards", () => {
    expect(
      taskPointsImpactMessage(
        original,
        { points: "8", due_date: original.due_date },
        taskImpact,
      ),
    ).toBe(
      "Saving changes the automatic award for 4 Officers from 5 Points to 8 Points.",
    );
    expect(
      taskPointsImpactMessage(
        original,
        { points: "1", due_date: original.due_date },
        { ...taskImpact, activeAwardCount: 0, correctableAwardCount: 1 },
      ),
    ).toBe(
      "Saving changes the automatic award for 1 Officer from 5 Points to 1 Point.",
    );
  });

  it("describes a later due date that is today or in the future", () => {
    const suspends =
      "Saving suspends Task Points for 3 Officers until the new due date passes.";
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: "2026-11-30" },
        taskImpact,
      ),
    ).toBe(suspends);
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: "2026-11-17" },
        taskImpact,
      ),
    ).toBe(suspends);
  });

  it("combines both impacts", () => {
    expect(
      taskPointsImpactMessage(
        original,
        { points: "8", due_date: "2026-11-30" },
        taskImpact,
      ),
    ).toBe(
      "Saving changes the automatic award for 4 Officers from 5 Points to 8 Points. Saving suspends Task Points for 3 Officers until the new due date passes.",
    );
  });

  it("describes date and recurrence changes across the selected series scope", () => {
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: "2026-11-30" },
        taskImpact,
        false,
        true,
      ),
    ).toBe(
      "Saving updates due dates across the selected scope and may suspend Task Points for 3 Officers.",
    );
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: original.due_date },
        taskImpact,
        true,
        true,
      ),
    ).toBe(
      "Saving changes this recurring Task schedule and recalculates automatic Points for 4 Officers across the selected scope.",
    );
  });

  it("stays quiet for edits that do not change awarded Points", () => {
    const unchanged = { points: "5", due_date: original.due_date };
    expect(taskPointsImpactMessage(original, unchanged, taskImpact)).toBeNull();
    // Equivalent number, earlier date, later date still in the past.
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5.0", due_date: "2026-10-20" },
        taskImpact,
      ),
    ).toBeNull();
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: "2026-11-10" },
        taskImpact,
      ),
    ).toBeNull();
    // Empty or invalid Points input is left to form validation.
    expect(
      taskPointsImpactMessage(
        original,
        { points: "", due_date: original.due_date },
        taskImpact,
      ),
    ).toBeNull();
    // No awards at all.
    expect(
      taskPointsImpactMessage(
        original,
        { points: "8", due_date: "2026-11-30" },
        { ...taskImpact, activeAwardCount: 0, correctableAwardCount: 0 },
      ),
    ).toBeNull();
    // Only suspended awards: a later due date suspends nothing new.
    expect(
      taskPointsImpactMessage(
        original,
        { points: "5", due_date: "2026-11-30" },
        { ...taskImpact, activeAwardCount: 0, correctableAwardCount: 2 },
      ),
    ).toBeNull();
  });
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function setField(name: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!field) throw new Error(`Missing field ${name}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function saveButton(label: string) {
  return [...host.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
}

const event = {
  id: 12,
  name: "CIC meeting",
  description: "Agenda",
  location: "Campus",
  event_type_id: 9,
  max_volunteers: null,
  event_date: "2026-10-12",
  starts_at: "2026-10-12T16:00:00.000Z",
  ends_at: "2026-10-12T17:00:00.000Z",
  recurrence_key: null,
  recurrence_series_id: null,
};

async function renderEventForm(pointsImpactOfficerCount: number) {
  await act(async () => {
    root.render(
      <EventForm
        branches={[]}
        eventTypes={[{ id: 9, name: "Session" }]}
        locations={[]}
        event={event as never}
        pointsImpactOfficerCount={pointsImpactOfficerCount}
      />,
    );
  });
}

describe("Event form Points confirmation", () => {
  it("confirms a schedule change on an Event with participation Points", async () => {
    await renderEventForm(2);
    expect(saveButton("Save event")?.type).toBe("submit");
    expect(host.querySelector("dialog")).toBeNull();

    await setField("end_time", "11:30");
    const trigger = saveButton("Save event");
    expect(trigger?.type).toBe("button");
    await act(async () => trigger?.click());
    const dialog = host.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain(
      "Saving recalculates automatic participation Points for 2 Officers on the affected Event occurrences.",
    );
    expect(dialog?.querySelector('button[type="submit"]')?.textContent).toBe(
      "Save event",
    );

    await setField("end_time", "11:00");
    expect(host.querySelector("dialog")).toBeNull();
    expect(saveButton("Save event")?.type).toBe("submit");
  });

  it("saves descriptive edits and Events without Points directly", async () => {
    await renderEventForm(2);
    await setField("name", "Renamed meeting");
    expect(host.querySelector("dialog")).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(host);
    await renderEventForm(0);
    await setField("event_date", "2026-10-13");
    expect(host.querySelector("dialog")).toBeNull();
    expect(saveButton("Save event")?.type).toBe("submit");
  });

  it("does not let an Enter-key submission use the closed confirm button", async () => {
    vi.mocked(saveEvent).mockClear();
    // Before the guard, both submissions would reach the Server Action.
    await renderEventForm(2);
    await setField("end_time", "11:30");
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(saveEvent).not.toHaveBeenCalled();

    const confirmButton = host.querySelector<HTMLButtonElement>(
      'dialog button[type="submit"]',
    )!;
    await act(async () => {
      form.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
          submitter: confirmButton,
        }),
      );
    });
    expect(saveEvent).not.toHaveBeenCalled();

    await act(async () => saveButton("Save event")?.click());
    expect(confirmButton.closest("dialog")?.open).toBe(true);
    await act(async () => {
      form.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
          submitter: confirmButton,
        }),
      );
    });
    expect(saveEvent).toHaveBeenCalledTimes(1);
  });

  it("shows form validation instead of the dialog when a field is invalid", async () => {
    await renderEventForm(2);
    await setField("event_date", "2026-10-13");
    await setField("name", "");
    await act(async () => saveButton("Save event")?.click());
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });
});

const task = {
  id: 31,
  title: "Print flyers",
  description: "For the fair",
  task_type: "Flyer",
  branch_id: 1,
  due_date: "2026-11-01",
  due_time: null,
  points: 5,
  recurrence_key: null,
  recurrence_series_id: null,
  removed_at: null,
};

async function renderTaskForm(impact = taskImpact) {
  await act(async () => {
    root.render(
      <TaskCreateForm
        branches={[{ id: 1, name: "ICPC" }]}
        taskTypes={[{ name: "Flyer" }]}
        task={task as never}
        recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
        pointsImpact={impact}
      />,
    );
  });
}

describe("Task form Points confirmation", () => {
  it("confirms a Point-value change on an awarded Task", async () => {
    await renderTaskForm();
    expect(saveButton("Save task")?.type).toBe("submit");

    await setField("points", "8");
    await act(async () => saveButton("Save task")?.click());
    const dialog = host.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain(
      "Saving changes the automatic award for 4 Officers from 5 Points to 8 Points.",
    );
  });

  it("confirms a later future due date that suspends awards", async () => {
    await renderTaskForm();
    await setField("due_date", "2026-12-01");
    expect(host.querySelector("dialog")?.textContent).toContain(
      "Saving suspends Task Points for 3 Officers until the new due date passes.",
    );
  });

  it("saves descriptive edits and Tasks without awards directly", async () => {
    await renderTaskForm();
    await setField("title", "Print posters");
    expect(host.querySelector("dialog")).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(host);
    await renderTaskForm({
      activeAwardCount: 0,
      correctableAwardCount: 0,
      today: "2026-11-17",
    });
    await setField("points", "8");
    await setField("due_date", "2026-12-01");
    expect(host.querySelector("dialog")).toBeNull();
    expect(saveButton("Save task")?.type).toBe("submit");
  });
});

it("keeps existing dialogs opening without form validation by default", async () => {
  await act(async () => {
    root.render(
      <form>
        <input name="reason" required />
        <ConfirmationDialog
          title="Remove?"
          description="Removes it."
          triggerLabel="Remove"
          confirmLabel="Remove"
        />
      </form>,
    );
  });
  await act(async () => saveButton("Remove")?.click());
  expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
});
