import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import {
  revalidateCatalogPaths,
  revalidateEventPaths,
  revalidateNotificationPaths,
  revalidateOfficerPaths,
  revalidatePeriodPaths,
  revalidatePointPaths,
  revalidateTaskPaths,
} from "@/lib/revalidation";

describe("domain revalidation helpers", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
  });

  it("revalidates ProtectedLayout and event detail routes for event mutations", () => {
    revalidateEventPaths(42);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/events");
    expect(revalidatePath).toHaveBeenCalledWith("/events/42");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("revalidates ProtectedLayout and task detail routes for task mutations", () => {
    revalidateTaskPaths(15);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks/15");
    expect(revalidatePath).toHaveBeenCalledWith("/events/[id]", "page");
  });

  it("revalidates ProtectedLayout for point, officer, notification, and period mutations", () => {
    revalidatePointPaths(7);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/points");
    expect(revalidatePath).toHaveBeenCalledWith("/officers/7");

    vi.mocked(revalidatePath).mockReset();
    revalidateOfficerPaths(9);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/officers");
    expect(revalidatePath).toHaveBeenCalledWith("/officers/9");

    vi.mocked(revalidatePath).mockReset();
    revalidateNotificationPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");

    vi.mocked(revalidatePath).mockReset();
    revalidatePeriodPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps catalog revalidation scoped without purging the root layout", () => {
    revalidateCatalogPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/officers/catalogs");
    expect(revalidatePath).toHaveBeenCalledWith("/officers");
    expect(revalidatePath).toHaveBeenCalledWith("/events");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });
});
