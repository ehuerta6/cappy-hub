import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const guardPath = resolve("scripts/check-destructive-migrations.mjs");
const workdirs: string[] = [];

afterEach(() => {
  for (const workdir of workdirs.splice(0)) {
    rmSync(workdir, { recursive: true, force: true });
  }
});

describe("new migration destructive-operation guard", () => {
  it.each([
    [
      "adds a nullable event column",
      "alter table public.events\n add column notes text;",
    ],
    [
      "creates an index",
      "create index events_name_idx on public.events (name);",
    ],
    [
      "adds and validates a constraint",
      "alter table public.events add constraint events_name_check check (name <> '') not valid;\nalter table public.events validate constraint events_name_check;",
    ],
    [
      "ignores comments, strings, and function-body examples",
      `-- DROP TABLE public.events;
/* old snippet:
 alter table public.events drop column name;
*/
alter table public.events
  add column note text default 'DROP TABLE public.events';
alter table public.events add column escaped_note text default E'example \\' DROP TABLE public.events';
do $example$ begin raise notice 'ALTER TABLE events DROP COLUMN name'; end $example$;`,
    ],
  ])("passes when a new migration %s", async (_description, sql) => {
    const result = runGuard({
      "supabase/migrations/20261004000000_safe_change.sql": sql,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no unapproved destructive operations");
  });

  it("passes when no migrations were added, even if an old immutable migration is destructive", () => {
    const result = runGuard({ "app/example.ts": "export const ok = true;" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No new migration files");
  });

  it.each([
    ["DROP COLUMN", "alter table public.events drop column location;"],
    ["DROP TABLE", "drop table if exists public.events cascade;"],
    [
      "RENAME COLUMN",
      "alter table public.events\n rename column starts_at to begins_at;",
    ],
    ["RENAME TABLE", "alter table public.events rename to club_events;"],
    [
      "RENAME VIEW",
      "alter view public.officer_point_totals rename to officer_totals;",
    ],
    [
      "RENAME VIEW FIELD",
      "alter view public.officer_point_totals rename column total to points;",
    ],
    [
      "RENAME RPC",
      "alter function public.save_event_with_links(bigint) rename to save_event;",
    ],
    [
      "ALTER COLUMN TYPE",
      "alter table public.events alter column event_date type timestamptz using event_date::timestamptz;",
    ],
    ["DROP VIEW", "drop view public.officer_point_totals;"],
    ["DROP FUNCTION", "drop function public.save_event_with_links(bigint);"],
  ])("reports a new %s with rollout guidance", (_operation, sql) => {
    const result = runGuard({
      "supabase/migrations/20261004000000_contract.sql": sql,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("20261004000000_contract.sql");
    expect(result.stderr).toContain("expand");
    expect(result.stderr).toContain(
      "-- cappy-hub: approve-destructive-migration",
    );
  });

  it("allows an explicitly approved destructive migration with a concrete rationale", () => {
    const result = runGuard({
      "supabase/migrations/20261004000000_contract.sql": `-- cappy-hub: approve-destructive-migration
-- reason: app stopped using events.location in PR #123 and a full production deployment passed
alter table public.events drop column location;`,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no unapproved destructive operations");
  });

  it.each([
    [
      "an empty rationale",
      "-- cappy-hub: approve-destructive-migration\n-- reason: \n",
    ],
    [
      "a short rationale",
      "-- cappy-hub: approve-destructive-migration\n-- reason: cleanup\n",
    ],
    [
      "the wrong header order",
      "-- reason: app rollout completed and this is a safe contract phase\n-- cappy-hub: approve-destructive-migration\n",
    ],
  ])("rejects destructive SQL with %s", (_description, metadata) => {
    const result = runGuard({
      "supabase/migrations/20261004000000_contract.sql": `${metadata}alter table public.events drop column location;`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "malformed destructive-migration approval metadata",
    );
    expect(result.stderr).toContain("DROP COLUMN");
  });
});

function runGuard(files: Record<string, string>) {
  const workdir = mkdtempSync(join(tmpdir(), "cappy-migration-guard-"));
  workdirs.push(workdir);
  execFileSync("git", ["init", "-b", "main"], { cwd: workdir });
  execFileSync("git", ["config", "user.name", "Migration guard tests"], {
    cwd: workdir,
  });
  execFileSync("git", ["config", "user.email", "migration-guard@example.org"], {
    cwd: workdir,
  });

  const oldMigration = join(
    workdir,
    "supabase/migrations/20200101000000_legacy.sql",
  );
  mkdirSync(join(workdir, "supabase/migrations"), { recursive: true });
  writeFileSync(oldMigration, "drop table public.old_events;\n");
  execFileSync("git", ["add", "supabase/migrations"], { cwd: workdir });
  execFileSync("git", ["commit", "-m", "base"], { cwd: workdir });
  const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: workdir,
    encoding: "utf8",
  }).trim();

  for (const [path, contents] of Object.entries(files)) {
    const target = join(workdir, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents);
  }
  execFileSync("git", ["add", "."], { cwd: workdir });

  return spawnSync(process.execPath, [guardPath], {
    cwd: workdir,
    env: { ...process.env, GITHUB_BASE_SHA: baseSha },
    encoding: "utf8",
  });
}
