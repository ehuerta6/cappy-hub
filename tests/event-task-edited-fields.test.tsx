// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveEvent } from "@/app/(protected)/events/actions";
import EventForm from "@/app/(protected)/events/event-form";
import { editRecurringTask } from "@/app/(protected)/tasks/actions";
import TaskCreateForm from "@/app/(protected)/tasks/task-create-form";

vi.mock("@/app/(protected)/events/actions", () => ({
  saveEvent: vi.fn().mockResolvedValue({ error: "", success: "" }),
}));

vi.mock("@/app/(protected)/tasks/actions", () => ({
  createTask: vi.fn(),
  editRecurringTask: vi.fn().mockResolvedValue({ error: "", success: "" }),
  editStandaloneTask: vi.fn(),
}));

const series = {
  id: 19,
  revision: 2,
  recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=4",
  starts_on: "2026-10-12",
};
const branches = [{ id: 1, name: "ICPC" }];
const positions = [{ id: 2, name: "Treasurer" }];
const requestKey = "00000000-0000-4000-8000-000000000001";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
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

async function renderTaskForm() {
  await act(async () => {
    root.render(
      <TaskCreateForm
        branches={branches}
        positions={positions}
        taskTypes={[{ name: "Flyer" }]}
        recurrenceRequestKey={requestKey}
        task={{
          id: 10,
          title: "Print flyers",
          description: "For the fair",
          task_type: "Flyer",
          branch_id: 1,
          due_date: "2026-10-12",
          due_time: "09:30:00",
          points: 5,
          approval_required: false,
          created_by: 3,
          created_at: "2026-10-01T00:00:00Z",
          recurrence_key: "2026-10-12",
          recurrence_series_id: series.id,
          removed_at: null,
          removed_by: null,
          no_longer_needed_at: null,
          no_longer_needed_by: null,
        }}
        series={series}
        events={[
          {
            id: 21,
            name: "Workshop",
            event_date: "2026-10-20",
            status: "scheduled",
            deleted_at: null,
          },
        ]}
        taskEventIds={[21]}
        resourceLinks={[
          {
            id: 1,
            kind: "documentation",
            label: "Documentation",
            url: "https://example.com/original",
            legacy_key: null,
            sort_order: 0,
          },
        ]}
        notificationSettings={{
          allActive: false,
          branchIds: [1],
          positionIds: [],
          reminderOffsets: [1440],
        }}
      />,
    );
  });
}

async function renderEventForm(recurring: boolean) {
  await act(async () => {
    root.render(
      <EventForm
        branches={branches}
        positions={positions}
        branchIds={[1]}
        eventTypes={[{ id: 9, name: "Session" }]}
        locations={[]}
        event={
          {
            id: 12,
            name: "CIC meeting",
            description: "Agenda",
            location: "Campus",
            event_type_id: 9,
            max_volunteers: null,
            event_date: "2026-10-12",
            starts_at: "2026-10-12T16:00:00.000Z",
            ends_at: "2026-10-12T17:00:00.000Z",
            recurrence_key: recurring ? "2026-10-12" : null,
            recurrence_series_id: recurring ? series.id : null,
          } as never
        }
        series={recurring ? series : undefined}
        mutationRequestKey={requestKey}
        notificationSettings={{
          allActive: false,
          branchIds: [1],
          positionIds: [],
          reminderOffsets: [1440, 60],
        }}
      />,
    );
  });
}

function form() {
  return host.querySelector("form")!;
}

function editedFields(data = new FormData(form())) {
  return data.getAll("edited_fields").sort();
}

async function setInput(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(selector: string) {
  await act(async () => host.querySelector<HTMLElement>(selector)!.click());
}

async function clickButton(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  )!;
  await act(async () => button.click());
}

it("submits a recurring Task link edit after title, date, and linked Event edits", async () => {
  await renderTaskForm();
  await setInput('[aria-label="Link 1 URL"]', "https://example.com/updated");
  await setInput('[name="title"]', "Print posters");
  await setInput('[name="due_date"]', "2026-10-13");
  await click('[aria-label^="Remove Workshop"]');
  await act(async () => form().requestSubmit());

  const submitted = vi.mocked(editRecurringTask).mock.calls[0][1];
  expect(editedFields(submitted)).toEqual([
    "due_date",
    "event_ids",
    "resource_links",
    "title",
  ]);
  expect(submitted.get("resource_links")).toContain(
    "https://example.com/updated",
  );
});

it("clears the Task resource link flag when its original URL is restored", async () => {
  await renderTaskForm();
  await setInput('[aria-label="Link 1 URL"]', "https://example.com/updated");
  expect(editedFields()).toEqual(["resource_links"]);
  await setInput('[name="title"]', "Print posters");
  await setInput('[aria-label="Link 1 URL"]', "https://example.com/original");
  expect(editedFields()).toEqual(["title"]);
});

it("tracks explicit clearing of a Task due time independently of reminders", async () => {
  await renderTaskForm();
  await setInput('[name="due_time"]', "");
  expect(editedFields()).toEqual(["due_time"]);
  await setInput('[name="due_time"]', "09:30");
  expect(editedFields()).toEqual([]);

  await setInput('[name="due_time"]', "");
  await click('[aria-label="Remove reminder 1"]');
  await act(async () => form().requestSubmit());
  const submitted = vi.mocked(editRecurringTask).mock.calls[0][1];
  expect(editedFields(submitted)).toEqual(["due_time", "reminder_offsets"]);
  expect(submitted.get("due_time")).toBe("");
  expect(submitted.getAll("reminder_offsets")).toEqual([""]);
});

it.each([false, true])(
  "submits independent Event audience and reminder edits with recurring=%s",
  async (recurring) => {
    await renderEventForm(recurring);
    await setInput('[name="name"]', "CIC session");
    expect(editedFields()).not.toContain("notification_audience");
    expect(editedFields()).not.toContain("reminder_offsets");

    await click('[name="notification_all_active"]');
    expect(editedFields()).toContain("notification_audience");
    expect(new FormData(form()).getAll("notification_branches")).toEqual([]);
    await click('[name="notification_all_active"]');
    expect(editedFields()).not.toContain("notification_audience");
    await click('[name="notification_positions"][value="2"]');
    expect(editedFields()).toContain("notification_audience");
    expect(editedFields()).not.toContain("reminder_offsets");

    await click('[aria-label="Remove reminder 1"]');
    expect(editedFields()).toContain("reminder_offsets");
    await clickButton("+ 1d");
    expect(editedFields()).not.toContain("reminder_offsets");
    await clickButton("+ 15m");
    await act(async () => form().requestSubmit());

    const submitted = vi.mocked(saveEvent).mock.calls[0][1];
    expect(editedFields(submitted)).toEqual(
      recurring
        ? ["name", "notification_audience", "reminder_offsets"]
        : ["notification_audience", "reminder_offsets"],
    );
    expect(submitted.getAll("notification_positions")).toEqual(["2"]);
    expect(submitted.getAll("reminder_offsets")).toEqual(["60", "1440", "15"]);
  },
);
