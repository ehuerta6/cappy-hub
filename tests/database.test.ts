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
        values (${concurrentFixtureId},${concurrentFixtureId},1,'Concurrent first','participation');
      \\echo HOLDER_INSERTED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await firstInsert.waitFor("HOLDER_INSERTED");

    const competingInsertStartedAt = Date.now();
    const secondInsert = startSql(`
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type)
        values (${concurrentFixtureId},${concurrentFixtureId},2,'Concurrent second','participation');
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstInsert.closed,
      secondInsert.closed,
    ]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).not.toBe(0);
    expect(secondResult.errors).toContain(
      "one_active_ordinary_participation_award_per_officer_event",
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

it("revokes authenticated execution of Presenter Slot mutations", () => {
  expect(
    runSql(`
      select bool_and(not has_function_privilege('authenticated', function_name, 'execute'))
      from unnest(array[
        'public.add_presenter_slot(bigint)',
        'public.reorder_presenter_slots(bigint,bigint[])',
        'public.remove_presenter_slot(bigint)',
        'public.change_presenter_slot(bigint,bigint,boolean)',
        'public.update_presenter_slot_details(bigint,text,text,text,text)',
        'private.add_presenter_slot(bigint)',
        'private.reorder_presenter_slots(bigint,bigint[])',
        'private.remove_presenter_slot(bigint)',
        'private.change_presenter_slot(bigint,bigint,boolean)',
        'private.update_presenter_slot_details(bigint,text,text,text,text)'
      ]) as functions(function_name);
    `).trim(),
  ).toBe("t");
});

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

it("serializes concurrent historical Time Slot corrections for one signup", async () => {
  const eventId = -981750;
  const firstSlotId = -981751;
  const secondSlotId = -981752;
  const managerId = "00000000-0000-4000-8000-000000009750";
  const managerOfficerId = -981753;
  const targetOfficerId = -981754;
  const originalAwardId = -981755;

  runSql(`
    delete from public.audit_logs where entity_id='${eventId}' or actor_officer_id=${managerOfficerId};
    delete from public.point_transactions where event_id=${eventId};
    delete from public.event_time_slot_officers where event_id=${eventId};
    delete from public.event_officers where event_id=${eventId};
    delete from public.event_time_slots where event_id=${eventId};
    delete from public.events where id=${eventId};
    delete from public.officers where id in (${managerOfficerId},${targetOfficerId});
    delete from auth.users where id='${managerId}';
    insert into auth.users(id,email) values ('${managerId}','historical-slot-race@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values (${managerOfficerId},'Historical slot race manager','historical-slot-race@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${managerId}');
    insert into public.officers(id,name,utep_email,position_id,status)
      values (${targetOfficerId},'Historical slot race target','historical-slot-target@example.test',
        (select id from public.positions where name='Officer'),'active');
    insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
      participation_points_per_hour_at_end)
      values (${eventId},'Historical slot race','Synthetic','TBA',
        (select id from public.event_types where name='Meeting'),'2020-01-01',
        '2020-01-01 09:00-07','2020-01-01 11:00-07','past',1);
    insert into public.event_officers(event_id,officer_id) values (${eventId},${targetOfficerId});
    insert into public.event_time_slots(id,event_id,starts_at,ends_at) values
      (${firstSlotId},${eventId},'2020-01-01 09:00-07','2020-01-01 10:00-07'),
      (${secondSlotId},${eventId},'2020-01-01 10:00-07','2020-01-01 11:00-07');
    insert into public.event_time_slot_officers(event_id,slot_id,officer_id)
      values (${eventId},${firstSlotId},${targetOfficerId});
    insert into public.point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type)
      values (${originalAwardId},${targetOfficerId},${eventId},${firstSlotId},1,
        'Event time slot participation','participation');
  `);

  try {
    const firstCorrection = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select id from public.events where id=${eventId} for update;
      \\echo HISTORICAL_SLOT_EVENT_LOCKED
      select pg_catalog.pg_sleep(1.5);
      select public.correct_historical_event_time_slots(${eventId},${targetOfficerId},array[${secondSlotId}]::bigint[]);
      commit;
    `);
    await firstCorrection.waitFor("HISTORICAL_SLOT_EVENT_LOCKED");
    const competingCorrectionStartedAt = Date.now();
    const secondCorrection = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${managerId}',true);
      select public.correct_historical_event_time_slots(${eventId},${targetOfficerId},array[${firstSlotId}]::bigint[]);
      commit;
    `);
    const [firstResult, secondResult] = await Promise.all([
      firstCorrection.closed,
      secondCorrection.closed,
    ]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).toBe(0);
    expect(Date.now() - competingCorrectionStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select array_agg(slot_id order by slot_id) from public.event_time_slot_officers where event_id=${eventId} and officer_id=${targetOfficerId};`,
      ).trim(),
    ).toBe(`{${firstSlotId}}`);
    expect(
      runSql(
        `select removed_at is null from public.point_transactions where id=${originalAwardId};`,
      ).trim(),
    ).toBe("t");
    expect(
      runSql(
        `select count(*) from public.point_transactions where event_id=${eventId} and officer_id=${targetOfficerId} and award_type='participation' and removed_at is null;`,
      ).trim(),
    ).toBe("1");
    expect(
      runSql(
        `select count(*) from public.event_officers where event_id=${eventId} and officer_id=${targetOfficerId} and removed_at is null;`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where entity_id='${eventId}' or actor_officer_id=${managerOfficerId};
      delete from public.point_transactions where event_id=${eventId};
      delete from public.event_time_slot_officers where event_id=${eventId};
      delete from public.event_officers where event_id=${eventId};
      delete from public.event_time_slots where event_id=${eventId};
      delete from public.events where id=${eventId};
      delete from public.officers where id in (${managerOfficerId},${targetOfficerId});
      delete from auth.users where id='${managerId}';
    `);
  }
}, 30_000);

it("preserves independent manual credit during concurrent processing and intentional manual submissions", async () => {
  const id = -327900;
  const admin = "00000000-0000-4000-8000-000000327900";
  runSql(`
    insert into auth.users(id,email) values('${admin}','manual-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values(${id},'Manual concurrency Admin','manual-concurrency@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${admin}');
    insert into public.events(id,name,description,location,event_type_id,starts_at,ends_at)
      values(${id},'Manual concurrency','Synthetic','TBA',
        (select id from public.event_types where name='Meeting'),'2020-01-01 09:00-07','2020-01-01 11:00-07');
    insert into public.event_officers(event_id,officer_id) values(${id},${id});
  `);
  try {
    const processing = startSql(`
      begin;
      select private.process_finished_events();
      \\echo AUTOMATIC_PROCESSED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await processing.waitFor("AUTOMATIC_PROCESSED");
    const manual = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.add_manual_transaction(${id},3,'Concurrent addition','manual',${id});
      commit;
    `);
    expect(runSql("select private.process_finished_events();").trim()).toBe(
      "0",
    );
    const outcomes = await Promise.all([processing.closed, manual.closed]);
    for (const outcome of outcomes)
      expect(outcome.code, outcome.errors).toBe(0);

    const first = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.add_manual_transaction(${id},-1,'Intentional first deduction','manual',${id});
      \\echo MANUAL_INSERTED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await first.waitFor("MANUAL_INSERTED");
    const second = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.add_manual_transaction(${id},-1,'Intentional second deduction','manual',${id});
      commit;
    `);
    for (const outcome of await Promise.all([first.closed, second.closed]))
      expect(outcome.code, outcome.errors).toBe(0);
    runSql(`
      begin;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.bulk_add_event_officers(${id},array[${id}]::bigint[]);
      select public.bulk_add_event_officers(${id},array[${id}]::bigint[]);
      commit;
    `);
    expect(
      runSql(
        `select count(*) from public.point_transactions where event_id=${id} and award_type='participation';`,
      ).trim(),
    ).toBe("1");
    expect(
      runSql(
        `select count(*) from public.point_transactions where event_id=${id} and award_type='manual';`,
      ).trim(),
    ).toBe("3");
    expect(
      runSql(
        `select sum(points) from public.point_transactions where event_id=${id} and award_type='manual';`,
      ).trim(),
    ).toBe("1");
    expect(
      runSql(
        `select count(*) from public.audit_logs where action='points.participation_created' and details->>'event_id'='${id}';`,
      ).trim(),
    ).toBe("1");
    expect(
      runSql(
        `select count(*) from public.audit_logs where action='points.manual_created' and actor_officer_id=${id};`,
      ).trim(),
    ).toBe("3");
  } finally {
    runSql(`
      delete from public.audit_logs where actor_officer_id=${id} or details->>'event_id'='${id}';
      delete from public.point_transactions where event_id=${id};
      delete from public.event_officers where event_id=${id};
      delete from public.events where id=${id};
      delete from public.officers where id=${id};
      delete from auth.users where id='${admin}';
    `);
  }
}, 30_000);

