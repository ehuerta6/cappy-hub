begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000001790','task-event-admin@example.org'),
  ('00000000-0000-4000-8000-000000001791','task-event-officer@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
  (-1790,'Task Event Admin','task-event-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000001790'),
  (-1791,'Task Event Officer','task-event-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001791');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
values
  (-1790,'Linked event one','Historical context','Campus',(select id from event_types where name='Meeting'),'2099-09-01','2099-09-01 09:00-06','2099-09-01 10:00-06','upcoming'),
  (-1791,'Linked event two','Second context','Campus',(select id from event_types where name='Meeting'),'2099-09-02','2099-09-02 09:00-06','2099-09-02 10:00-06','upcoming'),
  (-1792,'Cancelled event','Historical context','Campus',(select id from event_types where name='Meeting'),'2099-09-03','2099-09-03 09:00-06','2099-09-03 10:00-06','upcoming'),
  (-1793,'Archived event','Historical context','Campus',(select id from event_types where name='Meeting'),'2099-09-04','2099-09-04 09:00-06','2099-09-04 10:00-06','upcoming'),
  (-1794,'Recurring event','Recurring context','Campus',(select id from event_types where name='Meeting'),'2099-09-05','2099-09-05 09:00-06','2099-09-05 10:00-06','upcoming'),
  (-1795,'Previously archived event','Historical context','Campus',(select id from event_types where name='Meeting'),'2099-09-06','2099-09-06 09:00-06','2099-09-06 10:00-06','upcoming');
update events set status='cancelled' where id=-1792;
update events set deleted_at=pg_catalog.now(),deleted_by='00000000-0000-4000-8000-000000001790'
where id=-1795;
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (-1790,'Linked task one','Task details','Flyer',(select id from branches where name='intro'),'2099-09-05',3,false,-1790),
  (-1791,'Linked task two','Task details','Flyer',(select id from branches where name='intro'),'2099-09-06',4,false,-1790);

select ok(has_table_privilege('authenticated','public.task_events','SELECT')
  and not has_table_privilege('authenticated','public.task_events','INSERT')
  and not has_table_privilege('authenticated','public.task_events','DELETE'),
  'active Officers can read links but cannot write around the trusted mutation');
select ok(has_function_privilege('authenticated','public.set_task_event_links(bigint[],bigint[])','EXECUTE')
  and not has_function_privilege('anon','public.set_task_event_links(bigint[],bigint[])','EXECUTE'),
  'only authenticated callers can invoke the Task-authorized link mutation');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001790',true);
set local role authenticated;
select lives_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790,-1791]::bigint[])$$,
  'manager links one Task to multiple Events');
select lives_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1790]::bigint[])$$,
  'multiple Tasks can link to the same Event');
select is((select count(*) from task_events where event_id=-1790),2::bigint,
  'the relationship is many-to-many');
select lives_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790,-1791]::bigint[])$$,
  'repeating the same selection is safe');
select is((select count(*) from task_events where task_id=-1790),2::bigint,
  'repeated selections do not duplicate links');
select throws_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790,-1790]::bigint[])$$,
  'P0001','Invalid Task Event links','duplicate Event IDs are rejected by the mutation');
select throws_ok($$select set_task_event_links(array[-1790]::bigint[],array[-9999]::bigint[])$$,
  'P0001','Event not found','unknown Event IDs are rejected');
select throws_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1795]::bigint[])$$,
  'P0001','Archived or cancelled Events cannot be newly linked','archived Events cannot be newly selected');
select throws_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1792]::bigint[])$$,
  'P0001','Archived or cancelled Events cannot be newly linked','cancelled Events cannot be newly selected');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001791',true);
set local role authenticated;
select throws_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790]::bigint[])$$,
  'P0001','Task outside branch scope','linking does not grant Task management permission');
reset role;
select throws_ok($$insert into task_events(task_id,event_id) values(-1790,-1790)$$,
  '23505',null,'the Task/Event pair primary key prevents duplicate links');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001790',true);
set local role authenticated;
select lives_ok($$select cancel_event(-1790)$$,'the Event can be cancelled independently');
select is((select count(*) from task_events where task_id=-1790 and event_id=-1790),1::bigint,
  'cancellation preserves existing links');
select lives_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790,-1791]::bigint[])$$,
  'an unchanged cancelled Event link remains readable and can be retained');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001790',true);
set local role authenticated;
select lives_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1793]::bigint[])$$,
  'a Task links to a second Event before its archival');
