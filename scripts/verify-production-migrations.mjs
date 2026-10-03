import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

const databasePassword = process.env.SUPABASE_DB_PASSWORD;
if (!databasePassword) {
  throw new Error("SUPABASE_DB_PASSWORD is required.");
}

const result = spawnSync(
  "npx",
  ["supabase", "migration", "list", "--linked", "--password", databasePassword],
  { encoding: "utf8" },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  throw new Error(
    `supabase migration list failed with exit code ${result.status}.`,
  );
}

const listedLocal = new Set();
const remoteMigrations = new Set();
const output = result.stdout.replace(/\u001b\[[0-9;]*m/g, "");
for (const line of output.split(/\r?\n/)) {
  const columns = line.split("│");
  if (columns.length < 2) continue;

  const localVersion = columns[0].trim();
  const remoteVersion = columns[1].trim();
  if (localVersion === "LOCAL" && remoteVersion === "REMOTE") continue;
  if (!localVersion && !remoteVersion) continue;
  if (/^[─┼]+$/.test(localVersion) || /^[─┼]+$/.test(remoteVersion)) continue;
  if (
    (localVersion && !/^\d{14}$/.test(localVersion)) ||
    (remoteVersion && !/^\d{14}$/.test(remoteVersion))
  ) {
    throw new Error(`Could not parse Supabase migration list row: ${line}`);
  }

  if (localVersion) listedLocal.add(localVersion);
  if (remoteVersion) remoteMigrations.add(remoteVersion);
}

const unexpectedLocal = [...listedLocal].filter(
  (version) => !localMigrations.includes(version),
);
const unlistedLocal = localMigrations.filter(
  (version) => !listedLocal.has(version),
);
if (unexpectedLocal.length || unlistedLocal.length) {
  throw new Error(
    [
      "Supabase migration list did not match supabase/migrations/.",
      unexpectedLocal.length &&
        `Unexpected local versions: ${unexpectedLocal.join(", ")}`,
      unlistedLocal.length &&
        `Unlisted local versions: ${unlistedLocal.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const sortedRemoteMigrations = [...remoteMigrations].sort();
const remoteOnly = sortedRemoteMigrations.filter(
  (version) => !localMigrations.includes(version),
);
const missingHistory = sortedRemoteMigrations.some((version, index) => {
  const expected = localMigrations[index];
  return version !== expected;
});
if (remoteOnly.length || missingHistory) {
  throw new Error(
    [
      "Production migration history has drifted from supabase/migrations/.",
      remoteOnly.length && `Production-only versions: ${remoteOnly.join(", ")}`,
      missingHistory &&
        "Production history is not a prefix of the local migration history.",
      "Stop and reconcile with a maintainer; do not repair migration history automatically.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

if (
  process.argv.includes("--require-aligned") &&
  remoteMigrations.size !== localMigrations.length
) {
  throw new Error(
    "Production migration history is not aligned after db push. Stop before deploying the application.",
  );
}

console.log(
  `Production migration history ${
    remoteMigrations.size === localMigrations.length
      ? "is aligned"
      : "is a valid prefix"
  } (${remoteMigrations.size}/${localMigrations.length} migrations).`,
);
