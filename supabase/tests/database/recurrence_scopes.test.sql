begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000681','scope-admin@example.org'),
 ('00000000-0000-4000-8000-000000000682','scope-lead@example.org'),
 ('00000000-0000-4000-8000-000000000683','scope-officer@example.org'),
 ('00000000-0000-4000-8000-000000000684','scope-executive@example.org');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
 (-681,'Scope Admin','scope-admin@example.org',(select id from positions where name='Officer'),'admin','active','00000000-0000-4000-8000-000000000681'),
 (-682,'Scope Lead','scope-lead@example.org',(select id from positions where name='Lead'),'officer','active','00000000-0000-4000-8000-000000000682'),
 (-683,'Scope Officer','scope-officer@example.org',(select id from positions where name='Officer'),'officer','active','00000000-0000-4000-8000-000000000683'),
 (-684,'Scope Executive','scope-executive@example.org',(select id from positions where name='President'),'officer','active','00000000-0000-4000-8000-000000000684');
insert into officer_branches select -682,id from branches where name='intro';
create temporary table fixtures(label text primary key,domain text,series_id bigint,ids bigint[]);
grant select on fixtures to authenticated;
create function pg_temp.fixture(p_label text,p_domain text,p_count integer default 3,p_start date default '2099-03-06',p_interval integer default 1)
returns void language plpgsql security definer set search_path='' as $$
declare dates date[]; first_id bigint; fixture_series_id bigint;
begin
 select array_agg(p_start+n*p_interval order by n) into dates from generate_series(0,p_count-1) n;
 if p_domain='event' then
  first_id := public.create_recurring_event(p_label,'Details',(select id from public.event_types where name='Workshop'),
   'Campus','{}',null,null,gen_random_uuid(),case when p_interval=7 then 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT='||p_count else 'RRULE:FREQ=DAILY;INTERVAL='||p_interval||';COUNT='||p_count end,dates,
   array(select (d+time '10:00') at time zone 'America/Denver' from unnest(dates) d),
   array(select (d+time '11:00') at time zone 'America/Denver' from unnest(dates) d));
  select recurrence_series_id into fixture_series_id from public.events where id=first_id;
  insert into pg_temp.fixtures select p_label,p_domain,fixture_series_id,array_agg(id order by recurrence_key)
   from public.events where recurrence_series_id=fixture_series_id;
 else
  first_id := public.create_recurring_task(p_label,'Details','Post',(select id from public.branches where name='intro'),
   3,true,gen_random_uuid(),case when p_interval=7 then 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT='||p_count else 'RRULE:FREQ=DAILY;INTERVAL='||p_interval||';COUNT='||p_count end,dates);
  select recurrence_series_id into fixture_series_id from public.tasks where id=first_id;
  insert into pg_temp.fixtures select p_label,p_domain,fixture_series_id,array_agg(id order by recurrence_key)
   from public.tasks where recurrence_series_id=fixture_series_id;
 end if;
end $$;
create function pg_temp.id(p_label text,n integer) returns bigint language sql as $$select ids[n] from pg_temp.fixtures where label=p_label$$;
create function pg_temp.mutate(p_label text,n integer,p_scope text,p_operation text,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null)
returns bigint language plpgsql set search_path='' as $$
declare row_id bigint:=pg_temp.id(p_label,n); series_id bigint; revision integer;
begin
 if (select domain from pg_temp.fixtures where label=p_label)='event' then
  select e.recurrence_series_id,s.revision into series_id,revision from public.events e join public.event_series s on s.id=e.recurrence_series_id where e.id=row_id;
  return public.mutate_recurring_event(row_id,p_scope,p_operation,gen_random_uuid(),series_id,revision,p_patch,p_rule,p_dates);
 else
  select t.recurrence_series_id,s.revision into series_id,revision from public.tasks t join public.task_series s on s.id=t.recurrence_series_id where t.id=row_id;
  return public.mutate_recurring_task(row_id,p_scope,p_operation,gen_random_uuid(),series_id,revision,p_patch,p_rule,p_dates);
 end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000681',true);
select pg_temp.fixture('event-fields','event');
insert into event_officers values(pg_temp.id('event-fields',1),-683),(pg_temp.id('event-fields',2),-683);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-fields',2,'occurrence','edit','{"name":"Only second","event_date":"2099-03-20","start_time":"12:00","end_time":"13:00"}')$$,'Event occurrence edit');
select is((select name from events where id=pg_temp.id('event-fields',1)),'event-fields','Event sibling details unchanged');
select is((select event_date::text from events where id=pg_temp.id('event-fields',2)),'2099-03-20','single Event date is an exception');
select is((select recurrence_key::text from events where id=pg_temp.id('event-fields',2)),'2099-03-07','single edit preserves original recurrence identity');
select lives_ok($$select cancel_event(pg_temp.id('event-fields',3))$$,'prepare cancelled sibling');
select lives_ok($$select pg_temp.mutate('event-fields',2,'following','edit','{"location":"New room"}')$$,'following Event metadata edit');
select is((select location from events where id=pg_temp.id('event-fields',1)),'Campus','earlier Event location untouched');
select is((select location from events where id=pg_temp.id('event-fields',3)),'New room','following includes later cancelled Event');
select is((select status from events where id=pg_temp.id('event-fields',3)),'cancelled','cancelled state preserved during edit');
select lives_ok($$select pg_temp.mutate('event-fields',1,'series','edit','{"description":"Shared details"}')$$,'whole-series Event metadata edit');
select is((select name from events where id=pg_temp.id('event-fields',2)),'Only second','unsubmitted Event override preserved');
select is((select count(*) from event_officers where event_id in (select unnest(ids) from pg_temp.fixtures where label='event-fields')),2::bigint,'all Event signups preserved');
select lives_ok($$select pg_temp.mutate('event-fields',2,'occurrence','remove')$$,'individual Event removal');
select ok((select deleted_at is null from events where id=pg_temp.id('event-fields',1)),'individual removal leaves sibling active');
select lives_ok($$select pg_temp.mutate('event-fields',1,'series','remove')$$,'whole-series Event logical removal');
select is((select count(*) from events where id in (select unnest(ids) from pg_temp.fixtures where label='event-fields') and deleted_at is not null),3::bigint,'all Event rows retained with removal markers');
select ok((select retired from event_series where id=(select series_id from pg_temp.fixtures where label='event-fields')),'removed Event series retired');
reset role;
select pg_temp.fixture('event-50','event',50,'2099-09-21',7);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-50',6,'following','remove')$$,'event 50 to 5 correction is one operation');
select is((select count(*) from events where id in (select unnest(ids) from pg_temp.fixtures where label='event-50') and deleted_at is null),5::bigint,'event five earlier rows remain');
select is((select recurrence_rule from event_series where id=(select series_id from pg_temp.fixtures where label='event-50')),'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20991019','event canonical rule stops at occurrence five');
select is(public.mutate_recurring_event(pg_temp.id('event-50',1),'occurrence','edit','00000000-0000-4000-8000-000000000685',(select series_id from pg_temp.fixtures where label='event-50'),1,'{"name":"Retry title"}'),pg_temp.id('event-50',1),'event initial request succeeds');
select is(public.mutate_recurring_event(pg_temp.id('event-50',1),'occurrence','edit','00000000-0000-4000-8000-000000000685',(select series_id from pg_temp.fixtures where label='event-50'),1,'{"name":"Retry title"}'),pg_temp.id('event-50',1),'event exact retry succeeds after revision change');
select throws_ok($$select public.mutate_recurring_event(pg_temp.id('event-50',1),'series','remove',gen_random_uuid(),(select series_id from pg_temp.fixtures where label='event-50'),1)$$,'P0001','Series changed; reload and try again','event stale mutation rejected');
reset role;
select pg_temp.fixture('task-50','task',50,'2099-09-21',7);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('task-50',6,'following','remove')$$,'task 50 to 5 correction is one operation');
select is((select count(*) from tasks where id in (select unnest(ids) from pg_temp.fixtures where label='task-50') and removed_at is null),5::bigint,'task five earlier rows remain');
select is((select recurrence_rule from task_series where id=(select series_id from pg_temp.fixtures where label='task-50')),'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20991019','task canonical rule stops at occurrence five');
select is(public.mutate_recurring_task(pg_temp.id('task-50',1),'occurrence','edit','00000000-0000-4000-8000-000000000686',(select series_id from pg_temp.fixtures where label='task-50'),1,'{"title":"Retry title"}'),pg_temp.id('task-50',1),'task initial request succeeds');
select is(public.mutate_recurring_task(pg_temp.id('task-50',1),'occurrence','edit','00000000-0000-4000-8000-000000000686',(select series_id from pg_temp.fixtures where label='task-50'),1,'{"title":"Retry title"}'),pg_temp.id('task-50',1),'task exact retry succeeds after revision change');
select throws_ok($$select public.mutate_recurring_task(pg_temp.id('task-50',1),'series','remove',gen_random_uuid(),(select series_id from pg_temp.fixtures where label='task-50'),1)$$,'P0001','Series changed; reload and try again','task stale mutation rejected');
reset role;
select pg_temp.fixture('event-schedule','event',5);
insert into event_officers values(pg_temp.id('event-schedule',2),-683);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-schedule',2,'following','edit','{}','RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3',array['2099-03-07'::date,'2099-03-09','2099-03-11'])$$,'event future interval change splits series and shortens COUNT');
select is((select event_date::text from events where id=pg_temp.id('event-schedule',1)),'2099-03-06','event earlier date untouched');
select is((select recurrence_series_id from events where id=pg_temp.id('event-schedule',1)),(select series_id from pg_temp.fixtures where label='event-schedule'),'event earlier row keeps original series');
select isnt((select recurrence_series_id from events where id=pg_temp.id('event-schedule',2)),(select series_id from pg_temp.fixtures where label='event-schedule'),'event boundary row keeps ID and moves to future series');
select is((select event_date::text from events where id=pg_temp.id('event-schedule',3)),'2099-03-09','event existing third row receives new schedule');
select ok((select deleted_at is not null from events where id=pg_temp.id('event-schedule',5)),'event shortened tail logically removed');
select is((select recurrence_rule from event_series where id=(select series_id from pg_temp.fixtures where label='event-schedule')),'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20990306','event historical segment accurately truncated to one');
select is((select count(*) from event_officers where event_id=pg_temp.id('event-schedule',2)),1::bigint,'signup survives moving boundary row');
select lives_ok($$select pg_temp.mutate('event-schedule',2,'series','edit','{"start_time":"12:00","end_time":"13:00"}')$$,'future Event time change');
select is((select count(*) from events where id in (pg_temp.id('event-schedule',2),pg_temp.id('event-schedule',3),pg_temp.id('event-schedule',4)) and (starts_at at time zone 'America/Denver')::time=time '12:00'),3::bigint,'new Event wall time preserved across DST');
select is((select starts_at from events where id=pg_temp.id('event-schedule',2)),timestamptz '2099-03-07 19:00Z','before spring DST UTC offset');
select is((select starts_at from events where id=pg_temp.id('event-schedule',4)),timestamptz '2099-03-11 18:00Z','after spring DST UTC offset');
select lives_ok($$select pg_temp.mutate('event-schedule',2,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20990402',array['2099-04-01'::date,'2099-04-02'])$$,'event whole-series date change and UNTIL shortening');
select is((select event_date::text from events where id=pg_temp.id('event-schedule',2)),'2099-04-01','event all schedule update preserves selected ID');
select lives_ok($$select pg_temp.mutate('event-schedule',2,'series','edit','{}','RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,FR;COUNT=3',array['2099-04-01'::date,'2099-04-03','2099-04-15'])$$,'event weekday and weekly interval change with explicit extension');
select is((select count(*) from events where recurrence_series_id=(select recurrence_series_id from events where id=pg_temp.id('event-schedule',2))),3::bigint,'event expansion creates just the missing occurrence');
reset role;
select pg_temp.fixture('task-schedule','task',5);
insert into task_assignments(task_id,officer_id,assigned_by) values(pg_temp.id('task-schedule',2),-683,-681);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('task-schedule',2,'following','edit','{}','RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3',array['2099-03-07'::date,'2099-03-09','2099-03-11'])$$,'task future interval change splits series and shortens COUNT');
select is((select due_date::text from tasks where id=pg_temp.id('task-schedule',1)),'2099-03-06','task earlier date untouched');
select is((select recurrence_series_id from tasks where id=pg_temp.id('task-schedule',1)),(select series_id from pg_temp.fixtures where label='task-schedule'),'task earlier row keeps original series');
select isnt((select recurrence_series_id from tasks where id=pg_temp.id('task-schedule',2)),(select series_id from pg_temp.fixtures where label='task-schedule'),'task boundary row keeps ID and moves to future series');
select is((select due_date::text from tasks where id=pg_temp.id('task-schedule',3)),'2099-03-09','task existing third row receives new schedule');
select ok((select removed_at is not null from tasks where id=pg_temp.id('task-schedule',5)),'task shortened tail logically removed');
select is((select recurrence_rule from task_series where id=(select series_id from pg_temp.fixtures where label='task-schedule')),'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20990306','task historical segment accurately truncated to one');
select is((select officer_id from task_assignments where task_id=pg_temp.id('task-schedule',2)),-683::bigint,'Task assignee preserved through future schedule edit');
select lives_ok($$select pg_temp.mutate('task-schedule',2,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20990402',array['2099-04-01'::date,'2099-04-02'])$$,'task whole-series date change and UNTIL shortening');
select is((select due_date::text from tasks where id=pg_temp.id('task-schedule',2)),'2099-04-01','task all schedule update preserves selected ID');
select lives_ok($$select pg_temp.mutate('task-schedule',2,'series','edit','{}','RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,FR;COUNT=3',array['2099-04-01'::date,'2099-04-03','2099-04-15'])$$,'task weekday and weekly interval change with explicit extension');
select is((select count(*) from tasks where recurrence_series_id=(select recurrence_series_id from tasks where id=pg_temp.id('task-schedule',2))),3::bigint,'task expansion creates just the missing occurrence');
reset role;
select pg_temp.fixture('event-history','event',3,'2020-09-20');
insert into event_officers values(pg_temp.id('event-history',1),-683);
select private.process_finished_events();
create temporary table preserved_event_points as select * from point_transactions where event_id=pg_temp.id('event-history',1);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-history',1,'series','edit','{"name":"Historical title"}')$$,'processed Event series metadata editable');
select throws_ok($$select pg_temp.mutate('event-history',1,'series','cancel')$$,'P0001','This event cannot be cancelled','processed Event cannot be bulk cancelled');
select lives_ok($$select pg_temp.mutate('event-history',1,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2020-10-01'::date,'2020-10-02','2020-10-03'])$$,'processed Event schedule edit preserves awards and processing snapshots');
select lives_ok($$select pg_temp.mutate('event-history',1,'series','remove')$$,'processed Event logical removal follows existing domain behavior');
reset role;
select is((select jsonb_agg(to_jsonb(p) order by id) from point_transactions p where event_id=pg_temp.id('event-history',1)),
 (select jsonb_agg(to_jsonb(p) order by id) from preserved_event_points p),'processed participation transactions unchanged');
select is((select count(*) from event_officers where event_id=pg_temp.id('event-history',1)),1::bigint,'removed historical Event signup retained');
select pg_temp.fixture('event-cancel','event');
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-cancel',2,'occurrence','cancel')$$,'cancel this occurrence');
select is((select status from events where id=pg_temp.id('event-cancel',1)),'upcoming','single cancel leaves earlier sibling');
select lives_ok($$select pg_temp.mutate('event-cancel',2,'following','cancel')$$,'cancel following includes already cancelled occurrence idempotently');
select is((select status from events where id=pg_temp.id('event-cancel',3)),'cancelled','following cancel reaches last sibling');
select lives_ok($$select pg_temp.mutate('event-cancel',1,'series','cancel')$$,'cancel entire series');
reset role;
select pg_temp.fixture('task-history','task');
set local role authenticated;
select assign_task(pg_temp.id('task-history',3),-683);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000683',true);
select complete_task(pg_temp.id('task-history',3));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000681',true);
select approve_task(pg_temp.id('task-history',3));
reset role;
create temporary table preserved_task_state as select to_jsonb(a) as assignment,
 (select to_jsonb(p) from point_transactions p where task_id=a.task_id) as points from task_assignments a where task_id=pg_temp.id('task-history',3);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('task-history',2,'occurrence','edit','{"title":"Task exception","due_date":"2099-03-20"}')$$,'recurring Task individual field edit');
select is((select title from tasks where id=pg_temp.id('task-history',1)),'task-history','individual Task edit leaves sibling title');
select lives_ok($$select pg_temp.mutate('task-history',2,'following','edit','{"description":"Future details"}')$$,'following Task field edit');
select is((select description from tasks where id=pg_temp.id('task-history',1)),'Details','earlier Task details unchanged');
select lives_ok($$select pg_temp.mutate('task-history',1,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-04-01'::date,'2099-04-02','2099-04-03'])$$,'awarded Task due-date change preserves completion approval and points');
select lives_ok($$select pg_temp.mutate('task-history',1,'series','edit','{"title":"Series title"}')$$,'whole-series Task field edit preserves workflow');
select throws_ok($$select pg_temp.mutate('task-history',1,'series','edit','{"points":8}')$$,'P0001','Completed or awarded Task point settings cannot be edited','awarded Task point settings protect entire edit atomically');
select is((select points from tasks where id=pg_temp.id('task-history',1)),3::numeric,'rejected point edit leaves earlier Task unchanged');
reset role;
create temporary table atomic_before as select
 (select jsonb_agg(to_jsonb(t) order by id) from tasks t where id in (select unnest(ids) from pg_temp.fixtures where label='task-history')) as rows,
 (select to_jsonb(s) from task_series s where id=(select recurrence_series_id from tasks where id=pg_temp.id('task-history',1))) as series,
 (select count(*) from audit_logs) as audits,
 (select count(*) from private.recurrence_mutations) as receipts;
set local role authenticated;
select throws_ok($$select pg_temp.mutate('task-history',1,'series','remove')$$,'P0001','Completed or awarded Tasks cannot be removed','protected Task at end rejects entire removal');
select throws_ok($$select pg_temp.mutate('task-history',1,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-03-06'::date,'2099-03-07'])$$,'P0001','Completed or awarded Tasks cannot be removed','protected Task at end rejects schedule shortening and split');
reset role;
select is((select jsonb_agg(to_jsonb(t) order by id) from tasks t where id in (select unnest(ids) from pg_temp.fixtures where label='task-history')),(select rows from atomic_before),'failed protected operations leave every occurrence unchanged');
select is((select to_jsonb(s) from task_series s where id=(select recurrence_series_id from tasks where id=pg_temp.id('task-history',1))),(select series from atomic_before),'failed protected operations leave canonical metadata unchanged');
select is((select count(*) from audit_logs),(select audits from atomic_before),'failed operations leave no partial audits');
select is((select count(*) from private.recurrence_mutations),(select receipts from atomic_before),'failed operations leave no success receipt');
select is((select to_jsonb(a) from task_assignments a where task_id=pg_temp.id('task-history',3)),(select assignment from preserved_task_state),'Task assignee completion and approval preserved');
select is((select to_jsonb(p) from point_transactions p where task_id=pg_temp.id('task-history',3)),(select points from preserved_task_state),'Task awarded points preserved');
select pg_temp.fixture('task-remove','task');
set local role authenticated;
select lives_ok($$select pg_temp.mutate('task-remove',2,'occurrence','remove')$$,'remove this Task occurrence');
select lives_ok($$select pg_temp.mutate('task-remove',1,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-04-01'::date,'2099-04-02','2099-04-03'])$$,'schedule edit keeps removed slot as exception');
select ok((select removed_at is not null from tasks where id=pg_temp.id('task-remove',2)),'removed Task is not silently restored');
select lives_ok($$select pg_temp.mutate('task-remove',1,'series','remove')$$,'whole Task series removal');
select ok((select retired from task_series where id=(select recurrence_series_id from tasks where id=pg_temp.id('task-remove',1))),'entire removed Task series retired');
reset role;
select pg_temp.fixture('event-auth','event');
insert into event_branches select unnest((select ids from pg_temp.fixtures where label='event-auth')),id from branches where name in ('intro','icpc');
select pg_temp.fixture('global-auth','event');
select pg_temp.fixture('task-auth','task');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000682',true);
set local role authenticated;
select lives_ok($$select pg_temp.mutate('event-auth',1,'series','edit','{"location":"Lead room"}')$$,'Lead overlap authorizes multi-branch Event series');
select throws_ok($$select pg_temp.mutate('global-auth',1,'series','remove')$$,'P0001','Event outside branch scope','Lead cannot manage global Event series');
select lives_ok($$select pg_temp.mutate('task-auth',1,'series','edit','{"description":"Lead details"}')$$,'Lead manages Task own branch');
select throws_ok($$select pg_temp.mutate('task-auth',1,'series','edit',jsonb_build_object('branch_id',(select id from branches where name='icpc')))$$,'P0001','Task outside branch scope','Task destination branch authorization unchanged');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000683',true);
select throws_ok($$select pg_temp.mutate('event-auth',1,'series','remove')$$,'P0001','Event outside branch scope','ordinary Officer cannot remove Event series');
select throws_ok($$select pg_temp.mutate('task-auth',1,'series','edit','{"title":"Forbidden"}')$$,'P0001','Task outside branch scope','ordinary Officer cannot edit recurring Tasks');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000684',true);
select lives_ok($$select pg_temp.mutate('global-auth',1,'series','edit','{"name":"Executive global"}')$$,'Event executive manages global series');
select lives_ok($$select pg_temp.mutate('task-auth',1,'series','edit','{"title":"Executive Task"}')$$,'Event executive manages Task series');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000681',true);
select throws_ok($$select pg_temp.mutate('task-auth',1,'invalid','remove')$$,'P0001','Invalid recurrence scope or operation','trusted scope enum enforced');
select throws_ok($$select pg_temp.mutate('event-auth',1,'series','edit','{"status":"upcoming"}')$$,'P0001','Invalid recurrence edit fields','workflow fields cannot enter edit patch');
select throws_ok($$select pg_temp.mutate('task-auth',1,'series','edit','{"due_date":"2099-05-01"}')$$,'P0001','Invalid recurrence edit fields','bulk date patch requires validated canonical schedule');
select throws_ok($$select public.mutate_recurring_task(pg_temp.id('task-auth',1),'series','remove',gen_random_uuid(),(select series_id from pg_temp.fixtures where label='task-remove'),0)$$,'P0001','Series changed; reload and try again','forged retired series identity rejected');
reset role;
select throws_ok($$set local role anon; select public.mutate_recurring_task(1,'series','remove',gen_random_uuid(),1,0)$$,'42501',null,'anonymous users cannot execute mutation RPC');
select ok(exists(select 1 from audit_logs where action='event.series_edit' and details ?& array['scope','boundary','before','after','affected_occurrence_ids','operation','request_key','selected_occurrence_id'] and actor_id='00000000-0000-4000-8000-000000000681'),'series audit records actor boundary scope definitions affected rows and operation');
select is((select count(*) from (select recurrence_series_id,recurrence_key from events where recurrence_series_id is not null group by 1,2 having count(*)>1) duplicate_keys),0::bigint,'no duplicate Event recurrence identity');
select is((select count(*) from (select recurrence_series_id,recurrence_key from tasks where recurrence_series_id is not null group by 1,2 having count(*)>1) duplicate_keys),0::bigint,'no duplicate Task recurrence identity');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000681',true);
select pg_temp.fixture('event-atomic-cancel','event');
update events set event_date='2020-09-20',starts_at='2020-09-20 10:00-06',ends_at='2020-09-20 11:00-06'
 where id=pg_temp.id('event-atomic-cancel',3);
set local role authenticated;
select throws_ok($$select pg_temp.mutate('event-atomic-cancel',1,'series','cancel')$$,'P0001','This event cannot be cancelled','protected Event at end rolls back earlier cancellations');
select is((select count(*) from events where id in (select unnest(ids) from pg_temp.fixtures where label='event-atomic-cancel') and status='cancelled'),0::bigint,'failed bulk cancel leaves all lifecycle states unchanged');
reset role;
select pg_temp.fixture('task-completed-only','task');
insert into task_assignments(task_id,officer_id,assigned_by,completed_at) values(pg_temp.id('task-completed-only',3),-683,-681,'2026-09-20 12:00Z');
set local role authenticated;
select throws_ok($$select pg_temp.mutate('task-completed-only',2,'following','remove')$$,'P0001','Completed or awarded Tasks cannot be removed','completed but unapproved Task blocks following removal');
select ok((select removed_at is null from tasks where id=pg_temp.id('task-completed-only',2)),'failed following remove leaves boundary active');
select throws_ok($$select mutate_recurring_task(pg_temp.id('task-auth',1),'series','remove',gen_random_uuid(),(select series_id from pg_temp.fixtures where label='task-completed-only'),0)$$,'P0001','Occurrence does not belong to this series','trusted boundary verifies occurrence belongs to claimed series');
select set_config('test.standalone_scope_task_id',save_task('Standalone scope','Details','Post',(select id from branches where name='intro'),'2099-09-21',3,false)::text,true);
select throws_ok($$select mutate_recurring_task(current_setting('test.standalone_scope_task_id')::bigint,'occurrence','edit',gen_random_uuid(),(select series_id from pg_temp.fixtures where label='task-auth'),(select revision from task_series where id=(select series_id from pg_temp.fixtures where label='task-auth')),'{"title":"Forbidden standalone edit"}')$$,'P0001','Occurrence does not belong to this series','new edit RPC never enables standalone Task editing');
reset role;
select pg_temp.fixture('event-retry-schedule','event');
select set_config('test.retry_series',(select series_id::text from pg_temp.fixtures where label='event-retry-schedule'),true);
set local role authenticated;
select lives_ok($$select mutate_recurring_event(pg_temp.id('event-retry-schedule',2),'following','edit','00000000-0000-4000-8000-000000000688',current_setting('test.retry_series')::bigint,0,'{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-04-01'::date,'2099-04-02'])$$,'schedule split request succeeds');
select lives_ok($$select mutate_recurring_event(pg_temp.id('event-retry-schedule',2),'following','edit','00000000-0000-4000-8000-000000000688',current_setting('test.retry_series')::bigint,0,'{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-04-01'::date,'2099-04-02'])$$,'schedule split retry returns before stale revision and identity checks');
select throws_ok($$select mutate_recurring_event(pg_temp.id('event-retry-schedule',2),'following','edit','00000000-0000-4000-8000-000000000688',current_setting('test.retry_series')::bigint,0,'{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-05-01'::date,'2099-05-02'])$$,'P0001','Idempotency key already used','retry with different schedule input rejected');
select throws_ok($$select pg_temp.mutate('event-retry-schedule',2,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',array['2099-04-01'::date,'2099-04-03'])$$,'P0001','Occurrence dates do not match recurrence definition','trusted edit rejects malformed expanded schedule');
reset role;
select pg_temp.fixture('task-no-recreate','task');
set local role authenticated;
select pg_temp.mutate('task-no-recreate',3,'following','remove');
select throws_ok($$select pg_temp.mutate('task-no-recreate',1,'series','edit','{}','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-03-06'::date,'2099-03-07','2099-03-08'])$$,'P0001','Schedule would recreate a removed occurrence','explicit expansion cannot silently restore intentionally removed tail');
reset role;
select is((select count(*) from tasks where recurrence_series_id=(select series_id from pg_temp.fixtures where label='task-no-recreate') and removed_at is null),2::bigint,'rejected recreation leaves original two active rows');
select is((select recurrence_rule from task_series where id=(select series_id from pg_temp.fixtures where label='task-no-recreate')),'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20990307','rejected recreation leaves canonical end unchanged');
select lives_ok($$
 do $check$ declare s public.event_series; begin
  for s in select * from public.event_series where not retired loop
   perform private.assert_recurrence_dates(s.recurrence_rule,array(select recurrence_key from public.events
    where recurrence_series_id=s.id and recurrence_key between s.starts_on and s.ends_on order by recurrence_key));
  end loop;
 end $check$;
$$,'every active Event canonical definition exactly matches its materialized occurrence slots');
select lives_ok($$
 do $check$ declare s public.task_series; begin
  for s in select * from public.task_series where not retired loop
   perform private.assert_recurrence_dates(s.recurrence_rule,array(select recurrence_key from public.tasks
    where recurrence_series_id=s.id and recurrence_key between s.starts_on and s.ends_on order by recurrence_key));
  end loop;
 end $check$;
$$,'every active Task canonical definition exactly matches its materialized occurrence slots');

select pg_temp.fixture('mixed-event-auth','event');
insert into event_branches select unnest((select ids[1:2] from pg_temp.fixtures where label='mixed-event-auth')),id from branches where name='intro';
select pg_temp.fixture('mixed-task-auth','task');
update tasks set branch_id=(select id from branches where name='icpc') where id=pg_temp.id('mixed-task-auth',3);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000682',true);
set local role authenticated;
select throws_ok($$select pg_temp.mutate('mixed-event-auth',1,'series','edit','{"name":"Forbidden partial"}')$$,'P0001','Event outside branch scope','Lead must be authorized for every affected Event including global siblings');
select is((select name from events where id=pg_temp.id('mixed-event-auth',1)),'mixed-event-auth','unauthorized Event sibling rolls back earlier edit');
select throws_ok($$select pg_temp.mutate('mixed-task-auth',1,'series','remove')$$,'P0001','Task outside branch scope','Lead must be authorized for every affected Task branch');
select ok((select removed_at is null from tasks where id=pg_temp.id('mixed-task-auth',1)),'unauthorized Task sibling rolls back earlier removal');
reset role;
select ok(not has_function_privilege('authenticated','private.save_event_fields(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text)','EXECUTE'),'internal cancelled-sibling field saver is unavailable to direct clients');
select * from finish();
rollback;
