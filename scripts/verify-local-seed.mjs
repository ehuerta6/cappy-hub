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
      "(select count(*) from public.event_time_slots),",
      "(select count(*) from public.event_time_slot_officers),",
      "(select count(*) from public.point_transactions where event_time_slot_id is not null and award_type='participation' and removed_at is null),",
      "(select count(*) from public.point_transactions where event_time_slot_id is not null and slot_selection_removed),",
      "(select count(*) from public.event_time_slots where event_id=-2020 and capacity is not null),",
      "(select count(*) from public.event_time_slots where event_id in (-2030,-2031)),",
      "(select count(distinct event_id) from public.event_time_slots where event_id in (-2030,-2031)),",
      "(select count(*) from public.events e where e.max_volunteers is not null and exists(select 1 from public.event_time_slots s where s.event_id=e.id)),",
      "(select max_volunteers from public.events where id=-2025),",
      "(select count(*) from public.event_time_slots s where s.event_id=-2021 and s.starts_at > (select max(previous_slot.ends_at) from public.event_time_slots previous_slot where previous_slot.event_id=s.event_id and previous_slot.ends_at<s.starts_at)),",
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
  timeSlots,
  slotSelections,
  activeSlotAwards,
  removedSlotAwards,
  equalSlotCapacities,
  recurringSlots,
  recurringSlotEvents,
  slottedEventCapacities,
  ordinaryEventCapacity,
  customSlotGaps,
  unassignedTask,
  singleOfficerTask,
  multiOfficerTask,
  completedInMultiTask,
  pastTaskAward,
  pastNotCompletedNoAward,
] = output.split("|").map((value) => Number(value));

if (
  officers < 30 ||
  events < 20 ||
  points < 320 ||
  warnings < 10 ||
  timeSlots < 14 ||
  slotSelections < 18 ||
  activeSlotAwards < 4 ||
  removedSlotAwards < 1 ||
  equalSlotCapacities !== 2 ||
  recurringSlots !== 4 ||
  recurringSlotEvents !== 2 ||
  slottedEventCapacities !== 0 ||
  ordinaryEventCapacity !== 3 ||
  customSlotGaps < 1
) {
  throw new Error(
    `Seed verification failed: officers=${officers}, events=${events}, points=${points}, warnings=${warnings}, slots=${timeSlots}, selections=${slotSelections}, activeSlotAwards=${activeSlotAwards}, removedSlotAwards=${removedSlotAwards}, equalSlotCapacities=${equalSlotCapacities}, recurringSlots=${recurringSlots}, recurringSlotEvents=${recurringSlotEvents}, slottedEventCapacities=${slottedEventCapacities}, ordinaryEventCapacity=${ordinaryEventCapacity}, customSlotGaps=${customSlotGaps}`,
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
  `Synthetic seed verified: ${officers} officers, ${events} events, ${points} point transactions, ${warnings} warnings, ${timeSlots} Time Slots, ${slotSelections} slot selections; includes separate active and removed slot awards, equal and custom capacities, recurring occurrences, and the existing Task scenarios.`,
);
