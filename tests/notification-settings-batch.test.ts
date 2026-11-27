import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { saveTaskPostSaveSettings } from "@/lib/notification-settings";

describe("saveTaskPostSaveSettings", () => {
  it("resolves recurrence scope once and writes notification settings and due time concurrently", async () => {
    const singleTask = vi.fn().mockResolvedValue({
      data: { recurrence_series_id: null },
      error: null,
    });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: singleTask }),
      }),
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from, rpc } as unknown as Parameters<
      typeof saveTaskPostSaveSettings
    >[0];

    const form = new FormData();
    form.set("due_time", "15:30");

    await saveTaskPostSaveSettings(supabase, 42, form, {
      all_active: true,
      branch_ids: [],
      position_ids: [],
      reminder_offsets: [1440],
    });

    // Scope lookup runs once instead of once per secondary RPC
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("tasks");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      "set_task_notification_settings",
      expect.objectContaining({ p_task_id: 42, p_all_active: true }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "set_task_due_time",
      expect.objectContaining({ p_task_id: 42, p_due_time: "15:30" }),
    );
  });

  it("skips due-time RPC on create when due_time is empty", async () => {
    const singleTask = vi.fn().mockResolvedValue({
      data: { recurrence_series_id: null },
      error: null,
    });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: singleTask }),
      }),
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from, rpc } as unknown as Parameters<
      typeof saveTaskPostSaveSettings
    >[0];

    const form = new FormData();
    await saveTaskPostSaveSettings(supabase, 99, form, {
      all_active: false,
      branch_ids: [1],
      position_ids: [],
      reminder_offsets: [60],
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "set_task_notification_settings",
      expect.objectContaining({ p_task_id: 99, p_branch_ids: [1] }),
    );
  });
});
