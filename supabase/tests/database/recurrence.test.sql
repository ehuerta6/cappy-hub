begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000981','recurrence-admin@example.org'),
  ('00000000-0000-4000-8000-000000000982','recurrence-officer@example.org');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
  (-981,'Recurrence Admin','recurrence-admin@example.org',(select id from positions where name='Officer'),'admin','active','00000000-0000-4000-8000-000000000981'),
  (-982,'Recurrence Officer','recurrence-officer@example.org',(select id from positions where name='Officer'),'officer','active','00000000-0000-4000-8000-000000000982');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000981',true);
set local role authenticated;
select set_config('test.recurring_event_id',create_recurring_event(
  'Recurring workshop','A repeated workshop',(select id from event_types where name='Workshop'),
  'Campus','{}'::bigint[],null,null,'00000000-0000-4000-8000-000000000003',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-03-06'::date,'2099-03-07','2099-03-08'],
  array['2099-03-06 10:00-07'::timestamptz,'2099-03-07 10:00-07','2099-03-08 10:00-07'],
  array['2099-03-06 11:00-07'::timestamptz,'2099-03-07 11:00-07','2099-03-08 11:00-07'])::text,true);
select is(create_recurring_event(
  'Recurring workshop','A repeated workshop',(select id from event_types where name='Workshop'),
  'Campus','{}'::bigint[],null,null,'00000000-0000-4000-8000-000000000003',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-03-06'::date,'2099-03-07','2099-03-08'],
  array['2099-03-06 10:00-07'::timestamptz,'2099-03-07 10:00-07','2099-03-08 10:00-07'],
  array['2099-03-06 11:00-07'::timestamptz,'2099-03-07 11:00-07','2099-03-08 11:00-07']),
  current_setting('test.recurring_event_id')::bigint,
  'retrying Event materialization returns its original first occurrence');
select is((select count(*) from events where recurrence_key between '2099-03-06' and '2099-03-08'),3::bigint,
  'recurring Event creation materializes three independent Events');
select is((select count(distinct recurrence_series_id) from events where recurrence_key between '2099-03-06' and '2099-03-08'),1::bigint,
  'Event occurrences share only their series metadata');
reset role;
select throws_ok($$update events set recurrence_key='2099-03-06'
  where recurrence_key='2099-03-07'$$,'23505',null,
  'unique series/date identity rejects a duplicate occurrence');
select lives_ok($$insert into event_officers(event_id,officer_id)
  values((select id from events where recurrence_key='2099-03-06'),-982)$$,
  'one Event occurrence accepts its own signup');
select is((select count(*) from event_officers eo join events e on e.id=eo.event_id
  where e.recurrence_key='2099-03-07'),0::bigint,
  'signup does not leak to another occurrence');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000981',true);
set local role authenticated;
select lives_ok($$select cancel_event((select id from events where recurrence_key='2099-03-06'))$$,
  'one future occurrence can be cancelled');
select is((select status from events where recurrence_key='2099-03-06'),'cancelled',
  'cancelled occurrence stores its own status');
select is((select status from events where recurrence_key='2099-03-07'),'upcoming',
  'cancelling one occurrence leaves the next occurrence scheduled');
select lives_ok($$select restore_event((select id from events where recurrence_key='2099-03-06'))$$,
  'one cancelled occurrence can be restored independently');
select is((select status from events where recurrence_key='2099-03-06'),'upcoming',
  'restored occurrence keeps its independent status');
select is((select status from events where recurrence_key='2099-03-07'),'upcoming',
  'restoring one occurrence leaves its sibling unchanged');
reset role;
insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-982,(select id from events where recurrence_key='2099-03-07'),2,'Test participation','participation')
  on conflict(officer_id,event_id) where award_type='participation' do nothing;
insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-982,(select id from events where recurrence_key='2099-03-07'),2,'Test participation','participation')
  on conflict(officer_id,event_id) where award_type='participation' do nothing;
select is((select count(*) from point_transactions p join events e on e.id=p.event_id
  where e.recurrence_key='2099-03-07' and p.officer_id=-982 and p.award_type='participation'),
  1::bigint,'participation point award stays idempotent per Event occurrence');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000981',true);
