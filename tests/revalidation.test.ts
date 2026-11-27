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

describe("granular revalidation helpers", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
  });

  it("revalidates event routes without purging the root layout", () => {
    revalidateEventPaths(42);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/events");
    expect(revalidatePath).toHaveBeenCalledWith("/events/42");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates task routes without purging the root layout", () => {
    revalidateTaskPaths(15);
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks/15");
    expect(revalidatePath).toHaveBeenCalledWith("/events/[id]", "page");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates point, officer, notification, and catalog routes granularly", () => {
    revalidatePointPaths(7);
    expect(revalidatePath).toHaveBeenCalledWith("/points");
    expect(revalidatePath).toHaveBeenCalledWith("/officers/7");

    vi.mocked(revalidatePath).mockReset();
    revalidateOfficerPaths(9);
    expect(revalidatePath).toHaveBeenCalledWith("/officers");
    expect(revalidatePath).toHaveBeenCalledWith("/officers/9");

    vi.mocked(revalidatePath).mockReset();
    revalidateNotificationPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");

    vi.mocked(revalidatePath).mockReset();
    revalidateCatalogPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/officers/catalogs");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates the root layout only for academic period changes", () => {
    revalidatePeriodPaths();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
