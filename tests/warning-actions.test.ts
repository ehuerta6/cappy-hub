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
  decideWarning,
  deleteWarning,
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
  expect(await createWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "Warning reason is required",
    success: "",
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("submits a trimmed warning reason and revalidates the officer", async () => {
  const warningForm = new FormData();
  warningForm.set("officer_id", "3");
  warningForm.set("reason", "  Missed shift  ");
  expect(await createWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "",
    success: "Warning created for leadership approval",
  });
  expect(rpc).toHaveBeenCalledWith("create_warning", {
    p_officer_id: 3,
    p_reason: "Missed shift",
  });
  expect(revalidatePath).toHaveBeenCalledWith("/officers/3");
});

it("validates warning decisions and preserves the existing RPC", async () => {
  const warningForm = new FormData();
  warningForm.set("warning_id", "7");
  warningForm.set("decision", "approved");
  expect(await decideWarning({ error: "", success: "" }, warningForm)).toEqual({
    error: "",
    success: "Warning approved",
  });
  expect(rpc).toHaveBeenCalledWith("decide_warning", {
    p_warning_id: 7,
    p_decision: "approved",
  });
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
