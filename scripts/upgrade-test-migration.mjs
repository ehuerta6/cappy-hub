const eventProcessorSchedule =
  /select cron\.schedule\(\s*'cappy-process-finished-events'\s*,\s*'\* \* \* \* \*'\s*,\s*'select private\.process_finished_events\(\)'\s*\);/g;

export function migrationSqlForUpgradeTest(migrationName, sql) {
  if (migrationName !== "20260928225832_automatic_participation.sql") {
    return sql;
  }

  const schedules = [...sql.matchAll(eventProcessorSchedule)];
  if (schedules.length !== 1) {
    throw new Error(
      `Expected one Event processor schedule in ${migrationName}, found ${schedules.length}`,
    );
  }

  // The preservation test invokes the processor explicitly. Suppress only its
  // minute schedule during historical replay so it cannot mutate fixture rows.
  return sql.replace(
    eventProcessorSchedule,
    "-- Event processor schedule omitted in historical upgrade test.",
  );
}
