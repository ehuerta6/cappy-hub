import { spawnSync } from "node:child_process";

const baseSha = process.env.GITHUB_BASE_SHA;
if (!baseSha || !/^[0-9a-f]{40}$/i.test(baseSha)) {
  throw new Error("GITHUB_BASE_SHA must be the PR base commit SHA.");
}

const result = spawnSync(
  "git",
  [
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    baseSha,
    "--",
    "supabase/migrations/",
  ],
  { encoding: "utf8" },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  throw new Error(`Could not compare migrations with PR base ${baseSha}.`);
}

const changes = result.stdout.split("\0").filter(Boolean);
const violations = [];
for (let index = 0; index < changes.length; index += 2) {
  const status = changes[index];
  const file = changes[index + 1];
  if (status !== "A") violations.push(`${status} ${file}`);
}

if (violations.length) {
  throw new Error(
    [
      "Existing migrations from the PR base are immutable.",
      ...violations,
      "Add a new migration for follow-up changes.",
    ].join("\n"),
  );
}

console.log(
  "No migration present in the PR base was modified, deleted, or renamed.",
);
