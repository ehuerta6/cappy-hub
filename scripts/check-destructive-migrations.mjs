import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
  throw new Error(`Could not compare migrations with base ${baseSha}.`);
}

const changes = result.stdout.split("\0").filter(Boolean);
const migrations = [];
for (let index = 0; index < changes.length; index += 2) {
  const status = changes[index];
  const file = changes[index + 1];
  if (status === "A" && file.endsWith(".sql")) migrations.push(file);
}

if (migrations.length === 0) {
  console.log(
    "No new migration files to inspect; existing migrations were not scanned.",
  );
  process.exit(0);
}

const violations = [];
for (const file of migrations) {
  const sql = readFileSync(file, "utf8");
  const operations = findDestructiveOperations(sql);
  const approval = readApproval(sql);

  if (approval.present && !approval.valid) {
    violations.push(
      `${file}: malformed destructive-migration approval metadata`,
    );
  }
  if (operations.length > 0 && !approval.valid) {
    violations.push(...operations.map((operation) => `${file}: ${operation}`));
  }
}

if (violations.length > 0) {
  console.error(
    [
      "Potentially rollout-incompatible SQL was found in newly added migrations:",
      ...violations.map((violation) => `- ${violation}`),
      "",
      "Use expand → migrate/backfill → deploy compatible application → contract later so the running application remains compatible during rollout.",
      "For a reviewed contract-phase migration, put this header at the start of that migration and give a concrete rationale:",
      "-- cappy-hub: approve-destructive-migration",
      "-- reason: explain the completed transition and why this contract step is safe (at least 30 characters)",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `Checked ${migrations.length} new migration file(s); no unapproved destructive operations found.`,
);

function readApproval(sql) {
  const lines = sql.replace(/^\uFEFF/, "").split(/\r?\n/);
  const nonblankLines = lines.filter((line) => line.trim() !== "");
  const marker = "-- cappy-hub: approve-destructive-migration";
  const markerAnywhere = lines.some((line) => line.trim() === marker);
  if (!markerAnywhere) return { present: false, valid: false };

  const reasonPrefix = "-- reason:";
  const reason = nonblankLines[1];
  const rationale = reason?.startsWith(reasonPrefix)
    ? reason.slice(reasonPrefix.length).trim()
    : "";
  const valid =
    nonblankLines[0]?.trim() === marker &&
    reason?.startsWith(`${reasonPrefix} `) &&
    rationale.length >= 30;

  return { present: true, valid };
}

function findDestructiveOperations(sql) {
  const statements = tokenizeStatements(sql);
  const operations = [];
  for (const tokens of statements) {
    const words = tokens.map((token) => token.toLowerCase());
    if (hasSequence(words, ["drop", "column"])) {
      operations.push("DROP COLUMN");
    }
    if (hasSequence(words, ["drop", "table"])) {
      operations.push("DROP TABLE");
    }
    if (hasSequence(words, ["drop", "view"])) {
      operations.push("DROP VIEW (public view/API surface)");
    }
    if (hasSequence(words, ["drop", "function"])) {
      operations.push("DROP FUNCTION (may remove a public RPC)");
    }
    if (
      hasSequence(words, ["alter", "table"]) &&
      hasSequence(words, ["rename", "column"])
    ) {
      operations.push("ALTER TABLE ... RENAME COLUMN");
    } else if (
      hasSequence(words, ["alter", "table"]) &&
      hasSequence(words, ["rename", "to"])
    ) {
      operations.push("ALTER TABLE ... RENAME TO (table rename)");
    }
    if (
      hasSequence(words, ["alter", "table"]) &&
      hasSequence(words, ["alter", "column"]) &&
      hasSequence(words, ["type"])
    ) {
      operations.push("ALTER TABLE ... ALTER COLUMN ... TYPE");
    }
  }
  return [...new Set(operations)];
}

function hasSequence(tokens, sequence) {
  for (let index = 0; index <= tokens.length - sequence.length; index++) {
    if (sequence.every((token, offset) => tokens[index + offset] === token)) {
      return true;
    }
  }
  return false;
}

function tokenizeStatements(sql) {
  const statements = [];
  let tokens = [];
  let index = 0;
  const push = (token) => tokens.push(token);
  const finishStatement = () => {
    if (tokens.length > 0) statements.push(tokens);
    tokens = [];
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (/\s/.test(char)) {
      index++;
    } else if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index++;
    } else if (char === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth++;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth--;
          index += 2;
        } else {
          index++;
        }
      }
    } else if (char === "'") {
      const escapeString =
        /[eE]/.test(sql[index - 1] ?? "") &&
        (index < 2 || !/[A-Za-z_0-9$]/.test(sql[index - 2]));
      index = skipQuoted(sql, index, "'", escapeString);
      push("<string>");
    } else if (char === '"') {
      const quoted = readQuotedIdentifier(sql, index);
      index = quoted.end;
      push(quoted.value);
    } else if (char === "$" && /^\$[A-Za-z_0-9]*\$/.test(sql.slice(index))) {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)[0];
      const end = sql.indexOf(delimiter, index + delimiter.length);
      index = end === -1 ? sql.length : end + delimiter.length;
      push("<string>");
    } else if (/[A-Za-z_]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z_0-9$]/.test(sql[index])) index++;
      push(sql.slice(start, index).toLowerCase());
    } else if (char === ";") {
      finishStatement();
      index++;
    } else {
      push(char);
      index++;
    }
  }
  finishStatement();
  return statements;
}

function skipQuoted(sql, start, quote, backslashEscapes = false) {
  let index = start + 1;
  while (index < sql.length) {
    if (backslashEscapes && sql[index] === "\\") {
      index += 2;
    } else if (sql[index] === quote && sql[index + 1] === quote) {
      index += 2;
    } else if (sql[index] === quote) {
      return index + 1;
    } else {
      index++;
    }
  }
  return sql.length;
}

function readQuotedIdentifier(sql, start) {
  let index = start + 1;
  let value = "";
  while (index < sql.length) {
    if (sql[index] === '"' && sql[index + 1] === '"') {
      value += '"';
      index += 2;
    } else if (sql[index] === '"') {
      return { value: value.toLowerCase(), end: index + 1 };
    } else {
      value += sql[index++];
    }
  }
  return { value: value.toLowerCase(), end: sql.length };
}
