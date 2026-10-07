import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const databaseContainer = "supabase_db_cappy-hub";
const concurrentFixtureId = -9821801;

const psqlArgs = [
  "exec",
  "-i",
  databaseContainer,
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
];

function runSql(sql: string) {
  return execFileSync("docker", psqlArgs, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function startSql(sql: string) {
  const child = spawn("docker", psqlArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  const markerWaiters: Array<{
    marker: string;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    for (const waiter of markerWaiters) {
      if (output.includes(waiter.marker)) waiter.resolve();
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors += chunk.toString();
  });
  child.once("close", () => {
    for (const waiter of markerWaiters) {
      if (!output.includes(waiter.marker)) {
        waiter.reject(new Error(`psql exited before ${waiter.marker}`));
      }
    }
  });

  const closed = new Promise<{
    code: number | null;
    output: string;
    errors: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output, errors }));
  });

  child.stdin.end(sql);
  return {
    closed,
    waitFor(marker: string) {
      if (output.includes(marker)) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        markerWaiters.push({ marker, resolve, reject });
      });
    },
  };
}

it("enforces the MVP invariants and concurrent award uniqueness in local PostgreSQL", async () => {
  // Run real SQL assertions. A missing database or failed assertion fails npm test.
  execFileSync("node_modules/.bin/supabase", ["test", "db", "--local"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    timeout: 120_000,
  });

  runSql(`
    delete from public.point_transactions where officer_id=${concurrentFixtureId};
    delete from public.events where id=${concurrentFixtureId};
    delete from public.officers where id=${concurrentFixtureId};
    insert into public.officers(id,name,utep_email,position_id,status)
      values (${concurrentFixtureId},'Concurrent award fixture',
        'concurrent-award-fixture@example.test',
        (select id from public.positions where name='Officer'),'active');
    insert into public.events(id,name,description,location,event_type_id,event_date,
      starts_at,ends_at,status)
      values (${concurrentFixtureId},'Concurrent award fixture','Test event',
        'Concurrent award fixture location',
        (select id from public.event_types where name='Meeting'),
        date '2099-01-01','2099-01-01 09:00-07','2099-01-01 10:00-07','upcoming');
  `);

  try {
    const firstInsert = startSql(`
      begin;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type)
        values (${concurrentFixtureId},${concurrentFixtureId},1,'Concurrent first','manual');
      \\echo HOLDER_INSERTED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await firstInsert.waitFor("HOLDER_INSERTED");

    const competingInsertStartedAt = Date.now();
    const secondInsert = startSql(`
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type)
        values (${concurrentFixtureId},${concurrentFixtureId},2,'Concurrent second','manual');
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstInsert.closed,
      secondInsert.closed,
    ]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).not.toBe(0);
    expect(secondResult.errors).toContain(
      "one_active_primary_event_award_per_officer",
    );
    expect(Date.now() - competingInsertStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select count(*) from public.point_transactions where officer_id=${concurrentFixtureId} and event_id=${concurrentFixtureId};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.point_transactions where officer_id=${concurrentFixtureId};
      delete from public.events where id=${concurrentFixtureId};
      delete from public.event_locations where name='Concurrent award fixture location'
        and not exists (select 1 from public.events where location_id=public.event_locations.id);
      delete from public.officers where id=${concurrentFixtureId};
    `);
  }
}, 150_000);
