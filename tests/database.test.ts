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

it("serializes concurrent signup requests so capacity cannot be overfilled", async () => {
  const eventId = -981780;
  const managerId = "00000000-0000-4000-8000-000000009781";
  const firstOfficerId = -981781;
  const secondOfficerId = -981782;
  runSql(`
    delete from public.audit_logs where actor_officer_id in (${firstOfficerId},${secondOfficerId},-981783);
    delete from public.point_transactions where event_id=${eventId};
    delete from public.event_officers where event_id=${eventId};
    delete from public.events where id=${eventId};
    delete from public.officers where id in (${firstOfficerId},${secondOfficerId},-981783);
    delete from auth.users where id='${managerId}';
    insert into auth.users(id,email) values ('${managerId}','capacity-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values (-981783,'Capacity concurrency manager','capacity-concurrency@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${managerId}');
    insert into public.officers(id,name,utep_email,position_id,status)
      values (${firstOfficerId},'Capacity concurrency first','capacity-first@example.test',
        (select id from public.positions where name='Officer'),'active'),
        (${secondOfficerId},'Capacity concurrency second','capacity-second@example.test',
        (select id from public.positions where name='Officer'),'active');
    with event_start as (
      select ((now() at time zone 'America/Denver')::date + 3 + time '10:00') as starts_at_local
    )
    insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
      select ${eventId},'Capacity concurrency','Test event','TBA',
        (select id from public.event_types where name='Meeting'),
        starts_at_local::date,
        starts_at_local at time zone 'America/Denver',
        (starts_at_local + interval '1 hour') at time zone 'America/Denver',
        'upcoming',1
      from event_start;
  `);

  try {
    const firstSignup = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select id from public.events where id=${eventId} for update;
      \\echo CAPACITY_EVENT_LOCKED
      select pg_catalog.pg_sleep(1.5);
      select public.change_event_signup(${eventId},${firstOfficerId},false);
      commit;
    `);
    await firstSignup.waitFor("CAPACITY_EVENT_LOCKED");
    const competingSignupStartedAt = Date.now();
    const secondSignup = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select public.change_event_signup(${eventId},${secondOfficerId},false);
      commit;
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstSignup.closed,
      secondSignup.closed,
    ]);
    expect(firstResult.code).toBe(0);
    expect(secondResult.code).not.toBe(0);
    expect(secondResult.errors).toContain("Event capacity has been reached");
    expect(Date.now() - competingSignupStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select count(*) from public.event_officers where event_id=${eventId};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where actor_officer_id in (${firstOfficerId},${secondOfficerId},-981783);
      delete from public.point_transactions where event_id=${eventId};
      delete from public.event_officers where event_id=${eventId};
      delete from public.events where id=${eventId};
      delete from public.officers where id in (${firstOfficerId},${secondOfficerId},-981783);
      delete from auth.users where id='${managerId}';
    `);
  }
}, 30_000);

