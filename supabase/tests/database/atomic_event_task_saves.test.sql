begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000004460','atomic-admin@example.test'),
 ('00000000-0000-4000-8000-000000004461','atomic-officer@example.test');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id)
values (-4460,'Atomic admin','atomic-admin@example.test',(select id from positions where name='Officer'),
  'admin','00000000-0000-4000-8000-000000004460'),
 (-4461,'Atomic officer','atomic-officer@example.test',(select id from positions where name='Officer'),
  'officer','00000000-0000-4000-8000-000000004461');

create function pg_temp.save_event(settings jsonb, title text default 'Atomic Event') returns bigint
language sql as $$
  select public.save_event_with_resources_atomic(settings,title,'Details',
    (select id from event_types where name='Session'),'Campus','2099-12-02',
    '2099-12-02 16:00Z','2099-12-02 17:00Z','{}',
    '00000000-0000-4000-8000-000000004460',
    p_resource_links => '[{"kind":"documentation","label":"Documentation","url":"https://example.test/event"}]')
$$;
create function pg_temp.save_task(settings jsonb) returns bigint
language sql as $$
  select public.save_task_with_resources_atomic(settings,'Atomic Task','Details','Post',
    (select id from branches where name='intro'),'2099-12-02',3,false,
    (select array_agg(id) from events where name='Atomic Event'),
    '[{"kind":"documentation","label":"Documentation","url":"https://example.test/task"}]',
    '00000000-0000-4000-8000-000000004460', array[-4461]::bigint[])
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004460',true);
set local role authenticated;

select throws_ok($$select pg_temp.save_event('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[0]}')$$,
  '23514',null,'a failing reminder write aborts the Event save');
select is((select count(*) from events where name='Atomic Event'),0::bigint,
  'the Event and dependent work roll back together');
select lives_ok($$select pg_temp.save_event('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[90]}')$$,
  'the key is reusable when nothing committed');
select is((select pg_temp.save_event('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[90]}')),
  (select id from events where name='Atomic Event'),'an exact retry returns the original Event ID');
select is((select count(*) from events where name='Atomic Event'),1::bigint,'no duplicate Event exists');
select throws_ok($$select pg_temp.save_event('{"reminder_offsets":[20]}')$$,
  'P0001','Save request was already used with different details','a changed settings retry is rejected');
select is((select count(*) from resource_links where event_id=(select id from events where name='Atomic Event')),
  1::bigint,'the Event resource link survived creation');
select is((select array_agg(minutes_before) from event_reminder_offsets
  where event_id=(select id from events where name='Atomic Event')),array[90],
  'custom Event reminders replace the defaults');

select throws_ok($$select pg_temp.save_task('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[30],"due_time":"XX:00"}')$$,
  '22007',null,'an invalid due time aborts the Task save and its preceding settings writes');
select is((select count(*) from tasks where title='Atomic Task'),0::bigint,
  'the Task, links and roster roll back together');
select lives_ok($$select pg_temp.save_task('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[30],"due_time":"15:30"}')$$,
  'the Task, assignments, links and all settings can commit together');
select is((select pg_temp.save_task('{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[30],"due_time":"15:30"}')),
  (select id from tasks where title='Atomic Task'),'an exact retry returns the original Task ID');
select is((select due_time from tasks where title='Atomic Task'),'15:30'::time,'Task due time was saved');

select throws_ok($$select create_recurring_task_with_resources_atomic(
  '{}','Duplicate mode','Details','Post',(select id from branches where name='intro'),3,false,
  '00000000-0000-4000-8000-000000004460','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2099-12-10'::date,'2099-12-11'],'{}','[]')$$,
  'P0001','Save request was already used with different details',
  'a standalone save key cannot be reused to create a series');
select lives_ok($$select create_recurring_task_with_resources(
  'Legacy series','Details','Post',(select id from branches where name='intro'),3,false,
  '00000000-0000-4000-8000-000000004467','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2099-12-10'::date,'2099-12-11'],'{}','[]')$$,'the deployed RPC remains usable');
select throws_ok($$select create_recurring_task_with_resources_atomic(
  '{"due_time":"15:00"}','Legacy series','Details','Post',(select id from branches where name='intro'),3,false,
  '00000000-0000-4000-8000-000000004467','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2099-12-10'::date,'2099-12-11'],'{}','[]')$$,
  'P0001','Save request was already used','a legacy series receipt does not grant a fresh settings write');
select is((select count(*) from tasks where title='Legacy series' and due_time is not null),
  0::bigint,'existing legacy occurrence settings are unchanged');

select lives_ok($$select create_recurring_task_with_resources_atomic(
  '{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[60],"due_time":"16:00"}',
  'Atomic recurring Task','Details','Post',(select id from branches where name='intro'),3,false,
  '00000000-0000-4000-8000-000000004462','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-12-10'::date,'2099-12-11','2099-12-12'],'{}','[]')$$,
  'recurring Task creation applies each settings group to all occurrences');

select lives_ok($$select mutate_recurring_task_with_resources_atomic(
  '{"reminder_offsets":[20],"due_time":"13:30"}',
  t.id,'occurrence','edit','00000000-0000-4000-8000-000000004463',s.id,s.revision)
  from tasks t join task_series s on s.id=t.recurrence_series_id
  where t.title='Atomic recurring Task' and t.due_date='2099-12-11'$$,'one Task occurrence can override reminders and due time');
