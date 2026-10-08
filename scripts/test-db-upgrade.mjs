import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

process.env.SUPABASE_TELEMETRY_DISABLED = "true";

// Deliberately no URL/linked-project option: resets ONLY the local development DB.
const cli = (args) =>
  execFileSync("node_modules/.bin/supabase", args, { stdio: "inherit" });
const psql = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_cappy-hub",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "inherit", "inherit"] },
  );
const capturePsql = (sql) => {
  try {
    return {
      status: 0,
      stdout: execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_cappy-hub",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8" },
      ),
      stderr: "",
    };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
};
try {
  // Build the recorded old schema with live data, then replay each migration
  // to the production predecessor before adding data that requires untimed
  // Events. Apply the exact candidate migration last to test the real upgrade.
  cli(["db", "reset", "--local", "--no-seed", "--version", "20260927170954"]);
  psql(readFileSync("supabase/fixtures/pr1-poc.sql"));
  const migrations = readdirSync("supabase/migrations")
    .filter(
      (file) =>
        file.endsWith(".sql") &&
        file.slice(0, 14) > "20260927170954" &&
        file.slice(0, 14) < "20261001060843",
    )
    .sort();
  for (const migration of migrations) {
    psql(readFileSync(`supabase/migrations/${migration}`));
  }
  psql(readFileSync("supabase/fixtures/pre-simplify-untimed.sql"));
  psql(readFileSync("supabase/migrations/20261001060843_simplify_events.sql"));
  const followupMigrations = readdirSync("supabase/migrations")
    .filter(
      (file) => file.endsWith(".sql") && file.slice(0, 14) > "20261001060843",
    )
    .sort();
  for (const migration of followupMigrations) {
    if (migration.endsWith("_stable_officer_actor_attribution.sql")) {
      psql(
        readFileSync("supabase/fixtures/pre-stable-officer-attribution.sql"),
      );
    }
    if (migration === "20261003042248_recurring_series_scopes.sql") {
      psql(readFileSync("supabase/fixtures/pre-series-scopes.sql"));
    }
    if (migration === "20261004000000_task_officer_completion_workflow.sql") {
      psql(readFileSync("supabase/fixtures/pre-task-officer-assignments.sql"));
    }
    if (
      migration ===
      "20261007120000_remove_legacy_task_assignment_projection.sql"
    ) {
      psql(readFileSync("supabase/fixtures/pre-task-assignment-contract.sql"));
    }
    if (migration.endsWith("_harden_catalogs_lifecycle_and_rls.sql")) {
      psql(`create table upgrade_fixture.pre_hardening_events as select to_jsonb(e) row from public.events e;
        create table upgrade_fixture.pre_hardening_points as select to_jsonb(p) row from public.point_transactions p;
        create table upgrade_fixture.pre_hardening_branches as select to_jsonb(b) row from public.branches b;
        create table upgrade_fixture.pre_hardening_positions as select to_jsonb(p) row from public.positions p;
        create table upgrade_fixture.pre_hardening_event_types as select to_jsonb(t) row from public.event_types t;`);
    }
    if (migration === "20261007000000_position_machine_identity.sql") {
      psql(`create table upgrade_fixture.pre_position_machine_positions as
        select to_jsonb(p) row from public.positions p;
        create table upgrade_fixture.pre_position_machine_officers as
        select id, position_id from public.officers;`);
    }
    if (migration === "20261008000000_one_active_primary_event_award.sql") {
      const original = capturePsql(
        "select to_jsonb(p)::text from public.point_transactions p where id=90001;",
      );
      if (original.status !== 0 || !original.stdout.trim()) {
        throw new Error("Could not capture the preflight history fixture");
      }
      psql(`insert into public.point_transactions
        (id,officer_id,event_id,points,reason,award_type)
        values (-180180,90001,90001,1,'Migration preflight conflict','manual');`);

      const beforeRejectedMigration = capturePsql(
        "select jsonb_agg(to_jsonb(p) order by p.id)::text from public.point_transactions p where p.id in (90001,-180180);",
      );
      const rejectedMigration = capturePsql(
        readFileSync(`supabase/migrations/${migration}`, "utf8"),
      );
      const rejection = `${rejectedMigration.stdout}\n${rejectedMigration.stderr}`;
      if (
        rejectedMigration.status === 0 ||
        !rejection.includes("Cannot enforce one active primary Event award") ||
        !rejection.includes("Officer 90001, Event 90001") ||
        !rejection.includes("-180180")
      ) {
        throw new Error(
          `Expected migration preflight to name the conflicting Officer, Event and transaction IDs. Output:\n${rejection}`,
        );
      }
      const afterRejectedMigration = capturePsql(
        "select jsonb_agg(to_jsonb(p) order by p.id)::text from public.point_transactions p where p.id in (90001,-180180);",
      );
      if (
        beforeRejectedMigration.status !== 0 ||
        afterRejectedMigration.status !== 0 ||
        beforeRejectedMigration.stdout.trim() !==
          afterRejectedMigration.stdout.trim()
      ) {
        throw new Error(
          "Rejected migration preflight changed conflicting Point history",
        );
      }
      const originalAfterFailure = capturePsql(
        "select to_jsonb(p)::text from public.point_transactions p where id=90001;",
      );
      if (original.stdout.trim() !== originalAfterFailure.stdout.trim()) {
        throw new Error(
          "Rejected migration preflight modified an existing Point transaction",
        );
      }
      psql("delete from public.point_transactions where id=-180180;");
    }
    psql(readFileSync(`supabase/migrations/${migration}`));
  }
  cli([
    "test",
    "db",
    "--local",
    "supabase/upgrade-tests/preservation.test.sql",
  ]);
} finally {
  // Restore a clean latest local schema even if an assertion fails.
  cli(["db", "reset", "--local", "--no-seed"]);
}
