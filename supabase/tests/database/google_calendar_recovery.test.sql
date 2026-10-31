begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000003341','calendar-admin@example.test'),
 ('00000000-0000-4000-8000-000000003342','calendar-lead@example.test'),
 ('00000000-0000-4000-8000-000000003343','calendar-officer@example.test'),
 ('00000000-0000-4000-8000-000000003344','calendar-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-3341,'Calendar Admin','calendar-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000003341'),
 (-3342,'Calendar Lead','calendar-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000003342'),
 (-3343,'Calendar Officer','calendar-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000003343'),
 (-3344,'Inactive Calendar Admin','calendar-inactive@example.test',(select id from positions where name='Officer'),'inactive','admin','00000000-0000-4000-8000-000000003344');
insert into officer_branches(officer_id,branch_id)
 select -3342,id from branches where name='intro';
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status) values
 (-3341,'Calendar retry','Canonical Event','Campus',(select id from event_types where name='Meeting'),
  '2099-10-31','2099-10-31 09:00-06','2099-10-31 10:00-06','upcoming'),
 (-3342,'Calendar other branch','Canonical Event','Campus',(select id from event_types where name='Meeting'),
  '2099-10-31','2099-10-31 09:00-06','2099-10-31 10:00-06','upcoming');
insert into event_branches(event_id,branch_id)
 select -3341,id from branches where name='intro'
 union all select -3342,id from branches where name='icpc';

create function pg_temp.calendar_event_state(target_id bigint) returns jsonb
language sql stable set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'id',id,'name',name,'description',description,'location',location,
    'starts_at',starts_at,'ends_at',ends_at,'status',status,'deleted_at',deleted_at
  ) from public.events where id=target_id
$$;
create temporary table calendar_event_state_snapshot(event_id bigint primary key,state jsonb not null);
grant select on calendar_event_state_snapshot to authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003342',true);
set local role authenticated;
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3341]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'a Lead can record a failed sync for an Event in their branch');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),1::bigint,
 'failed sync remains visible on the canonical Event');
reset role;
insert into calendar_event_state_snapshot
 values(-3341,pg_temp.calendar_event_state(-3341));
update events set name='Canonical Event changed while a sync was in flight' where id=-3341;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003342',true);
set local role authenticated;
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[]::bigint[],jsonb_build_object('-3341',(select state from calendar_event_state_snapshot where event_id=-3341)))$$,
 'a sync result for the prior Event version is safely ignored');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),1::bigint,
 'a stale success cannot clear a newer Calendar failure');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003342',true);
set local role authenticated;
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'a retry for the current Event state clears its failure');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),0::bigint,
 'current successful state removes the recovery marker');
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3341]::bigint[],jsonb_build_object('-3341',(select state from calendar_event_state_snapshot where event_id=-3341)))$$,
 'a failed attempt for a stale Event version is safely ignored');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),0::bigint,
 'a stale failure cannot recreate a cleared recovery marker');
reset role;
update events set name='Calendar retry' where id=-3341;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003342',true);
set local role authenticated;
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3341]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'a failure for the current Event version is recorded');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),1::bigint,
 'current failure remains visible before authorization check');
select throws_ok($$select record_google_calendar_sync_results(array[-3341,-3342]::bigint[],array[-3342]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341),'-3342',pg_temp.calendar_event_state(-3342)))$$,
 'P0001','Event outside branch scope','every Event in a batch must be authorized');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),1::bigint,
 'an unauthorized partial batch does not update even its in-scope Event');
select lives_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'a Lead can clear the failure after a successful retry');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),0::bigint,
 'successful retry removes the recovery marker');
select throws_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3342]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'P0001','Invalid Google Calendar sync results','failure IDs must belong to the attempted batch');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003343',true);
set local role authenticated;
select throws_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3341]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'P0001','Event outside branch scope','ordinary Officers cannot record recovery state');
select is((select count(*) from event_calendar_sync_failures where event_id=-3341),0::bigint,
 'ordinary Officers cannot read manager-scoped Calendar failure status');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003344',true);
set local role authenticated;
select throws_ok($$select record_google_calendar_sync_results(array[-3341]::bigint[],array[-3341]::bigint[],jsonb_build_object('-3341',pg_temp.calendar_event_state(-3341)))$$,
 'P0001','Unauthorized','inactive managers cannot record recovery state');
reset role;

select * from finish();
rollback;
