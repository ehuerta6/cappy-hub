import { describe, expect, it } from "vitest";
import {
  parseMigrationList,
  validateMigrationHistory,
} from "../scripts/production-migration-history.mjs";

const first = "20260101000000";
const second = "20260102000000";
const third = "20260103000000";
const productionOnly = "20260104000000";

function unicodeRow(local: string, remote: string) {
  return `│ ${local.padEnd(14)} │ ${remote.padEnd(14)} │`;
}

function asciiRow(local: string, remote: string) {
  return `| ${local.padEnd(14)} | ${remote.padEnd(14)} |`;
}

describe("parseMigrationList", () => {
  it("parses Unicode table output and ignores headers, separators, blanks, and status text", () => {
    const output = [
      "Connecting to remote database...",
      "┌────────────────┬────────────────┐",
      unicodeRow("LOCAL", "REMOTE"),
      "├────────────────┼────────────────┤",
      unicodeRow(first, first),
      unicodeRow(second, second),
      "└────────────────┴────────────────┘",
      "",
      "Finished supabase migration list.",
    ].join("\n");

    const parsed = parseMigrationList(output);

    expect(parsed.listedLocal).toEqual(new Set([first, second]));
    expect(parsed.remoteMigrations).toEqual(new Set([first, second]));
  });

  it("parses ASCII table output and ignores ASCII separator rows", () => {
    const output = [
      "Connecting to remote database...",
      "+----------------+----------------+",
      asciiRow("LOCAL", "REMOTE"),
      "+----------------+----------------+",
      asciiRow(first, first),
      asciiRow(second, second),
      "+----------------+----------------+",
    ].join("\n");

    const parsed = parseMigrationList(output);

    expect(parsed.listedLocal).toEqual(new Set([first, second]));
    expect(parsed.remoteMigrations).toEqual(new Set([first, second]));
  });

  it("rejects malformed migration rows", () => {
    expect(() => parseMigrationList(asciiRow("not-a-version", first))).toThrow(
      "unrecognized row",
    );
  });
});

describe("validateMigrationHistory", () => {
  it("accepts aligned histories when full alignment is required", () => {
    const parsed = parseMigrationList(
      [
        asciiRow("LOCAL", "REMOTE"),
        asciiRow(first, first),
        asciiRow(second, second),
        asciiRow(third, third),
      ].join("\n"),
    );

    expect(() =>
      validateMigrationHistory(
        [first, second, third],
        parsed.listedLocal,
        parsed.remoteMigrations,
        true,
      ),
    ).not.toThrow();
  });

  it("accepts a valid production prefix unless full alignment is required", () => {
    const parsed = parseMigrationList(
      [
        asciiRow("LOCAL", "REMOTE"),
        asciiRow(first, first),
        asciiRow(second, second),
        asciiRow(third, ""),
      ].join("\n"),
    );

    expect(() =>
      validateMigrationHistory(
        [first, second, third],
        parsed.listedLocal,
        parsed.remoteMigrations,
      ),
    ).not.toThrow();
    expect(() =>
      validateMigrationHistory(
        [first, second, third],
        parsed.listedLocal,
        parsed.remoteMigrations,
        true,
      ),
    ).toThrow("not aligned");
  });

  it("rejects production-only migrations", () => {
    const parsed = parseMigrationList(
      [
        asciiRow("LOCAL", "REMOTE"),
        asciiRow(first, first),
        asciiRow(second, second),
        asciiRow("", productionOnly),
      ].join("\n"),
    );

    expect(() =>
      validateMigrationHistory(
        [first, second],
        parsed.listedLocal,
        parsed.remoteMigrations,
      ),
    ).toThrow(`Production-only versions: ${productionOnly}`);
  });

  it("rejects gaps in production migration history", () => {
    const parsed = parseMigrationList(
      [
        asciiRow("LOCAL", "REMOTE"),
        asciiRow(first, first),
        asciiRow(second, third),
        asciiRow(third, ""),
      ].join("\n"),
    );

    expect(() =>
      validateMigrationHistory(
        [first, second, third],
        parsed.listedLocal,
        parsed.remoteMigrations,
      ),
    ).toThrow("Production history is not a prefix");
  });
});
