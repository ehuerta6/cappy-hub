begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000403101','notification-series-admin@example.test'),
  ('00000000-0000-4000-8000-000000403102','notification-series-lead@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-9403101,'Notification Series Admin','notification-series-admin@example.test',
    (select id from positions where name='Officer'),'active','admin',
    '00000000-0000-4000-8000-000000403101'),
  (-9403102,'Notification Series Lead','notification-series-lead@example.test',
    (select id from positions where name='Lead'),'active','officer',
    '00000000-0000-4000-8000-000000403102');
insert into public.officer_branches(officer_id,branch_id)
select -9403102,id from public.branches where name='intro';

create temporary table notification_series_fixtures(
  label text primary key, series_id bigint not null, occurrence_ids bigint[] not null
);
create temporary table notification_series_created_items(
  label text primary key, first_id bigint not null
);
grant select,insert on notification_series_fixtures,notification_series_created_items to authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403101',true);
set local role authenticated;
insert into notification_series_created_items values('event',public.create_recurring_event(
  '403 scoped Event','Synthetic authorization fixture',
  (select id from public.event_types where name='Meeting'),'Campus','{}',null,null,
  '00000000-0000-4000-8000-000000403111',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array[current_date+10,current_date+11],
  array[((current_date+10+time '10:00') at time zone 'America/Denver'),
        ((current_date+11+time '10:00') at time zone 'America/Denver')],
  array[((current_date+10+time '11:00') at time zone 'America/Denver'),
        ((current_date+11+time '11:00') at time zone 'America/Denver')]
));
insert into notification_series_fixtures
select 'event',e.recurrence_series_id,array_agg(e.id order by e.recurrence_key)
from notification_series_created_items created
join public.events first_event on first_event.id=created.first_id
join public.events e on e.recurrence_series_id=first_event.recurrence_series_id
where created.label='event'
group by e.recurrence_series_id;
insert into notification_series_created_items values('task',public.create_recurring_task(
  '403 scoped Task','Synthetic authorization fixture','Post',
  (select id from public.branches where name='intro'),1,false,
  '00000000-0000-4000-8000-000000403112',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array[current_date+10,current_date+11]
));
insert into notification_series_fixtures
select 'task',t.recurrence_series_id,array_agg(t.id order by t.recurrence_key)
from notification_series_created_items created
join public.tasks first_task on first_task.id=created.first_id
join public.tasks t on t.recurrence_series_id=first_task.recurrence_series_id
where created.label='task'
group by t.recurrence_series_id;
reset role;

insert into public.event_branches(event_id,branch_id)
select occurrence_ids[1],id from notification_series_fixtures,public.branches
where label='event' and name='intro';
insert into public.event_branches(event_id,branch_id)
select occurrence_ids[2],id from notification_series_fixtures,public.branches
where label='event' and name='social';
update public.tasks set branch_id=(select id from public.branches where name='social')
where id=(select occurrence_ids[2] from notification_series_fixtures where label='task');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403102',true);
set local role authenticated;
select lives_ok(format(
  'select public.set_event_notification_settings(%s,false,''{}'',''{}'',''{120}'',''series'',%s,0)',
  occurrence_ids[1],series_id
), 'a Lead can change reminder settings across Event Branches')
from notification_series_fixtures where label='event';
select throws_ok(format(
  'select public.set_task_notification_settings(%s,false,''{}'',''{}'',''{120}'',''series'',%s,0)',
  occurrence_ids[1],series_id
), 'P0001','Task outside branch scope',
  'a Branch Lead cannot change audience or reminders outside their managed Task branches')
from notification_series_fixtures where label='task';
select throws_ok(format(
  'select public.set_task_due_time(%s,time ''15:00'',''series'',%s,0)',
  occurrence_ids[1],series_id
), 'P0001','Task outside branch scope',
  'a Branch Lead cannot change due time outside their managed Task branches')
from notification_series_fixtures where label='task';
reset role;

select is((select count(*) from public.event_notification_targets
  where event_id in (select unnest(occurrence_ids) from notification_series_fixtures where label='event')),
  0::bigint,'default Event notification targets remain unchanged');
select is((select count(*) from public.event_reminder_offsets r
  where r.event_id in (select unnest(occurrence_ids) from notification_series_fixtures where label='event')
    and r.minutes_before=120),3::bigint,'Lead reminder changes apply to all Event occurrences');
select is((select count(*) from public.task_notification_targets
  where task_id in (select unnest(occurrence_ids) from notification_series_fixtures where label='task')),
  0::bigint,'rejected Task settings leave every occurrence unchanged');
select is((select count(*) from public.task_reminder_offsets r
  where r.task_id in (select unnest(occurrence_ids) from notification_series_fixtures where label='task')
    and r.minutes_before=120),0::bigint,'rejected Task reminder offsets are not partially written');
select is((select count(*) from public.tasks t
  where t.id in (select unnest(occurrence_ids) from notification_series_fixtures where label='task')
    and t.due_time is not null),0::bigint,'rejected Task due-time changes leave every occurrence unchanged');

select * from finish();
rollback;
