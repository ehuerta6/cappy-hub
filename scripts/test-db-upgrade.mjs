import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Deliberately no URL/linked-project option: resets ONLY the local development DB.
const cli = (args) =>
  execFileSync("node_modules/.bin/supabase", args, { stdio: "inherit" });
try {
  cli(["db", "reset", "--local", "--no-seed", "--version", "20260927170954"]);
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
    {
      input: readFileSync("supabase/fixtures/pr1-poc.sql"),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  cli(["migration", "up", "--local"]);
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