it("serializes schedule corrections with processing and retries without duplicate participation", async () => {
  const id = -982328;
  const actor = "00000000-0000-4000-8000-000009823280";
  runSql(`
    insert into auth.users(id,email) values('${actor}','schedule-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values(${id},'Schedule concurrency','schedule-concurrency@example.test',
      (select id from public.positions where code='officer'),'active','admin','${actor}');
    insert into public.events(id,name,description,location,event_type_id,starts_at,ends_at)
      values(${id},'Schedule concurrency','Synthetic','Campus',
      (select id from public.event_types where name='Meeting'),'2020-01-01 09:00-07','2020-01-01 11:00-07');
    insert into public.event_officers(event_id,officer_id) values(${id},${id});
  `);
  try {
    const processing = startSql(`begin;
      select * from public.events where id=${id} for update;
      select 'schedule-event-locked';
      select pg_sleep(0.4);
      select private.process_finished_events();
      commit;`);
    await processing.waitFor("schedule-event-locked");
    const correcting = startSql(`begin;
      select set_config('request.jwt.claim.sub','${actor}',true);
      set local role authenticated;
      select public.save_event_with_links('Schedule concurrency','Corrected',(select id from public.event_types where name='Meeting'),
        'Campus','2099-01-01','2099-01-01 09:00-07','2099-01-01 11:00-07','{}'::bigint[],${id});
      commit;`);
    const [processor, correction] = await Promise.all([
      processing.closed,
      correcting.closed,
    ]);
    expect(processor.code, processor.errors).toBe(0);
    expect(correction.code, correction.errors).toBe(0);
    expect(
      runSql(
        `select count(*) from public.point_transactions where event_id=${id} and removed_at is null;`,
      ).trim(),
    ).toBe("0");
    expect(
      runSql(
        `select count(*) from public.event_officers where event_id=${id};`,
      ).trim(),
    ).toBe("1");
    runSql(`begin;
      select set_config('request.jwt.claim.sub','${actor}',true);
      set local role authenticated;
      select public.save_event_with_links('Schedule concurrency','Corrected',
        (select id from public.event_types where name='Meeting'),'Campus','2021-01-01',
        '2021-01-01 09:00-07','2021-01-01 10:30-07','{}'::bigint[],${id});
      commit;`);
    const retries = await Promise.all([
      startSql("select private.process_finished_events();").closed,
      startSql("select private.process_finished_events();").closed,
    ]);
    for (const retry of retries) expect(retry.code, retry.errors).toBe(0);
    expect(
      runSql(
        `select count(*),sum(points)::numeric(10,2) from public.point_transactions where event_id=${id} and removed_at is null;`,
      ).trim(),
    ).toBe("1|1.50");
    expect(
      runSql(
        `select count(*) from public.point_transactions where event_id=${id};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`delete from public.audit_logs where entity_id='${id}' or details->>'event_id'='${id}';
      delete from public.point_transactions where event_id=${id};
      delete from public.event_officers where event_id=${id};
      delete from public.events where id=${id};
      delete from public.officers where id=${id};
      delete from auth.users where id='${actor}';`);
  }
});

it("serializes Warning corrections with complete before/after audit history", async () => {
  const id = -335900;
  const admin = "00000000-0000-4000-8000-000000335900";
  runSql(`
    insert into auth.users(id,email) values('${admin}','warning-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values(${id},'Warning concurrency Admin','warning-concurrency@example.test',
        (select id from public.positions where code='officer'),'active','admin','${admin}');
    insert into public.officer_warnings(id,officer_id,reason,status)
      values(${id},${id},'Original historical reason','pending');
  `);
  try {
    const first = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.update_warning(${id},'First correction');
      \\echo WARNING_CORRECTED
      select pg_catalog.pg_sleep(1);
      commit;
    `);
    await first.waitFor("WARNING_CORRECTED");
    const second = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.update_warning(${id},'Second correction');
      commit;
    `);
    for (const outcome of await Promise.all([first.closed, second.closed]))
      expect(outcome.code, outcome.errors).toBe(0);
    runSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.update_warning(${id},'Second correction');
      commit;
    `);
    expect(
      runSql(
        `select reason || ':' || status from public.officer_warnings where id=${id};`,
      ).trim(),
    ).toBe("Second correction:pending");
    expect(
      runSql(
        `select string_agg((details->'before'->>'reason')||' -> '||(details->'after'->>'reason'),';' order by id) from public.audit_logs where entity_type='warning' and entity_id='${id}' and action='warning.updated' and actor_officer_id=${id};`,
      ).trim(),
    ).toBe(
      "Original historical reason -> First correction;First correction -> Second correction",
    );
  } finally {
    runSql(`
      delete from public.audit_logs where actor_officer_id=${id};
      delete from public.officer_warnings where id=${id};
      delete from public.officers where id=${id};
      delete from auth.users where id='${admin}';
    `);
  }
}, 30_000);

