import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  readNotificationSettings,
  taskSaveSettings,
} from "@/lib/notification-settings";

const defaults = {
  all_active: false,
  branch_ids: [],
  position_ids: [],
  reminder_offsets: [1440],
};

it("preserves all settings groups on a title-only edit", () => {
  const form = new FormData();
  form.append("edited_fields", "title");
  expect(taskSaveSettings(form, defaults, false, "19:00")).toEqual({});
});

it("saves an explicit due-time and reminder clear without rewriting audiences", () => {
  const form = new FormData();
  form.append("edited_fields", "due_time");
  form.append("edited_fields", "reminder_offsets");
  form.set("reminder_offsets", "");
  const parsed = readNotificationSettings(form, [1440]);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw parsed.error;
  expect(taskSaveSettings(form, parsed.data, false, "")).toEqual({
    reminder_offsets: [],
    due_time: null,
  });
});

it("sends the initial audience, reminders and optional time on creation", () => {
  expect(taskSaveSettings(new FormData(), defaults, true, "15:30")).toEqual({
    audience: { all_active: false, branch_ids: [], position_ids: [] },
    reminder_offsets: [1440],
    due_time: "15:30",
  });
});
