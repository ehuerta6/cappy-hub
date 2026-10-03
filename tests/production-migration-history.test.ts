import { describe, expect, it } from "vitest";
import {
  parseMigrationList,
  validateMigrationHistory,
} from "../scripts/production-migration-history.mjs";

const first = "20260101000000";
const second = "20260102000000";
const third = "20260103000000";
const productionOnly = "20260104000000";

const asciiPrefix = `
  LOCAL            | REMOTE           | TIME (UTC)
 ------------------|------------------|-----------------------
  20260101000000   | 20260101000000   | 2026-01-01 00:00:00
  20260102000000   |                  | 2026-01-02 00:00:00
`;

const unicodePrefix = `
  LOCAL            │ REMOTE           │ TIME (UTC)
 ──────────────────┼──────────────────┼───────────────────────
  20260101000000   │ 20260101000000   │ 2026-01-01 00:00:00
  20260102000000   │                  │ 2026-01-02 00:00:00
`;

function validate(output: string, localMigrations: string[], aligned = false) {
  const parsed = parseMigrationList(output);
  validateMigrationHistory(
    localMigrations,
    parsed.listedLocal,
    parsed.remoteMigrations,
    aligned,
  );
}

describe("parseMigrationList", () => {
  it.each([
    ["ASCII", asciiPrefix],
    ["Unicode", unicodePrefix],
  ])("parses the unbordered three-column %s table", (_, output) => {
    const parsed = parseMigrationList(output);

    expect(parsed.listedLocal).toEqual(new Set([first, second]));
    expect(parsed.remoteMigrations).toEqual(new Set([first]));
  });

  it("ignores unrelated CLI status text before and after the table", () => {
    const parsed = parseMigrationList(`
Initialising login role...
Connecting to remote database...
${asciiPrefix}
A new version of Supabase CLI is available.
Try rerunning the command with --debug to troubleshoot the error.
`);

    expect(parsed.listedLocal).toEqual(new Set([first, second]));
    expect(parsed.remoteMigrations).toEqual(new Set([first]));
  });

  it("handles the installed CLI's title-case headers and code-span cells", () => {
    const output = [
      "   Local            | Remote           | Time (UTC)",
      "  ------------------|------------------|-----------------------",
      "   `20260101000000` | `20260101000000` | `2026-01-01 00:00:00`",
      "   `20260102000000` | ` `              | `2026-01-02 00:00:00`",
    ].join("\n");
    const parsed = parseMigrationList(output);

    expect(parsed.listedLocal).toEqual(new Set([first, second]));
    expect(parsed.remoteMigrations).toEqual(new Set([first]));
  });

  it("ignores the TIME column when extracting migration versions", () => {
    const parsed = parseMigrationList(`
LOCAL          | REMOTE         | TIME (UTC)
20260101000000 | 20260101000000 | ${productionOnly}
`);

    expect(parsed.listedLocal).toEqual(new Set([first]));
    expect(parsed.remoteMigrations).toEqual(new Set([first]));
  });

  it.each([
    "not-a-version  | 20260101000000 | 2026-01-01 00:00:00",
    "20260101000000 │ invalid        │ 2026-01-01 00:00:00",
    "2026010100000  | 20260101000000 | 2026-01-01 00:00:00",
    "20260101000000 | 20260101000000",
    "20260101000000 | 20260101000000 | 2026-01-01 00:00:00 | extra",
    "               |                | 2026-01-01 00:00:00",
  ])("rejects malformed migration row: %s", (row) => {
    expect(() =>
      parseMigrationList(`LOCAL | REMOTE | TIME (UTC)\n${row}`),
    ).toThrow("unrecognized row");
  });
});

describe("validateMigrationHistory", () => {
  it("accepts aligned histories when full alignment is required", () => {
    const output = `
LOCAL            | REMOTE           | TIME (UTC)
20260101000000   | 20260101000000   | 2026-01-01 00:00:00
20260102000000   | 20260102000000   | 2026-01-02 00:00:00
20260103000000   | 20260103000000   | 2026-01-03 00:00:00
`;

    expect(() => validate(output, [first, second, third], true)).not.toThrow();
  });

  it("accepts a valid production prefix unless full alignment is required", () => {
    expect(() => validate(asciiPrefix, [first, second])).not.toThrow();
    expect(() => validate(asciiPrefix, [first, second], true)).toThrow(
      "not aligned",
    );
  });

  it("rejects production-only migrations", () => {
    const output = `
LOCAL            | REMOTE           | TIME (UTC)
20260101000000   | 20260101000000   | 2026-01-01 00:00:00
20260102000000   | 20260102000000   | 2026-01-02 00:00:00
                 | 20260104000000   | 2026-01-04 00:00:00
`;

    expect(() => validate(output, [first, second])).toThrow(
      `Production-only versions: ${productionOnly}`,
    );
  });

  it("rejects gaps in production migration history", () => {
    const output = `
LOCAL            │ REMOTE           │ TIME (UTC)
20260101000000   │ 20260101000000   │ 2026-01-01 00:00:00
20260102000000   │                  │ 2026-01-02 00:00:00
20260103000000   │ 20260103000000   │ 2026-01-03 00:00:00
`;

    expect(() => validate(output, [first, second, third])).toThrow(
      "Production history is not a prefix",
    );
  });

  it("rejects local versions absent from the CLI list", () => {
    expect(() => validate(asciiPrefix, [first, second, third])).toThrow(
      `Unlisted local versions: ${third}`,
    );
  });

  it("rejects unexpected local versions in the CLI list", () => {
    expect(() => validate(asciiPrefix, [first])).toThrow(
      `Unexpected local versions: ${second}`,
    );
  });
});
