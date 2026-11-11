begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000007601','period-scope-admin@example.test'),
  ('00000000-0000-4000-8000-000000007602','period-scope-lead@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
  (-7601,'Period Scope Admin','period-scope-admin@example.test',
    (select id from positions where code='officer'),'active','admin','00000000-0000-4000-8000-000000007601'),
  (-7602,'Period Scope Lead','period-scope-lead@example.test',
    (select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000007602');
insert into officer_branches(officer_id,branch_id)
  select -7602,id from branches where name='intro';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000007601',true);
set local role authenticated;
select set_config('test.closed_series_first_id',public.create_recurring_event_with_resources(
  'Closed series','Historical fixture',(select id from event_types where name='Meeting'),
  'Campus',array[(select id from branches where name='icpc')],null,null,null,0,
  '00000000-0000-4000-8000-000000007611','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2020-09-20'::date,'2020-09-21'],
  array['2020-09-20 10:00-06'::timestamptz,'2020-09-21 10:00-06'::timestamptz],
  array['2020-09-20 11:00-06'::timestamptz,'2020-09-21 11:00-06'::timestamptz],
  null,'[]'::jsonb
)::text,true);
reset role;

insert into academic_periods(name,starts_on,ends_on)
values('Closed Event period test','2020-09-20','2020-09-21');
insert into event_notification_targets(event_id,branch_id)
values(current_setting('test.closed_series_first_id')::bigint,
  (select id from branches where name='social'));
insert into event_reminder_offsets(event_id,minutes_before)
values(current_setting('test.closed_series_first_id')::bigint,300);
create temporary table notification_state_before as
select
  (select count(*) from event_notification_targets where event_id in
    (select id from events where recurrence_series_id=(select recurrence_series_id from events
      where id=current_setting('test.closed_series_first_id')::bigint))) as targets,
  (select count(*) from event_reminder_offsets where event_id in
    (select id from events where recurrence_series_id=(select recurrence_series_id from events
      where id=current_setting('test.closed_series_first_id')::bigint))) as reminders;
grant select on notification_state_before to authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000007601',true);
set local role authenticated;
select set_config('test.open_event_id',public.save_event_with_resources(
  'Open Event','Open fixture',(select id from event_types where name='Meeting'),'Campus',
  (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date,
  (((pg_catalog.statement_timestamp() at time zone 'America/Denver')::date+time '10:00') at time zone 'America/Denver'),
  (((pg_catalog.statement_timestamp() at time zone 'America/Denver')::date+time '11:00') at time zone 'America/Denver'),
  array[(select id from branches where name='icpc')],null,0,null,null,null,null,'[]'::jsonb
)::text,true);
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000007602',true);
set local role authenticated;
select throws_ok($$select public.save_event_with_resources(
  'Closed create','Historical fixture',(select id from event_types where name='Meeting'),'Campus',
  '2020-09-20','2020-09-20 10:00-06','2020-09-20 11:00-06',
  array[(select id from branches where name='icpc')],null,0,null,null,null,null,'[]'::jsonb)$$,
  'P0001','Historical period is read-only',
  'a cross-Branch Lead cannot create an Event directly in a closed period');
select throws_ok(format($sql$
  select public.save_event_with_resources(
    'Changed through RPC','Edited directly',(select id from event_types where name='Meeting'),
    'Campus','2099-09-20','2099-09-20 10:00-06','2099-09-20 11:00-06',
    array[(select id from branches where name='intro')],null,0,%s,null,null,null,'[]'::jsonb)
$sql$, (current_setting('test.closed_series_first_id')::bigint)),
  'P0001','Historical period is read-only',
  'a cross-Branch Lead cannot edit a closed-period Event through the public save RPC, even when moving it forward');
select throws_ok(format($sql$
  select public.save_event_with_resources(
    'Moved into closed period','Changed date',(select id from event_types where name='Meeting'),
    'Campus','2020-09-20','2020-09-20 10:00-06','2020-09-20 11:00-06',
    array[(select id from branches where name='intro')],null,0,%s,null,null,null,'[]'::jsonb)
$sql$,current_setting('test.open_event_id')::bigint),
  'P0001','Historical period is read-only',
  'a cross-Branch Lead cannot move an open Event into a closed period');
select throws_ok(format($sql$
  select public.mutate_recurring_event_with_capacity_and_time_slots(
    %s,'occurrence','edit',gen_random_uuid(),
    (select recurrence_series_id from events where id=%s),0,
    '{"description":"Moved out of closed period","event_date":"2099-09-20","start_time":"10:00","end_time":"11:00"}'::jsonb,null,null,false,0)
$sql$,current_setting('test.closed_series_first_id')::bigint,
  current_setting('test.closed_series_first_id')::bigint),
  'P0001','Historical period is read-only',
  'recurrence cannot move a closed occurrence into a writable date');
select throws_ok(format($sql$
  select public.set_event_notification_settings(%s,false,'{}','{}','{60}','series',
    (select recurrence_series_id from events where id=%s),0)
$sql$,current_setting('test.closed_series_first_id')::bigint,
  current_setting('test.closed_series_first_id')::bigint),
  'P0001','Historical period is read-only',
  'cross-Branch Event notification settings cannot target a closed-period occurrence');
select throws_ok($$select public.create_recurring_event(
  'Closed create','Historical fixture',(select id from event_types where name='Meeting'),
  'Campus',array[(select id from branches where name='icpc')],null,null,null,
  '00000000-0000-4000-8000-000000007612','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2020-09-20'::date,'2020-09-21'],
  array['2020-09-20 12:00-06'::timestamptz,'2020-09-21 12:00-06'::timestamptz],
  array['2020-09-20 13:00-06'::timestamptz,'2020-09-21 13:00-06'::timestamptz])$$,
  'P0001','Historical period is read-only',
  'recurring Event creation cannot target a closed period');
reset role;

update events set event_date=(pg_catalog.statement_timestamp() at time zone 'America/Denver')::date,
  starts_at=(((pg_catalog.statement_timestamp() at time zone 'America/Denver')::date+time '10:00') at time zone 'America/Denver'),
  ends_at=(((pg_catalog.statement_timestamp() at time zone 'America/Denver')::date+time '11:00') at time zone 'America/Denver')
where id=(select id from events where recurrence_series_id=(select recurrence_series_id
  from events where id=current_setting('test.closed_series_first_id')::bigint)
  order by recurrence_key desc limit 1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000007602',true);
set local role authenticated;
select throws_ok(format($sql$
  select public.set_event_notification_settings(%s,false,'{}','{}','{60}','series',
    (select recurrence_series_id from events where id=%s),0)
$sql$,(select id from events where recurrence_series_id=(select recurrence_series_id
  from events where id=current_setting('test.closed_series_first_id')::bigint)
  order by recurrence_key desc limit 1),current_setting('test.closed_series_first_id')::bigint),
  'P0001','Historical period is read-only',
  'a writable series head cannot apply notification settings to a closed-period sibling');
reset role;
select is((select count(*) from event_reminder_offsets where event_id in
  (select id from events where recurrence_series_id=(select recurrence_series_id
    from events where id=current_setting('test.closed_series_first_id')::bigint))),
  (select reminders from notification_state_before),
  'rejected cross-period notification edits preserve existing reminder offsets');
select is((select count(*) from event_notification_targets where event_id in
  (select id from events where recurrence_series_id=(select recurrence_series_id
    from events where id=current_setting('test.closed_series_first_id')::bigint))),
  (select targets from notification_state_before),
  'rejected cross-period notification edits preserve existing audience targets');

select is((select description from events where id=current_setting('test.closed_series_first_id')::bigint),
  'Historical fixture','rejected RPC edit preserves the Event description');
select is((select count(*) from event_branches where event_id=current_setting('test.closed_series_first_id')::bigint
  and branch_id=(select id from branches where name='icpc')),1::bigint,
  'rejected RPC edit leaves the original Branch link unchanged');
select is((select event_date::text from events where id=current_setting('test.closed_series_first_id')::bigint),
  '2020-09-20','rejected recurrence edit preserves the closed source date');
select is((select name from events where id=current_setting('test.closed_series_first_id')::bigint),
  'Closed series','rejected recurrence edit preserves the original fields');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000007601',true);
set local role authenticated;
select is(public.create_recurring_event_with_resources(
  'Closed series','Historical fixture',(select id from event_types where name='Meeting'),
  'Campus',array[(select id from branches where name='icpc')],null,null,null,0,
  '00000000-0000-4000-8000-000000007611','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2020-09-20'::date,'2020-09-21'],
  array['2020-09-20 10:00-06'::timestamptz,'2020-09-21 10:00-06'::timestamptz],
  array['2020-09-20 11:00-06'::timestamptz,'2020-09-21 11:00-06'::timestamptz],
  null,'[]'::jsonb
),current_setting('test.closed_series_first_id')::bigint,
  'an exact recurrence-create retry remains valid after its period closes');
reset role;

select * from finish();
rollback;