set local role authenticated;
select set_config('test.recurring_task_id',create_recurring_task(
  'Recurring post','Publish the next post','Post',(select id from branches where name='intro'),
  2.5,false,'00000000-0000-4000-8000-000000000004',
  'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=3',
  array['2099-09-21'::date,'2099-09-23','2099-09-28'])::text,true);
select is(create_recurring_task(
  'Recurring post','Publish the next post','Post',(select id from branches where name='intro'),
  2.5,false,'00000000-0000-4000-8000-000000000004',
  'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=3',
  array['2099-09-21'::date,'2099-09-23','2099-09-28']),
  current_setting('test.recurring_task_id')::bigint,
  'retrying Task materialization returns its original first occurrence');
select is((select count(*) from tasks where recurrence_key between '2099-09-21' and '2099-09-28'),3::bigint,
  'recurring Task creation materializes independent date-only Tasks');
select is((select count(distinct recurrence_series_id) from tasks where recurrence_key between '2099-09-21' and '2099-09-28'),1::bigint,
  'Task occurrences share only their series metadata');
select lives_ok($$select assign_task((select id from tasks where recurrence_key='2099-09-21'),-982)$$,
  'one Task occurrence can be assigned independently');
select is((select count(*) from task_assignments a join tasks t on t.id=a.task_id
  where t.recurrence_key='2099-09-23'),0::bigint,
  'assignment does not leak to another Task occurrence');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000982',true);
select lives_ok($$select complete_task((select id from tasks where recurrence_key='2099-09-21'))$$,
  'the assignee can complete their Task occurrence');
reset role;
select is((select count(*) from point_transactions p join tasks t on t.id=p.task_id
  where t.recurrence_key='2099-09-21' and p.award_type='task'),1::bigint,
  'Task completion awards points to the completed occurrence');
insert into point_transactions(officer_id,task_id,points,reason,award_type)
  values(-982,(select id from tasks where recurrence_key='2099-09-21'),2.5,'Duplicate test','task')
  on conflict(task_id) where award_type='task' do nothing;
select is((select count(*) from point_transactions p join tasks t on t.id=p.task_id
  where t.recurrence_key='2099-09-21' and p.award_type='task'),1::bigint,
  'Task point award uniqueness prevents duplicate occurrence points');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000981',true);
set local role authenticated;
select lives_ok($$select remove_task((select id from tasks where recurrence_key='2099-09-23'))$$,
  'an unfinished Task occurrence can be removed independently');
reset role;
select isnt((select removed_at from tasks where recurrence_key='2099-09-23'),null::timestamptz,
  'removed occurrence is retained with a removal timestamp');
select is((select removed_at from tasks where recurrence_key='2099-09-28'),null::timestamptz,
  'removing one Task leaves later occurrences active');
select is((select count(*) from audit_logs where entity_type='event' and entity_id=
  (select id::text from events where recurrence_key='2099-03-06') and action='event.cancelled'),1::bigint,
  'cancellation audit identifies the individual Event occurrence');
select is((select count(*) from audit_logs where entity_type='task' and entity_id=
  (select id::text from tasks where recurrence_key='2099-09-23') and action='task.removed'),1::bigint,
  'removal audit identifies the individual Task occurrence');
select is((select count(*) from audit_logs where action in ('event.series_created','task.series_created')),
  2::bigint,'both recurrence series have audit records');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000982',true);
set local role authenticated;
select throws_ok($$select create_recurring_task('No access','No access','Post',
  (select id from branches where name='intro'),1,false,
  '00000000-0000-4000-8000-000000000005',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-10-01'::date,'2099-10-02'])$$,
  'P0001','Task outside branch scope','recurring Task mutation enforces trusted branch authorization');
select throws_ok($$select create_recurring_event('No access','No access',
  (select id from event_types where name='Workshop'),'Campus','{}'::bigint[],null,null,
  '00000000-0000-4000-8000-000000000006',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-10-01'::date,'2099-10-02'],
  array['2099-10-01 10:00-06'::timestamptz,'2099-10-02 10:00-06'],
  array['2099-10-01 11:00-06'::timestamptz,'2099-10-02 11:00-06'])$$,
  'P0001','Event outside branch scope','recurring Event mutation enforces trusted branch authorization');
reset role;
select * from finish();
rollback;
