begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  not has_function_privilege('anon','public.claim_google_calendar_event_sync(integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_google_calendar_event_sync(integer)','EXECUTE')
  and has_function_privilege('service_role','public.claim_google_calendar_event_sync(integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.finish_google_calendar_event_sync(bigint,bigint,text)','EXECUTE'),
  'only the server service role can claim and finish mirror work');

insert into auth.users(id,email)
values('00000000-0000-4000-8000-000000002929','calendar-sync-admin@example.test');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
values(-29291,'Calendar sync fixture','Safe club description','Campus',
  (select id from event_types where name='Meeting'),'2099-10-01',
  '2099-10-01 10:00-06','2099-10-01 11:00-06','upcoming');
select is((select count(*) from private.google_calendar_event_sync where event_id=-29291),
  1::bigint,'creating an Event enqueues one mirror operation');

insert into officers(id,name,utep_email,position_id,status)
values(-29291,'Calendar sync Officer','calendar-sync@example.test',
  (select id from positions where name='Officer'),'active');
insert into event_officers(event_id,officer_id) values(-29291,-29291);
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  1::bigint,'signup and roster changes do not enqueue calendar work');

update events set description='Updated safe description' where id=-29291;
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  2::bigint,'an Event edit coalesces into the same pending operation');
select is((select count(*) from private.google_calendar_event_sync where event_id=-29291),
  1::bigint,'repeated edits cannot create duplicate work rows');

select is((select revision from public.claim_google_calendar_event_sync(10)
  where event_id=-29291),2::bigint,'the worker claims the latest Event revision');
update events set location='Updated campus' where id=-29291;
select is(public.finish_google_calendar_event_sync(-29291,2,null),false,
  'an older worker cannot acknowledge a newer canonical revision');
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  3::bigint,'a superseded operation leaves the newest work pending');
select is((select lease_until from private.google_calendar_event_sync where event_id=-29291),
  null::timestamptz,'a superseded operation releases its lease for immediate retry');

select is((select revision from public.claim_google_calendar_event_sync(10)
  where event_id=-29291),3::bigint,'the newest revision can be claimed after supersession');
select is(public.finish_google_calendar_event_sync(-29291,3,'Google Calendar returned HTTP 503'),false,
  'a temporary Google failure remains pending');
select is((select attempts from private.google_calendar_event_sync where event_id=-29291),
  1,'a failed attempt is counted');
select ok((select available_at>pg_catalog.now() and last_error='Google Calendar returned HTTP 503'
  from private.google_calendar_event_sync where event_id=-29291),
  'a failed attempt records a diagnostic and schedules backoff');

update events set status='cancelled' where id=-29291;
select is((select attempts from private.google_calendar_event_sync where event_id=-29291),
  0,'a newer canonical state retries immediately');
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  4::bigint,'cancellation queues the current occurrence');
update events set deleted_at=pg_catalog.now(),
  deleted_by='00000000-0000-4000-8000-000000002929' where id=-29291;
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  5::bigint,'archiving queues removal of the same occurrence');
update events set deleted_at=null,deleted_by=null where id=-29291;
select is((select revision from private.google_calendar_event_sync where event_id=-29291),
  6::bigint,'archive restoration queues republication');

select is((select revision from public.claim_google_calendar_event_sync(10)
  where event_id=-29291),6::bigint,'the restored Event is claimed for publication');
update events set location='Latest canonical location' where id=-29291;
select is(public.finish_google_calendar_event_sync(-29291,6,null),false,
  'an older worker cannot acknowledge an edit made while it was syncing');
select is((select revision from public.claim_google_calendar_event_sync(10)
  where event_id=-29291),7::bigint,'the changed Event is immediately claimable');
select is(public.finish_google_calendar_event_sync(-29291,7,null),true,
  'the latest canonical revision can be synchronized');
select is((select synced_revision from private.google_calendar_event_sync where event_id=-29291),
  7::bigint,'the completed revision is retained as a generation marker');
select is(public.finish_google_calendar_event_sync(-29291,6,null),false,
  'a late older worker cannot erase a newer successful synchronization');
select ok((select needs_sync from private.google_calendar_event_sync where event_id=-29291),
  'a late older worker schedules a corrective synchronization');
select is((select revision from public.claim_google_calendar_event_sync(10)
  where event_id=-29291),7::bigint,'the corrective synchronization uses the latest revision');
select is(public.finish_google_calendar_event_sync(-29291,7,null),true,
  'the corrective synchronization completes');
select is((select count(*) from private.google_calendar_event_sync where event_id=-29291),
  1::bigint,'the stable generation marker remains for future stale-worker detection');
select ok((select not needs_sync and synced_revision=revision
  from private.google_calendar_event_sync where event_id=-29291),
  'the marker records that the latest revision is synchronized');
select * from finish();
rollback;
