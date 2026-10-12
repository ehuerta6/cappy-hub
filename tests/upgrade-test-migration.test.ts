import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { migrationSqlForUpgradeTest } from "../scripts/upgrade-test-migration.mjs";

it("omits Event cron registration only in the historical upgrade replay", () => {
  const migrationName = "20260928225832_automatic_participation.sql";
  const productionMigration = readFileSync(
    `supabase/migrations/${migrationName}`,
    "utf8",
  );
  const replaySql = migrationSqlForUpgradeTest(
    migrationName,
    productionMigration,
  );

  expect(productionMigration).toContain(
    "cron.schedule('cappy-process-finished-events'",
  );
  expect(replaySql).not.toContain(
    "cron.schedule('cappy-process-finished-events'",
  );
  expect(replaySql).toContain(
    "create function private.process_finished_events()",
  );
  expect(replaySql).toContain(
    "update public.events set participation_points_per_hour_at_end = current_rate",
  );

  expect(
    migrationSqlForUpgradeTest("another_migration.sql", productionMigration),
  ).toBe(productionMigration);
});