select lives_ok($$select remove_event(-1793)$$,'the Event can be archived independently');
select is((select count(*) from task_events where task_id=-1791 and event_id=-1793),1::bigint,
  'archival preserves existing Task/Event links');
select is((select count(*) from task_events where task_id=-1790),2::bigint,
  'other historical links remain after an Event lifecycle change');
select lives_ok($$select set_task_event_links(array[-1790]::bigint[],array[-1790,-1791]::bigint[])$$,
  'existing relationships remain when an Event is archived later');
select lives_ok($$select set_task_event_links(array[-1790]::bigint[],array[]::bigint[])$$,
  'links may be removed through normal Task edit');
select is((select count(*) from task_events where task_id=-1790),0::bigint,
  'an empty Event selection leaves a Task unlinked');
select lives_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1793,-1791]::bigint[])$$,
  'an existing archived Event link can be retained while another is added');
select lives_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1791]::bigint[])$$,
  'an existing archived Event link can be removed');
select throws_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1793]::bigint[])$$,
  'P0001','Archived or cancelled Events cannot be newly linked','a removed archived link cannot be newly added');
select throws_ok($$select set_task_event_links(array[-1791]::bigint[],array[-1792,-1791]::bigint[])$$,
  'P0001','Archived or cancelled Events cannot be newly linked','a cancelled Event cannot be newly added to another Task');
select lives_ok($$select remove_task(-1791)$$,'the linked Task can be archived independently');
select is((select count(*) from task_events where task_id=-1791 and event_id=-1791),1::bigint,
  'Task archival preserves its Event link');
select lives_ok($$select restore_task(-1791)$$,'the linked Task can be restored independently');
select is((select count(*) from task_events where task_id=-1791 and event_id=-1791),1::bigint,
  'Task restoration preserves its Event link');

select lives_ok($$select create_recurring_task_with_events('Linked recurring Task','Recurring work','Flyer',
  (select id from branches where name='intro'),2,false,'00000000-0000-4000-8000-000000001799',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-09-10'::date,'2099-09-11'::date,'2099-09-12'::date],array[-1791]::bigint[])$$,
  'recurring Task creation links every occurrence in one mutation');
select is((select count(*) from task_events te join tasks t on t.id=te.task_id
  where t.recurrence_series_id=(select recurrence_series_id from tasks where title='Linked recurring Task' limit 1)
    and te.event_id=-1791),3::bigint,'all recurring occurrences keep their link identity');
select ok((select details->'added_events' @> '[{"id":-1791,"name":"Linked event two"}]'::jsonb
  from audit_logs where action='task.created'
    and entity_id=(select id::text from tasks where title='Linked recurring Task' and recurrence_key='2099-09-10')),
  'Task creation audit context includes linked Event names');
select lives_ok($$select mutate_recurring_task_with_events(
  (select id from tasks where title='Linked recurring Task' and recurrence_key='2099-09-11'),
  'following','edit','00000000-0000-4000-8000-000000001798',
  (select recurrence_series_id from tasks where title='Linked recurring Task' limit 1),0,'{}',null,null,array[-1794]::bigint[])$$,
  'recurring link changes use the selected following scope');
select is((select count(*) from task_events te join tasks t on t.id=te.task_id
  where t.title='Linked recurring Task' and t.recurrence_key='2099-09-10' and te.event_id=-1791),1::bigint,
  'following edit leaves the earlier occurrence link unchanged');
select is((select count(*) from task_events te join tasks t on t.id=te.task_id
  where t.title='Linked recurring Task' and t.recurrence_key in ('2099-09-11','2099-09-12') and te.event_id=-1794),2::bigint,
  'following edit changes links on both selected occurrences');
select ok((select details->'added_events' @> '[{"id":-1794,"name":"Recurring event"}]'::jsonb
  from audit_logs where action='task.updated'
    and entity_id=(select id::text from tasks where title='Linked recurring Task' and recurrence_key='2099-09-11')),
  'Task edit audit context includes added and removed Event names');
reset role;

select is((select count(*) from audit_logs where action='task.event_links_updated' and entity_id='-1790'),2::bigint,
  'the initial link addition and explicit link removal are audited once each');
select is((select points from tasks where id=-1790),3::numeric,
  'link changes do not alter Task Points');
select is((select count(*) from point_transactions where task_id=-1790),0::bigint,
  'link changes do not create Task Point transactions');
select * from finish();
rollback;
