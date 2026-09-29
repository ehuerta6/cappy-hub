import { describe, expect, it } from "vitest";
import { denverParts, denverTimestamp } from "@/lib/event-time";
import { formatDateTime } from "@/lib/presentation";

describe("El Paso event times", () => {
  it("converts summer and winter local times to distinct UTC offsets", () => {
    expect(denverTimestamp("2026-09-29", "06:00")).toBe(
      "2026-09-29T12:00:00.000Z",
    );
    expect(denverTimestamp("2026-12-29", "06:00")).toBe(
      "2026-12-29T13:00:00.000Z",
    );
  });
  it("round trips the selected local date and time", () => {
    const value = denverTimestamp("2026-09-29", "23:59");
    expect(value && denverParts(value)).toEqual({
      date: "2026-09-29",
      time: "23:59",
    });
  });
  it("rejects invalid or nonexistent local time", () => {
    expect(denverTimestamp("2026-03-08", "02:30")).toBeNull();
    expect(denverTimestamp("2026-09-29", "25:00")).toBeNull();
  });
  it("displays an event in El Paso local time", () => {
    expect(formatDateTime("2026-09-29T22:00:00Z")).toContain("4:00");
  });
});
