import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManageOfficers: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  changeApplicationRole,
  saveOfficer,
} from "@/app/(protected)/officers/actions";
import { changeCatalog } from "@/app/(protected)/officers/catalogs/actions";

const rpc = vi.fn().mockResolvedValue({ error: null });
const previous = { error: "", success: "" };
const roleForm = (role: string) => {
  const data = new FormData();
  data.set("officer_id", "602");
  data.set("role", role);
  return data;
};
const catalogForm = (operation: string) => {
  const data = new FormData();
  data.set("catalog", "event_type");
  data.set("operation", operation);
  data.set("id", "7");
  data.set("name", "Seminar");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
});

it("uses the existing audited role RPC for another officer", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const result = await changeApplicationRole(previous, roleForm("admin"));
  expect(result.success).toBe("Role saved");
  expect(rpc).toHaveBeenCalledWith("set_officer_application_role", {
    p_officer_id: 602,
    p_role: "admin",
  });
});

it("rejects a malformed role ID before calling the audited RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const malformedRoleForm = roleForm("admin");
  malformedRoleForm.set("officer_id", "602x");
  expect((await changeApplicationRole(previous, malformedRoleForm)).error).toBe(
    "Invalid role assignment",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("validates officer input and preserves the save RPC arguments", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const officerForm = new FormData();
  officerForm.set("name", " Alex Example ");
  officerForm.set("utep_email", " alex@example.edu ");
  officerForm.set("personal_email", "");
  officerForm.set("position_id", "4");
  officerForm.set("classification", "");
  officerForm.append("branches", "-2");
  await saveOfficer({ error: "" }, officerForm);
  expect(rpc).toHaveBeenCalledWith("save_officer", {
    p_officer_id: undefined,
    p_name: " Alex Example ",
    p_utep_email: "alex@example.edu",
    p_personal_email: undefined,
    p_position_id: 4,
    p_classification: undefined,
    p_status: "active",
    p_branch_ids: [-2],
  });
});

it("denies a non-admin role action before calling the RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 603,
    applicationRole: "officer",
  } as never);
  expect((await changeApplicationRole(previous, roleForm("admin"))).error).toBe(
    "Admin required",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("does not offer a self-demotion path through the action", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 602,
    applicationRole: "admin",
  } as never);
  expect(
    (await changeApplicationRole(previous, roleForm("officer"))).error,
  ).toBe("Admins cannot demote themselves");
  expect(rpc).not.toHaveBeenCalled();
});

it("shows the protected RPC's last-admin error", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  rpc.mockResolvedValue({
    error: { message: "Last active admin cannot be demoted" },
  });
  expect(
    (await changeApplicationRole(previous, roleForm("officer"))).error,
  ).toBe("Last active admin cannot be demoted");
});

it("denies a non-admin catalog action before calling the RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 603,
    applicationRole: "officer",
  } as never);
  expect((await changeCatalog(previous, catalogForm("create"))).error).toBe(
    "Admin required",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects obsolete event type catalog mutations before any RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  expect((await changeCatalog(previous, catalogForm("delete"))).error).toBe(
    "Invalid catalog operation",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("routes a valid catalog create through the existing branch RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const branchForm = new FormData();
  branchForm.set("catalog", "branch");
  branchForm.set("operation", "create");
  branchForm.set("name", "Denver");
  expect((await changeCatalog(previous, branchForm)).success).toBe("Saved");
  expect(rpc).toHaveBeenCalledWith("create_branch", { p_name: "Denver" });
});
