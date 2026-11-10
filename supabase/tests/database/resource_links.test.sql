begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
values ('00000000-0000-4000-8000-000000001414','resource-links-admin@example.org',now(),'{}');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id)
values (-1414,'Resource Links Admin','resource-links-admin@example.org',
  (select id from positions where name='Officer'),'admin','active','00000000-0000-4000-8000-000000001414');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001414',true);
set local role authenticated;

select ok(has_table_privilege('authenticated','public.resource_links','SELECT')
  and not has_table_privilege('authenticated','public.resource_links','INSERT')
  and not has_table_privilege('authenticated','public.resource_links','UPDATE')
  and not has_table_privilege('authenticated','public.resource_links','DELETE'),
  'officers can read child links through parent visibility but cannot write directly');

select lives_ok($$select public.save_event_with_signup_sheet('Legacy resource fixture','Details',
  (select id from event_types where name='Session'),'Campus','2099-11-14','2099-11-14 16:00Z',
  '2099-11-14 17:00Z','{}','https://example.org/signup',null,
  'https://example.org/slides','https://example.org/notes')$$,
  'the deployed Event RPC still accepts the legacy resource columns');
select is((select count(*) from resource_links r join events e on e.id=r.event_id
  where e.name='Legacy resource fixture' and r.legacy_key is not null),3::bigint,
  'legacy Event columns create one marked child row for each existing link');
select lives_ok($$select public.save_event_with_signup_sheet('Legacy resource fixture','Details',
  (select id from event_types where name='Session'),'Campus','2099-11-14','2099-11-14 16:00Z',
  '2099-11-14 17:00Z','{}','https://example.org/signup-updated',
  (select id from events where name='Legacy resource fixture'),
  'https://example.org/slides','https://example.org/notes')$$,
  'the deployed Event RPC can update its compatibility values');
select is((select count(*) from resource_links r join events e on e.id=r.event_id
  where e.name='Legacy resource fixture' and r.legacy_key is not null),3::bigint,
  'repeated legacy synchronization remains unique and idempotent');
select is((select url from resource_links r join events e on e.id=r.event_id
  where e.name='Legacy resource fixture' and r.legacy_key='signup_sheet'),
  'https://example.org/signup-updated','legacy edits update the marked Signup sheet row');

select lives_ok($$select public.save_task_with_resources('Resource Task','Details','Post',
  (select id from branches where name='intro'),'2099-11-15',3,false,array[]::bigint[],
  '[{"kind":"custom","label":"Runbook","url":"https://example.org/runbook"}]'::jsonb)$$,
  'Task resources save atomically through the trusted RPC');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Resource Task'),1::bigint,'Task owns a separate resource row');
select throws_ok($$insert into resource_links(task_id,kind,label,url)
  select id,'custom','Bypass','https://example.org' from tasks where title='Resource Task'$$,
  '42501',null,'authenticated callers cannot insert resource rows directly');
select throws_ok($$select public.save_task_with_resources('Invalid Resource Task','Details','Post',
  (select id from branches where name='intro'),'2099-11-16',3,false,array[]::bigint[],
  '[{"kind":"custom","label":"Unsafe","url":"javascript:alert(1)"}]'::jsonb)$$,
  'P0001','Invalid resource link','trusted RPC rejects non-HTTP(S) URLs');
select is((select count(*) from tasks where title='Invalid Resource Task'),0::bigint,
  'resource validation failure rolls back the parent Task insert');
select lives_ok($$select public.update_task_details_with_resources(
  (select id from tasks where title='Resource Task'),'Resource Task','Details','Post',
  (select id from branches where name='intro'),'2099-11-15',3,array[]::bigint[],'[]'::jsonb)$$,
  'clearing the Task resource list succeeds');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Resource Task'),0::bigint,'removing a child link leaves its Task intact');
select is((select count(*) from tasks where title='Resource Task'),1::bigint,
  'removing all child links does not delete the parent Task');

select lives_ok($$select public.create_recurring_task_with_resources('Recurring Resource Task',
  'Details','Post',(select id from branches where name='intro'),3,false,
  '00000000-0000-4000-8000-000000001415','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-11-20'::date,'2099-11-21','2099-11-22'],array[]::bigint[],
  '[{"kind":"documentation","label":"Documentation","url":"https://example.org/task-docs"}]'::jsonb)$$,
  'recurring Task creation applies its resources to every new occurrence');
select lives_ok($$select public.mutate_recurring_task_with_resources(
  (select id from tasks where title='Recurring Resource Task' order by recurrence_key offset 1 limit 1),
  'occurrence','edit','00000000-0000-4000-8000-000000001416',
  (select recurrence_series_id from tasks where title='Recurring Resource Task' limit 1),0,'{}',null,null,
  null,'[{"kind":"custom","label":"Selected","url":"https://example.org/selected"}]'::jsonb)$$,
  'resource-only edit uses the trusted occurrence scope receipt');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and t.recurrence_key='2099-11-20'
    and r.label='Documentation'),1::bigint,'occurrence scope leaves earlier links unchanged');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and t.recurrence_key='2099-11-21'
    and r.label='Selected'),1::bigint,'occurrence scope changes only the selected row');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and t.recurrence_key='2099-11-22'
    and r.label='Documentation'),1::bigint,'occurrence scope leaves later links unchanged');
select lives_ok($$select public.mutate_recurring_task_with_resources(
  (select id from tasks where title='Recurring Resource Task' order by recurrence_key offset 1 limit 1),
  'occurrence','edit','00000000-0000-4000-8000-000000001417',
  (select recurrence_series_id from tasks where title='Recurring Resource Task' limit 1),1,
  '{"description":"Updated without changing resources"}',null,null,null,null)$$,
  'a non-resource recurrence edit can omit the resource mutation');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and r.label='Selected'),1::bigint,
  'omitted resources are not fanned out to recurrence siblings');
select lives_ok($$select remove_task((select id from tasks where title='Recurring Resource Task'
  order by recurrence_key desc limit 1))$$,'a recurring Task occurrence can be removed independently');
select lives_ok($$select public.mutate_recurring_task_with_resources(
  (select id from tasks where title='Recurring Resource Task' order by recurrence_key offset 1 limit 1),
  'following','edit','00000000-0000-4000-8000-000000001418',
  (select recurrence_series_id from tasks where title='Recurring Resource Task' limit 1),
  (select s.revision from task_series s join tasks t on t.recurrence_series_id=s.id
    where t.title='Recurring Resource Task' limit 1),
  '{"description":"Edit remaining occurrences"}',null,null,null,
  '[{"kind":"custom","label":"Following","url":"https://example.org/following"}]'::jsonb)$$,
  'following resource edit skips removed recurrence targets instead of failing');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and t.removed_at is not null
    and r.label='Documentation'),1::bigint,
  'removed occurrence keeps its restorable resource history');
select is((select count(*) from resource_links r join tasks t on t.id=r.task_id
  where t.title='Recurring Resource Task' and t.removed_at is null
    and r.label='Following'),1::bigint,
  'following scope updates only the remaining active occurrence');

reset role;
select * from finish();
rollback;
