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