it("serializes historical Task corrections with processor retries without duplicate awards", async () => {
  const id = -331900;
  const admin = "00000000-0000-4000-8000-000000331900";
  runSql(`
    insert into auth.users(id,email) values('${admin}','task-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values(${id},'Task concurrency Admin','task-concurrency@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${admin}');
    insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
      values(${id},'Concurrent Task','Synthetic','Flyer',
        (select id from public.branches where name='intro'),
        (statement_timestamp() at time zone 'America/Denver')::date-1,5,${id});
    insert into public.task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
      values(${id},${id},${id},now());
  `);
  try {
    const processing = startSql(`
      begin;
      select private.process_due_tasks();
      \\echo TASK_PROCESSED
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await processing.waitFor("TASK_PROCESSED");
    const correction = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.update_task_details(${id},'Concurrent Task','Synthetic','Flyer',
        (select id from public.branches where name='intro'),
        (statement_timestamp() at time zone 'America/Denver')::date-1,9);
      commit;
    `);
    expect(runSql("select private.process_due_tasks();").trim()).toBe("0");
    for (const outcome of await Promise.all([
      processing.closed,
      correction.closed,
    ]))
      expect(outcome.code, outcome.errors).toBe(0);
    runSql(
      "select private.process_due_tasks(); select private.process_due_tasks();",
    );
    expect(
      runSql(`select count(*)||':'||sum(points) from public.point_transactions
      where task_id=${id} and award_type='task' and removed_at is null;`).trim(),
    ).toBe("1:9");
    expect(
      runSql(`select count(*) from public.audit_logs where action='points.task_created'
      and details->>'task_id'='${id}';`).trim(),
    ).toBe("1");
    const future = startSql(`
      begin;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.update_task_details(${id},'Concurrent Task','Synthetic','Flyer',
        (select id from public.branches where name='intro'),
        (statement_timestamp() at time zone 'America/Denver')::date+1,9);
      \\echo TASK_CORRECTED_FUTURE
      select pg_catalog.pg_sleep(1.5);
      commit;
    `);
    await future.waitFor("TASK_CORRECTED_FUTURE");
    expect(runSql("select private.process_due_tasks();").trim()).toBe("0");
    expect((await future.closed).code).toBe(0);
    runSql("select private.process_due_tasks();");
    expect(
      runSql(`select count(*) from public.point_transactions where task_id=${id}
      and removed_at is null;`).trim(),
    ).toBe("0");
    expect(
      runSql(
        `select count(*) from public.point_transactions where task_id=${id};`,
      ).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where actor_officer_id=${id} or details->>'task_id'='${id}';
      delete from public.point_transactions where task_id=${id};
      delete from public.task_officer_assignments where task_id=${id};
      delete from public.tasks where id=${id};
      delete from public.officers where id=${id};
      delete from auth.users where id='${admin}';
    `);
  }
}, 30_000);

it("serializes concurrent Task delete and restore without duplicate awards or audits", async () => {
  const id = -332900;
  const admin = "00000000-0000-4000-8000-000000332900";
  runSql(`
    insert into auth.users(id,email) values('${admin}','task-delete-concurrency@example.test');
    insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
      values(${id},'Task delete concurrency Admin','task-delete-concurrency@example.test',
        (select id from public.positions where name='Officer'),'active','admin','${admin}');
    insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
      values(${id},'Concurrent delete and restore','Synthetic','Flyer',
        (select id from public.branches where name='intro'),
        (statement_timestamp() at time zone 'America/Denver')::date-1,5,${id});
    insert into public.task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
      values(${id},${id},${id},statement_timestamp()-interval '2 days');
    insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by)
      values(${id},${id},5,'Task completion: Concurrent delete and restore','task','${admin}');
  `);
  try {
    const deletion = startSql(`
      begin;
      select id from public.tasks where id=${id} for update;
      \\echo TASK_DELETE_LOCKED
      select pg_catalog.pg_sleep(1.5);
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.remove_task(${id});
      commit;
    `);
    await deletion.waitFor("TASK_DELETE_LOCKED");
    const restoreStartedAt = Date.now();
    const restoration = startSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${admin}',true);
      select public.restore_task(${id});
      commit;
    `);
    const [deleteResult, restoreResult] = await Promise.all([
      deletion.closed,
      restoration.closed,
    ]);

    expect(deleteResult.code, deleteResult.errors).toBe(0);
    expect(restoreResult.code, restoreResult.errors).toBe(0);
    expect(Date.now() - restoreStartedAt).toBeGreaterThan(500);
    expect(
      runSql(
        `select removed_at is null from public.tasks where id=${id};`,
      ).trim(),
    ).toBe("t");
    expect(
      runSql(`select count(*)||':'||sum(points) from public.point_transactions
        where task_id=${id} and award_type='task' and removed_at is null;`).trim(),
    ).toBe("1:5");
    expect(
      runSql(`select count(*) from public.audit_logs where action='task.deleted'
        and entity_id='${id}';`).trim(),
    ).toBe("1");
    expect(
      runSql(`select count(*) from public.audit_logs where action='task.restored'
        and entity_id='${id}';`).trim(),
    ).toBe("1");
  } finally {
    runSql(`
      delete from public.audit_logs where actor_officer_id=${id} or entity_id='${id}'
        or details->>'task_id'='${id}';
      delete from public.point_transactions where task_id=${id};
      delete from public.task_officer_assignments where task_id=${id};
      delete from public.tasks where id=${id};
      delete from public.officers where id=${id};
      delete from auth.users where id='${admin}';
    `);
  }
}, 30_000);