it("serializes concurrent presenter claims so only one Officer acquires a slot", async () => {
  const eventId = -981770;
  const slotId = -981771;
  const firstAuthId = "00000000-0000-4000-8000-000000009770";
  const secondAuthId = "00000000-0000-4000-8000-000000009772";
  const firstOfficerId = -981772;
  const secondOfficerId = -981773;

  runSql(`
    delete from public.audit_logs where entity_id='${eventId}';
    delete from public.presentation_slots where event_id=${eventId};
    delete from public.event_officers where event_id=${eventId};
    delete from public.events where id=${eventId};
    delete from public.officers where id in (${firstOfficerId},${secondOfficerId});
    delete from auth.users where id in ('${firstAuthId}','${secondAuthId}');
    insert into auth.users(id,email) values
      ('${firstAuthId}','presenter-first-concurrency@example.test'),
      ('${secondAuthId}','presenter-second-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values
        (${firstOfficerId},'Presenter concurrency first','presenter-first@example.test',
          (select id from public.positions where name='Officer'),'active','officer','${firstAuthId}'),
        (${secondOfficerId},'Presenter concurrency second','presenter-second@example.test',
          (select id from public.positions where name='Officer'),'active','officer','${secondAuthId}');
    insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
      values (${eventId},'Presenter concurrency','Test Session','TBA',
        (select id from public.event_types where lower(trim(name))='session'),date '2099-01-01',
        timestamptz '2099-01-01 10:00-07',timestamptz '2099-01-01 11:00-07','upcoming',1);
    insert into public.presentation_slots(id,event_id,position) values (${slotId},${eventId},1);
  `);

  try {
    const firstClaim = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${firstAuthId}',true);
      select public.change_presenter_slot(${slotId},${firstOfficerId});
      \\echo PRESENTER_SLOT_CLAIMED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await firstClaim.waitFor("PRESENTER_SLOT_CLAIMED");
    const competingClaimStartedAt = Date.now();
    const secondClaim = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${secondAuthId}',true);
      select public.change_presenter_slot(${slotId},${secondOfficerId});
      commit;
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstClaim.closed,
      secondClaim.closed,
    ]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).not.toBe(0);
    expect(secondResult.errors).toContain("Presenter slot is already taken");
    expect(Date.now() - competingClaimStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select officer_id from public.presentation_slots where id=${slotId};`,
      ).trim(),
    ).toBe(String(firstOfficerId));
    expect(
      runSql(
        `select count(*) from public.event_officers where event_id=${eventId};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where entity_id='${eventId}';
      delete from public.presentation_slots where event_id=${eventId};
      delete from public.event_officers where event_id=${eventId};
      delete from public.events where id=${eventId};
      delete from public.officers where id in (${firstOfficerId},${secondOfficerId});
      delete from auth.users where id in ('${firstAuthId}','${secondAuthId}');
    `);
  }
}, 30_000);

it("serializes concurrent Time Slot registrations so per-slot capacity is not exceeded", async () => {
  const eventId = -981760;
  const slotId = -981761;
  const managerId = "00000000-0000-4000-8000-000000009760";
  const firstOfficerId = -981762;
  const secondOfficerId = -981763;
  const managerOfficerId = -981764;

  runSql(`
    delete from public.audit_logs where entity_id='${eventId}' or actor_officer_id in (${firstOfficerId},${secondOfficerId},${managerOfficerId});
    delete from public.point_transactions where event_id=${eventId};
    delete from public.event_officers where event_id=${eventId};
    delete from public.event_time_slots where event_id=${eventId};
    delete from public.events where id=${eventId};
    delete from public.officers where id in (${firstOfficerId},${secondOfficerId},${managerOfficerId});
    delete from auth.users where id='${managerId}';
    insert into auth.users(id,email) values ('${managerId}','time-slot-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values (${managerOfficerId},'Time Slot concurrency manager','time-slot-manager@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${managerId}');
    insert into public.officers(id,name,utep_email,position_id,status)
      values (${firstOfficerId},'Time Slot concurrency first','time-slot-first@example.test',
        (select id from public.positions where name='Officer'),'active'),
        (${secondOfficerId},'Time Slot concurrency second','time-slot-second@example.test',
        (select id from public.positions where name='Officer'),'active');
    with event_start as (
      select ((now() at time zone 'America/Denver')::date + 3 + time '10:00') as starts_at_local
    )
    insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
      select ${eventId},'Time Slot concurrency','Test Event','TBA',
        (select id from public.event_types where name='Meeting'),starts_at_local::date,
        starts_at_local at time zone 'America/Denver',
        (starts_at_local + interval '2 hours') at time zone 'America/Denver','upcoming',2
      from event_start;
    insert into public.event_time_slots(id,event_id,starts_at,ends_at,capacity)
      select ${slotId},id,starts_at,ends_at,1 from public.events where id=${eventId};
  `);

  try {
    const firstRegistration = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select id from public.events where id=${eventId} for update;
      \\echo TIME_SLOT_EVENT_LOCKED
      select pg_catalog.pg_sleep(1.5);
      select public.change_event_time_slot_signup(${eventId},${firstOfficerId},array[${slotId}]::bigint[],'join_selected');
      commit;
    `);
    await firstRegistration.waitFor("TIME_SLOT_EVENT_LOCKED");
    const competingRegistrationStartedAt = Date.now();
    const secondRegistration = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select public.change_event_time_slot_signup(${eventId},${secondOfficerId},array[${slotId}]::bigint[],'join_selected');
      commit;
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstRegistration.closed,
      secondRegistration.closed,
    ]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).not.toBe(0);
    expect(secondResult.errors).toContain("A selected Time Slot is full");
    expect(Date.now() - competingRegistrationStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select count(*) from public.event_time_slot_officers where event_id=${eventId};`,
      ).trim(),
    ).toBe("1");
    expect(
      runSql(
        `select count(*) from public.event_officers where event_id=${eventId};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where entity_id='${eventId}' or actor_officer_id in (${firstOfficerId},${secondOfficerId},${managerOfficerId});
      delete from public.point_transactions where event_id=${eventId};
      delete from public.event_officers where event_id=${eventId};
      delete from public.event_time_slots where event_id=${eventId};
      delete from public.events where id=${eventId};
      delete from public.officers where id in (${firstOfficerId},${secondOfficerId},${managerOfficerId});
      delete from auth.users where id='${managerId}';
    `);
  }
}, 30_000);
