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

import { redirect } from "next/navigation";
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
  expect(result.success).toBe("Application role saved");
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
  await saveOfficer({ error: "", success: "" }, officerForm);
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

it("returns a field error and keeps entered values when an Officer name is blank", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const data = new FormData();
  data.set("name", "   ");
  data.set("utep_email", "alex@example.edu");
  data.set("personal_email", "");
  data.set("position_id", "4");
  data.set("classification", "");
  data.set("status", "active");
  const result = await saveOfficer(previous, data);

  expect(result).toMatchObject({
    error: "Name is required",
    fieldErrors: { name: "Name is required" },
    values: { name: "   ", utep_email: "alex@example.edu" },
  });
  expect(rpc).not.toHaveBeenCalled();
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
  expect((await changeCatalog(previous, branchForm)).success).toBe(
    "Branch added",
  );
  expect(rpc).toHaveBeenCalledWith("create_branch", { p_name: "Denver" });
});

it.each([
  ["branch", "retire", "set_branch_active", false, "Branch retired"],
  ["branch", "reactivate", "set_branch_active", true, "Branch reactivated"],
  ["position", "retire", "set_position_active", false, "Position retired"],
  [
    "position",
    "reactivate",
    "set_position_active",
    true,
    "Position reactivated",
  ],
] as const)(
  "routes Admin %s %s through the trusted lifecycle RPC",
  async (catalog, operation, rpcName, active, success) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      id: 601,
      applicationRole: "admin",
    } as never);
    const form = new FormData();
    form.set("catalog", catalog);
    form.set("operation", operation);
    form.set("id", "14");
    expect((await changeCatalog(previous, form)).success).toBe(success);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_id: 14,
      p_is_active: active,
    });
  },
);

it("validates and routes Event location catalog mutations", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const locationForm = (operation: string, name = "  CCSB 1.032  ") => {
    const data = new FormData();
    data.set("catalog", "event_location");
    data.set("operation", operation);
    data.set("id", "17");
    data.set("name", name);
    return data;
  };
  expect((await changeCatalog(previous, locationForm("create"))).success).toBe(
    "Event location added",
  );
  expect(rpc).toHaveBeenCalledWith("create_event_location", {
    p_name: "CCSB 1.032",
  });
  await changeCatalog(previous, locationForm("rename", "CCSB 1.033"));
  expect(rpc).toHaveBeenLastCalledWith("rename_event_location", {
    p_id: 17,
    p_name: "CCSB 1.033",
  });
  await changeCatalog(previous, locationForm("delete"));
  expect(rpc).toHaveBeenLastCalledWith("delete_event_location", {
    p_id: 17,
  });
});

it("rejects invalid Event location mutations before the trusted RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  const data = new FormData();
  data.set("catalog", "event_location");
  data.set("operation", "rename");
  data.set("id", "17x");
  data.set("name", " Valid location ");
  expect((await changeCatalog(previous, data)).error).toBe("Invalid location");
  expect(rpc).not.toHaveBeenCalled();
});

it("denies Event location catalog mutations for non-admins", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 603,
    applicationRole: "officer",
  } as never);
  const data = new FormData();
  data.set("catalog", "event_location");
  data.set("operation", "create");
  data.set("name", "New room");
  expect((await changeCatalog(previous, data)).error).toBe("Admin required");
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  "/officers?q=alex&branch=2",
  undefined,
  "https://evil.example",
  "//evil.example",
  "/officers?q=%",
])("Officer edit validates submitted return context: %s", async (returnTo) => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 601,
    applicationRole: "admin",
  } as never);
  rpc.mockResolvedValue({ data: 602, error: null });
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id: "602",
    name: "Alex",
    utep_email: "alex@example.edu",
    position_id: "4",
    status: "active",
  }))
    data.set(key, value);
  if (returnTo) data.set("returnTo", returnTo);
  await saveOfficer({ error: "", success: "" }, data);
  expect(redirect).toHaveBeenCalledWith(
    returnTo?.startsWith("/officers?q=alex")
      ? "/officers/602?returnTo=%2Fofficers%3Fq%3Dalex%26branch%3D2&feedback=officer-saved"
      : "/officers/602?feedback=officer-saved",
  );
});

it("return context grants no Officer save permission", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 603,
    applicationRole: "officer",
  } as never);
  const data = new FormData();
  data.set("returnTo", "/officers?status=active");
  expect((await saveOfficer({ error: "", success: "" }, data)).error).toBe(
    "Admin required",
  );
  expect(rpc).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
