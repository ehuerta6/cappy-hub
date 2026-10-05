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
      "(select count(*) from public.officer_warnings),",
      "(select count(*) from public.tasks t where t.id=-8001 and not exists",
      "  (select 1 from public.task_officer_assignments a where a.task_id=t.id)),",
      "(select count(*) from public.task_officer_assignments where task_id=-8003),",
      "(select count(*) from public.task_officer_assignments where task_id=-8002),",
      "(select count(*) from public.task_officer_assignments where task_id=-8002 and completed_at is not null),",
      "(select count(*) from public.point_transactions where task_id=-8005 and officer_id=-1013 and award_type='task' and removed_at is null),",
      "(select count(*) from public.task_officer_assignments a where a.task_id=-8007 and a.completed_at is null",
      "  and not exists (select 1 from public.point_transactions p where p.task_id=a.task_id and p.officer_id=a.officer_id and p.award_type='task'));",
    ].join(" "),
  ],
  { capture: true },
).trim();

const [
  officers,
  events,
  points,
  warnings,
  unassignedTask,
  singleOfficerTask,
  multiOfficerTask,
  completedInMultiTask,
  pastTaskAward,
  pastNotCompletedNoAward,
] = output.split("|").map((value) => Number(value));

if (officers < 20 || events < 10 || points < 250 || warnings < 6) {
  throw new Error(
    `Seed verification failed: officers=${officers}, events=${events}, points=${points}, warnings=${warnings}`,
  );
}
if (
  unassignedTask !== 1 ||
  singleOfficerTask !== 1 ||
  multiOfficerTask !== 2 ||
  completedInMultiTask !== 1 ||
  pastTaskAward !== 1 ||
  pastNotCompletedNoAward !== 1
) {
  throw new Error(
    `Task seed verification failed: unassigned=${unassignedTask}, single=${singleOfficerTask}, multi=${multiOfficerTask}, completedInMulti=${completedInMultiTask}, pastAward=${pastTaskAward}, pastNotCompletedNoAward=${pastNotCompletedNoAward}`,
  );
}

console.log(
  `Synthetic seed verified: ${officers} officers, ${events} events, ${points} point transactions, ${warnings} warnings; Task examples include unassigned, single and multiple assignments, and due-date awards.`,
);
