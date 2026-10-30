import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  createWarning,
  deleteWarning,
  restoreWarning,
  updateWarning,
} from "@/app/(protected)/officers/warning-actions";

const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    applicationRole: "admin",
  } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  rpc.mockResolvedValue({ error: null });
});

it("rejects a blank warning reason before calling the RPC", async () => {
  const warningForm = new FormData();
  warningForm.set("officer_id", "3");
  warningForm.set("reason", "   ");
  expect(
    await createWarning({ error: "", success: "" }, warningForm),
  ).toMatchObject({
    error: "Warning reason is required",
    success: "",
    fieldErrors: { reason: "Warning reason is required" },
    values: { reason: "   " },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("submits a trimmed warning reason and revalidates the officer", async () => {
  const warningForm = new FormData();
  warningForm.set("officer_id", "3");
  warningForm.set("reason", "  Missed shift  ");
  expect(await createWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "",
    success: "Warning created",
  });
  expect(rpc).toHaveBeenCalledWith("create_warning", {
    p_officer_id: 3,
    p_reason: "Missed shift",
  });
  expect(revalidatePath).toHaveBeenCalledWith("/officers/3");
});

it("updates only the reason and revalidates the canonical recipient", async () => {
  rpc.mockResolvedValue({ data: 3, error: null });
  const form = new FormData();
  form.set("warning_id", "7");
  form.set("officer_id", "999");
  form.set("reason", "  Corrected historical information  ");
  expect(await updateWarning({ error: "", success: "" }, form)).toEqual({
    error: "",
    success: "Warning updated",
  });
  expect(rpc).toHaveBeenCalledWith("update_warning", {
    p_warning_id: 7,
    p_reason: "Corrected historical information",
  });
  expect(revalidatePath).toHaveBeenCalledWith("/officers/3");
  expect(revalidatePath).not.toHaveBeenCalledWith("/officers/999");
});

it.each(["", "   ", "\t\n"])(
  "rejects blank update reason %j",
  async (reason) => {
    const form = new FormData();
    form.set("warning_id", "7");
    form.set("reason", reason);
    expect(await updateWarning({ error: "", success: "" }, form)).toMatchObject(
      { error: "Warning reason is required", values: { reason } },
    );
    expect(rpc).not.toHaveBeenCalled();
  },
);

it.each([createWarning, updateWarning])(
  "rejects non-Admin mutations before RPC",
  async (action) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      id: 8,
      applicationRole: "officer",
    } as never);
    expect(
      await action({ error: "", success: "" }, new FormData()),
    ).toMatchObject({ error: "Admin required" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("preserves submitted corrections on database failure", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "Warning not found" },
  });
  const form = new FormData();
  form.set("warning_id", "7");
  form.set("reason", "Correction");
  expect(await updateWarning({ error: "", success: "" }, form)).toMatchObject({
    error: "Warning not found",
    values: { reason: "Correction" },
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("rejects an invalid warning ID before deleting", async () => {
  const warningForm = new FormData();
  warningForm.set("warning_id", "oops");
  warningForm.set("officer_id", "3");
  expect(await deleteWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "Warning not found",
    success: "",
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("deletes a warning through the trusted RPC and revalidates its officer", async () => {
  const warningForm = new FormData();
  warningForm.set("warning_id", "7");
  warningForm.set("officer_id", "3");
  expect(await deleteWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "",
    success: "Warning deleted",
  });
  expect(rpc).toHaveBeenCalledWith("delete_warning", { p_warning_id: 7 });
  expect(revalidatePath).toHaveBeenCalledWith("/officers/3");
});

it("restores a warning through the trusted RPC and revalidates its officer", async () => {
  const warningForm = new FormData();
  warningForm.set("warning_id", "7");
  warningForm.set("officer_id", "3");
  expect(await restoreWarning({ error: "", success: "" }, warningForm)).toEqual(
    { error: "", success: "Warning restored" },
  );
  expect(rpc).toHaveBeenCalledWith("restore_warning", { p_warning_id: 7 });
  expect(revalidatePath).toHaveBeenCalledWith("/officers/3");
});
