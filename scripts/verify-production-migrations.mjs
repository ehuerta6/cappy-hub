import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  parseMigrationList,
  validateMigrationHistory,
} from "./production-migration-history.mjs";

const migrationsDirectory = "supabase/migrations";
const localMigrations = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => {
    const match = /^(\d{14})_.+\.sql$/.exec(file);
    if (!match) {
      throw new Error(`Unexpected migration filename: ${file}`);
    }
    return match[1];
  })
  .sort();

if (new Set(localMigrations).size !== localMigrations.length) {
  throw new Error("Duplicate migration versions found in supabase/migrations.");
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  throw new Error("SUPABASE_DB_URL is required.");
}

const result = spawnSync(
  "npx",
  ["supabase", "migration", "list", "--db-url", databaseUrl],
  { encoding: "utf8" },
);

if (result.error) {
  throw new Error(
    "Could not run Supabase CLI to list production migration history.",
  );
}
if (result.status !== 0) {
  throw new Error(
    `supabase migration list failed with exit code ${result.status}.`,
  );
}

const { listedLocal, remoteMigrations } = parseMigrationList(result.stdout);
validateMigrationHistory(
  localMigrations,
  listedLocal,
  remoteMigrations,
  process.argv.includes("--require-aligned"),
);

console.log(
  `Production migration history ${
    remoteMigrations.size === localMigrations.length
      ? "is aligned"
      : "is a valid prefix"
  } (${remoteMigrations.size}/${localMigrations.length} migrations).`,
);
