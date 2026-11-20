begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000468001','task-roster-lead@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-46801,'Task Roster Lead','task-roster-lead@example.test',
    (select id from positions where name='Lead'),'active','officer',
    '00000000-0000-4000-8000-000000468001'),
  (-46802,'Officer without a Branch','task-roster-unassigned@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-46803,'Officer in another Branch','task-roster-other-branch@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-46804,'Inactive Task Officer','task-roster-inactive@example.test',
    (select id from positions where name='Officer'),'inactive','officer',null);
insert into officer_branches(officer_id,branch_id)
  values(-46801,(select id from branches where name='intro')),
        (-46803,(select id from branches where name='icpc'));

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000468001',true);
set local role authenticated;
select set_config('test.task_occurrence_id',public.create_recurring_task_with_resources_and_officers(
  'Roster first only','Details','Post',(select id from branches where name='intro'),2,false,
  '00000000-0000-4000-8000-000000004681','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-11-20'::date,'2099-11-21','2099-11-22'],array[]::bigint[],'[]'::jsonb,
  array[-46802,-46803]::bigint[],'occurrence')::text,true);
select is((select count(*) from public.task_officer_assignments a join public.tasks t on t.id=a.task_id
  where t.recurrence_series_id=(select recurrence_series_id from public.tasks
    where id=current_setting('test.task_occurrence_id')::bigint)),2::bigint,
  'default occurrence scope assigns Officers only to the first materialized Task');
reset role;
select is((select count(*) from public.notifications where kind='task.assigned'
  and entity_id=current_setting('test.task_occurrence_id')::bigint
  and recipient_officer_id in (-46802,-46803)),2::bigint,
  'each directly assigned Officer receives one personal notice outside any audience');
set local role authenticated;
select is(public.create_recurring_task_with_resources_and_officers(
  'Roster first only','Details','Post',(select id from branches where name='intro'),2,false,
  '00000000-0000-4000-8000-000000004681','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-11-20'::date,'2099-11-21','2099-11-22'],array[]::bigint[],'[]'::jsonb,
  array[-46802,-46803]::bigint[],'occurrence'),
  current_setting('test.task_occurrence_id')::bigint,
  'an exact recurring Task roster retry returns its original occurrence');
reset role;
select is((select count(*) from public.notifications where kind='task.assigned'
  and entity_id=current_setting('test.task_occurrence_id')::bigint
  and recipient_officer_id in (-46802,-46803)),2::bigint,
  'an exact retry does not send duplicate assignment notices');
set local role authenticated;
select throws_ok($$select public.create_recurring_task_with_resources_and_officers(
  'Roster first only','Details','Post',(select id from branches where name='intro'),2,false,
  '00000000-0000-4000-8000-000000004681','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-11-20'::date,'2099-11-21','2099-11-22'],array[]::bigint[],'[]'::jsonb,
  array[-46802,-46803]::bigint[],'series')$$,'P0001',
  'Recurring Task creation request does not match its original assignment selection',
  'the same recurring Task request cannot change from occurrence to series scope');

select set_config('test.task_series_id',public.create_recurring_task_with_resources_and_officers(
  'Roster whole series','Details','Post',(select id from branches where name='intro'),2,false,
  '00000000-0000-4000-8000-000000004682','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-12-01'::date,'2099-12-02','2099-12-03'],array[]::bigint[],'[]'::jsonb,
  array[-46802,-46803]::bigint[],'series')::text,true);
select is((select count(*) from public.task_officer_assignments a join public.tasks t on t.id=a.task_id
  where t.recurrence_series_id=(select recurrence_series_id from public.tasks
    where id=current_setting('test.task_series_id')::bigint)),6::bigint,
  'series scope assigns selected Officers to every independently identified Task occurrence');
reset role;
select is((select count(*) from public.notifications where kind='task.assigned'
  and entity_id in (select id from public.tasks where recurrence_series_id=
    (select recurrence_series_id from public.tasks where id=current_setting('test.task_series_id')::bigint))
  and recipient_officer_id in (-46802,-46803)),6::bigint,
  'series assignments notify each Officer once per materialized Task occurrence');
set local role authenticated;
select throws_ok($$select public.create_recurring_task_with_resources_and_officers(
  'Failed Task roster','Details','Post',(select id from branches where name='intro'),2,false,
  '00000000-0000-4000-8000-000000004683','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
  array['2099-12-10'::date,'2099-12-11'],array[]::bigint[],'[]'::jsonb,
  array[-46802,-46804]::bigint[],'series')$$,'P0001','Every selected officer must be active',
  'an inactive selected Officer rejects the entire recurring Task create');
select is((select count(*) from public.tasks where title='Failed Task roster'),0::bigint,
  'a failed recurring Task assignment leaves no partial Task series');
reset role;

select * from finish();
rollback;
