begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000403201','reminder-recipient@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values(-9403201,'Reminder Recipient','reminder-recipient@example.test',
  (select id from positions where name='Officer'),'active','officer',
  '00000000-0000-4000-8000-000000403201');

insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,created_by,due_time)
values
  (-9403201,'Date-only reminder','Synthetic','Post',(select id from branches where name='intro'),
    (now() at time zone 'America/Denver')::date+1,1,-9403201,null),
  (-9403202,'Timed reminder','Synthetic','Post',(select id from branches where name='intro'),
    (now() at time zone 'America/Denver')::date+1,1,-9403201,null),
  (-9403203,'Past due reminder','Synthetic','Post',(select id from branches where name='intro'),
    (now() at time zone 'America/Denver')::date-1,1,-9403201,null);
update public.tasks set due_time=time '15:00' where id=-9403202;
insert into public.task_officer_assignments(task_id,officer_id,assigned_by)
values(-9403201,-9403201,-9403201),(-9403202,-9403201,-9403201),(-9403203,-9403201,-9403201);
delete from public.task_reminder_offsets where task_id in (-9403201,-9403202,-9403203);
insert into public.task_reminder_offsets(task_id,minutes_before)
values(-9403201,1440),(-9403202,60),(-9403203,1440);

-- Fixed local clock times keep these rows on one Denver date regardless of
-- when the test runs. The upcoming Event's 48-hour reminder is already due.
with local_dates as (
  select (now() at time zone 'America/Denver')::date as today
), event_times as (
  select
    today + 1 + time '12:00' as upcoming_start_local,
    today + 1 + time '13:00' as upcoming_end_local,
    today - 1 + time '10:00' as past_start_local,
    today - 1 + time '10:30' as past_end_local
  from local_dates
)
insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
select -9403201,'Due soon Event','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  upcoming_start_local::date,
  upcoming_start_local at time zone 'America/Denver',
  upcoming_end_local at time zone 'America/Denver',
  'upcoming'
from event_times
union all
select -9403202,'Past Event','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  past_start_local::date,
  past_start_local at time zone 'America/Denver',
  past_end_local at time zone 'America/Denver',
  'past'
from event_times;
delete from public.event_reminder_offsets where event_id in (-9403201,-9403202);
insert into public.event_reminder_offsets(event_id,minutes_before)
values(-9403201,2880),(-9403202,1440);
insert into public.event_officers(event_id,officer_id)
values(-9403201,-9403201),(-9403202,-9403201);

select private.process_due_reminders();

select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='task' and entity_id=-9403201
    and kind='task.reminder'),
  case when (((select due_date from public.tasks where id=-9403201)+time '12:00')
      at time zone 'America/Denver')-interval '1 day'<=now() then 1 else 0 end::bigint,
  'a date-only Task reminder fires at noon the day before its due date');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='task' and entity_id=-9403202
    and kind='task.reminder'),0::bigint,
  'a timed Task reminder does not fire before its configured offset');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='task' and entity_id=-9403203
    and kind='task.reminder'),0::bigint,
  'a Task reminder is not sent after the Task is due');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='event' and entity_id=-9403201
    and kind='event.reminder'),1::bigint,
  'an overdue reminder is caught up while its Event is still upcoming');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='event' and entity_id=-9403202
    and kind='event.reminder'),0::bigint,
  'an Event reminder is not sent after the Event started');
select is((select dedupe_key from public.notifications
  where entity_type='event' and entity_id=-9403201 and kind='event.reminder'),
  'event.reminder:-9403201:2880:-9403201:'||
    ((select starts_at from public.events where id=-9403201)-interval '2880 minutes')::text,
  'Event reminder idempotency records the scheduled firing time');

select private.process_due_reminders();
select is((select count(*) from public.notifications
  where recipient_officer_id=-9403201 and entity_type='event' and entity_id=-9403201
    and kind='event.reminder'),1::bigint,
  'retrying the reminder processor does not duplicate delivery');

select * from finish();
rollback;
