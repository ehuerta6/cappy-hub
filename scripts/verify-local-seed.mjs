import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

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

const container =
  process.env.CAPPY_TEST_DB_CONTAINER ?? "supabase_db_cappy-hub";
const seed = await readFile("supabase/seed.sql", "utf8");

console.log("Loading synthetic seed into the empty local database...");
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
      "  and not exists (select 1 from public.point_transactions p where p.task_id=a.task_id and p.officer_id=a.officer_id and p.award_type='task')),",
      "(select count(*) from public.notifications),",
      "(select count(distinct kind) from public.notifications),",
      "(select count(*) from public.event_notification_targets),",
      "(select count(*) from public.task_notification_targets),",
      "(select count(*) from public.event_reminder_offsets),",
      "(select count(*) from public.task_reminder_offsets),",
      "(select count(*) from public.tasks where due_time is not null),",
      "(select count(*) from public.notifications where read_at is null),",
      "(select count(*) from public.notifications where read_at is not null),",
      "(select count(*) from public.notifications where recipient_officer_id=-1011),",
      "(select count(*) from public.notifications where reviewed_at is not null),",
      "(select count(*) from public.tasks where id between -8311 and -8301 and recurrence_series_id is not null),",
      "(select count(distinct recurrence_series_id) from public.events where recurrence_series_id in (-2201,-2202,-2203)),",
      "(select count(*) from public.officers where id between -1207 and -1201),",
      "(select count(*) from public.events where id between -2063 and -2060),",
      "(select count(*) from public.event_officers where event_id=-2060 and participation_type in ('volunteer','attendee')) ,",
      "(select count(*) from public.point_transactions p join public.event_officers eo on eo.event_id=p.event_id and eo.officer_id=p.officer_id where p.event_id=-2060 and p.award_type='participation' and p.removed_at is null and ((eo.participation_type='volunteer' and p.points=4) or (eo.participation_type='attendee' and p.points=2))),",
      "(select count(*) from public.point_transactions where id between -4583 and -4511 and award_type='negative'),",
      "(select count(*) from public.point_transactions where id=-4583 and removed_at is not null),",
      "(select count(distinct event_id) from public.point_transactions where id in (-4583,-4571)),",
      "(select count(*) from public.officer_warnings where id=-3207 and deleted_at is not null and deleted_by=-1001),",
      "(select count(*) from public.officer_warnings where officer_id=-1205 and status='approved' and voided_at is null and deleted_at is null),",
      "(select count(*) from public.officer_warnings where id between -3210 and -3201 and origin in ('manual','automatic')),",
      "(select count(*) from public.automatic_warning_point_links where warning_id in (-3201,-3202,-3203,-3209) and released_at is null),",
      "(select count(*) from public.notifications where kind='warning.threshold' and entity_id=-3209);",
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
  notifications,
  notificationKinds,
  eventAudienceRules,
  taskAudienceRules,
  eventReminders,
  taskReminders,
  tasksWithDueTime,
  unreadNotifications,
  readNotifications,
  inactiveOfficerNotifications,
  reviewedNotifications,
  recurringTaskOccurrences,
  recurringEventScopes,
  issue402Officers,
  issue402Events,
  issue402ParticipationTypes,
  issue402EventAwards,
  issue402NegativePoints,
  issue402RemovedPositiveAward,
  issue402MissedCommitmentEvents,
  issue402DeletedWarning,
  issue402FreedSlotWarnings,
  issue402Warnings,
  issue402ActiveWarningLinks,
  issue402ThresholdNotices,
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
if (
  issue402Officers !== 7 ||
  issue402Events !== 4 ||
  issue402ParticipationTypes < 2 ||
  issue402EventAwards !== 2 ||
  issue402NegativePoints < 18 ||
  issue402RemovedPositiveAward !== 1 ||
  issue402MissedCommitmentEvents !== 2 ||
  issue402DeletedWarning !== 1 ||
  issue402FreedSlotWarnings !== 2 ||
  issue402Warnings !== 10 ||
  issue402ActiveWarningLinks !== 12 ||
  issue402ThresholdNotices < 1
) {
  throw new Error(
    `Issue #402 seed verification failed: officers=${issue402Officers}, events=${issue402Events}, signupTypes=${issue402ParticipationTypes}, eventAwards=${issue402EventAwards}, negativePoints=${issue402NegativePoints}, removedPositiveAward=${issue402RemovedPositiveAward}, deletedWarning=${issue402DeletedWarning}, freedSlotWarnings=${issue402FreedSlotWarnings}, warnings=${issue402Warnings}, activeWarningLinks=${issue402ActiveWarningLinks}, thresholdNotices=${issue402ThresholdNotices}`,
  );
}
if (
  notifications < 15 ||
  notificationKinds < 13 ||
  eventAudienceRules < 5 ||
  taskAudienceRules < 5 ||
  eventReminders < 5 ||
  taskReminders < 5 ||
  tasksWithDueTime < 1 ||
  unreadNotifications < 1 ||
  readNotifications < 1 ||
  reviewedNotifications < 1 ||
  recurringTaskOccurrences !== 7 ||
  recurringEventScopes !== 3 ||
  inactiveOfficerNotifications !== 0
) {
  throw new Error(
    `Notification seed verification failed: notifications=${notifications}, kinds=${notificationKinds}, eventAudiences=${eventAudienceRules}, taskAudiences=${taskAudienceRules}, eventReminders=${eventReminders}, taskReminders=${taskReminders}, tasksWithDueTime=${tasksWithDueTime}, unread=${unreadNotifications}, read=${readNotifications}, reviewed=${reviewedNotifications}, recurringTaskOccurrences=${recurringTaskOccurrences}, recurringEventScopes=${recurringEventScopes}, inactiveRecipient=${inactiveOfficerNotifications}`,
  );
}

console.log(
  `Synthetic seed verified: ${officers} officers, ${events} events, ${points} point transactions, ${warnings} warnings, ${timeSlots} Time Slots, ${slotSelections} slot selections, ${notifications} notifications, and ${notificationKinds} notification kinds; includes active and removed slot awards, custom capacities, recurring Event/Task reminder scopes, read/reviewed notification examples, and all Issue #402 participation, negative Point, and Warning fixtures.`,
);
