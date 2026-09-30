import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const PROJECT_ID = "cappy-hub";

function run(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture
      ? "pipe"
      : options.input
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
    input: options.input,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `docker ${args.join(" ")} failed with exit code ${result.status}${
        output ? `\n${output}` : ""
      }`,
    );
  }

  return result.stdout ?? "";
}

const container = `supabase_db_${PROJECT_ID}`;
const seed = await readFile("supabase/seed.sql", "utf8");

console.log("Loading synthetic seed into disposable CI database...");
run(
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: seed },
);

const output = run(
  [
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-c",
    [
      "select",
      "(select count(*) from public.officers),",
      "(select count(*) from public.events),",
      "(select count(*) from public.point_transactions),",
      "(select count(*) from public.officer_warnings);",
    ].join(" "),
  ],
  { capture: true },
).trim();

const [officers, events, points, warnings] = output
  .split("|")
  .map((value) => Number(value));

if (officers < 20 || events < 10 || points < 250 || warnings < 6) {
  throw new Error(
    `Seed verification failed: officers=${officers}, events=${events}, points=${points}, warnings=${warnings}`,
  );
}

console.log(
  `Synthetic seed verified: ${officers} officers, ${events} events, ${points} point transactions, ${warnings} warnings.`,
);