select lives_ok($$select mutate_recurring_task_with_resources_atomic(
  '{}',t.id,'series','edit','00000000-0000-4000-8000-000000004464',s.id,s.revision,
  '{"title":"Retitled recurring Task"}')
  from tasks t join task_series s on s.id=t.recurrence_series_id
  where t.title='Atomic recurring Task' and t.due_date='2099-12-10'$$,
  'a title-only edit succeeds across the series');
select is((select array_agg(r.minutes_before order by t.due_date)
  from tasks t join task_reminder_offsets r on r.task_id=t.id
  where t.title='Retitled recurring Task'),array[60,20,60],'the series edit preserved individual reminders');
select is((select due_time from tasks where title='Retitled recurring Task' and due_date='2099-12-11'),
  '13:30'::time,'the series edit preserved the individual due time');
select lives_ok($$select mutate_recurring_task_with_resources_atomic(
  '{"reminder_offsets":[],"due_time":null}',t.id,'following','edit',
  '00000000-0000-4000-8000-000000004465',s.id,s.revision)
  from tasks t join task_series s on s.id=t.recurrence_series_id
  where t.title='Retitled recurring Task' and t.due_date='2099-12-11'$$,
  'explicit clearing affects the selected and following occurrences');
select is((select count(*) from tasks t join task_reminder_offsets r on r.task_id=t.id
  where t.title='Retitled recurring Task'),1::bigint,'only the earlier Task retained its reminder');
select is((select count(*) from tasks t where t.title='Retitled recurring Task' and t.due_time is not null),
  1::bigint,'only the earlier Task retained its due time');
select is((select count(*) from tasks t join task_notification_targets a on a.task_id=t.id
  where t.title='Retitled recurring Task' and a.all_active),3::bigint,'clearing reminders and due time preserves audience');

select lives_ok($$select mutate_recurring_task_with_resources_atomic(
  '{"due_time":"17:00"}',t.id,'series','edit','00000000-0000-4000-8000-000000004466',
  s.id,s.revision,'{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2099-12-10'::date,'2099-12-11'],
  array[(select id from events where name='Atomic Event')],
  '[{"kind":"documentation","label":"Documentation","url":"https://example.test/shorter-series"}]')
  from tasks t join task_series s on s.id=t.recurrence_series_id
  where t.title='Retitled recurring Task' and t.due_date='2099-12-12'$$,
  'editing from the removed tail occurrence can shorten the series and save its links and settings');
select is((select count(*) from task_events l join tasks t on l.task_id=t.id
  where t.title='Retitled recurring Task' and t.removed_at is null
    and l.event_id=(select id from events where name='Atomic Event')),
  2::bigint,'both retained occurrences received the intended Event link');
select is((select count(*) from resource_links l join tasks t on l.task_id=t.id
  where t.title='Retitled recurring Task' and t.removed_at is null
    and l.url='https://example.test/shorter-series'),
  2::bigint,'both retained occurrences received the intended resource link');
select is((select count(*) from tasks t
  where t.title='Retitled recurring Task' and t.removed_at is null and t.due_time='17:00'),
  2::bigint,'both retained occurrences received the intended due time');

select lives_ok($$select create_recurring_event_with_resources_atomic(
  '{"audience":{"all_active":true,"branch_ids":[],"position_ids":[]},"reminder_offsets":[90]}',
  'Atomic recurring Event','Details',(select id from event_types where name='Session'),'Campus',
  '{}',null,null,null,0,'00000000-0000-4000-8000-000000004468','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-12-10'::date,'2099-12-11','2099-12-12'],
  array['2099-12-10 16:00Z'::timestamptz,'2099-12-11 16:00Z','2099-12-12 16:00Z'],
  array['2099-12-10 17:00Z'::timestamptz,'2099-12-11 17:00Z','2099-12-12 17:00Z'],null,'[]')$$,
  'recurring Event creation commits its settings');
select lives_ok($$select mutate_recurring_event_with_resources_atomic(
  '{"audience":{"all_active":false,"branch_ids":[],"position_ids":[]},"reminder_offsets":[45]}',
  e.id,'occurrence','edit','00000000-0000-4000-8000-000000004469',s.id,s.revision)
  from events e join event_series s on s.id=e.recurrence_series_id
  where e.name='Atomic recurring Event' and e.event_date='2099-12-11'$$,
  'an Event occurrence can override its own settings');
select lives_ok($$select mutate_recurring_event_with_resources_atomic(
  '{}',e.id,'series','edit','00000000-0000-4000-8000-000000004470',s.id,s.revision,
  '{"name":"Retitled recurring Event"}')
  from events e join event_series s on s.id=e.recurrence_series_id
  where e.name='Atomic recurring Event' and e.event_date='2099-12-10'$$,'retitling preserves other settings');
select is((select array_agg(r.minutes_before order by e.event_date)
  from events e join event_reminder_offsets r on r.event_id=e.id
  where e.name='Retitled recurring Event'),array[90,45,90],
  'the Event series edit preserved independent reminders');
select is((select count(*) from events e join event_notification_targets a on a.event_id=e.id
  where e.name='Retitled recurring Event' and a.all_active),2::bigint,
  'the Event series edit preserved the occurrence audience override');

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004461',true);
set local role authenticated;
select throws_ok($$select pg_temp.save_event('{}','Unauthorized Event')$$,
  'P0001','Event outside branch scope','ordinary Officers cannot use the atomic Event endpoint to create Events');

select * from finish();
rollback;
