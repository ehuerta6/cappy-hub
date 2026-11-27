import { describe, expect, it } from "vitest";
import {
  buildCsv,
  csvFilename,
  csvResponse,
  escapeCsvCell,
  fetchAllPages,
} from "@/lib/csv";

describe("CSV serialization and safety", () => {
  it("prepends a UTF-8 BOM and preserves accented names for Excel", () => {
    const csv = buildCsv(
      ["Name", "Email", "Classification", "Position"],
      [["José Peña", "jpena@miners.utep.edu", "Junior", "Lead"]],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe(
      "\uFEFFName,Email,Classification,Position\r\nJosé Peña,jpena@miners.utep.edu,Junior,Lead\r\n",
    );
  });

  it("escapes commas, double quotes, and line breaks per RFC 4180", () => {
    expect(escapeCsvCell('Hello, "World"')).toBe('"Hello, ""World"""');
    expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(escapeCsvCell("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
  });

  it("neutralizes spreadsheet formula injection in user-entered text cells", () => {
    expect(escapeCsvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-SUM(A1:A2)")).toBe("'-SUM(A1:A2)");
    expect(escapeCsvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell("\t=1+1")).toBe("'\t=1+1");
    expect(escapeCsvCell('  =HYPERLINK("https://evil.example")')).toBe(
      '"\'  =HYPERLINK(""https://evil.example"")"',
    );
  });

  it("keeps finite numeric values unprefixed while rendering null/undefined as empty", () => {
    expect(escapeCsvCell(-2.5)).toBe("-2.5");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(Number.NaN)).toBe("");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("builds safe dated filenames and no-store CSV responses", () => {
    expect(csvFilename("cappy-hub-officers", "2026-11-27")).toBe(
      "cappy-hub-officers-2026-11-27.csv",
    );
    expect(
      csvFilename("cappy-hub-event-roster", "2026-11-27", "Café & Coding #1!"),
    ).toBe("cappy-hub-event-roster-cafe-coding-1-2026-11-27.csv");

    const response = csvResponse("\uFEFFA\r\n1\r\n", "report.csv", 1);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Export-Row-Count")).toBe("1");
  });

  it("fetches every page and fails without returning partial rows on error", async () => {
    const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }]];
    let pageCalls = 0;
    const all = await fetchAllPages(async (from, to) => {
      const idx = pageCalls++;
      expect(to - from + 1).toBe(2);
      return { data: pages[idx] ?? [], error: null };
    }, 2);
    expect(all.map((row) => row.id)).toEqual([1, 2, 3, 4, 5]);

    await expect(
      fetchAllPages(async (from) => {
        if (from === 0) return { data: [{ id: 1 }, { id: 2 }], error: null };
        return { data: null, error: { message: "Database timeout" } };
      }, 2),
    ).rejects.toThrow("Database timeout");
  });
});
