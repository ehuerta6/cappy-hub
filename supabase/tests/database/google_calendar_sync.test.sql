begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000009991','calendar-sync-admin@example.org');

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
values(-9991,'Synthetic Calendar Event','Internal notes','Private access details',
  (select id from event_types where name='Meeting'),'2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','upcoming');

select is((select sync_state from private.event_google_calendar_sync where event_id=-9991),
  'pending','a new eligible Event enters the durable sync queue');
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  1::bigint,'a new occurrence starts at generation one');

update events set name='Edited synthetic event' where id=-9991;
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  2::bigint,'material edits advance the desired generation');
select is((select sync_state from private.event_google_calendar_sync where event_id=-9991),
  'pending','material edits mark sync pending');

update events set status='cancelled' where id=-9991;
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  3::bigint,'cancellation advances the desired generation');

update private.event_google_calendar_sync
set sync_state='synced',remote_visible=true,calendar_id='synthetic-test',
  google_event_id='ch0123456789abcdefghjkmnpqrs'
where event_id=-9991;

update events set deleted_at=clock_timestamp(),
  deleted_by='00000000-0000-4000-8000-000000009991' where id=-9991;
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  4::bigint,'archiving advances the desired generation');
select is((select sync_state from private.event_google_calendar_sync where event_id=-9991),
  'pending','archive cleanup stays durable');
select ok((select remote_visible from private.event_google_calendar_sync where event_id=-9991),
  'archive work retains knowledge of the prior remote resource');

update private.event_google_calendar_sync
set sync_state='pending',generation=6,completed_generation=5,
  next_attempt_at=clock_timestamp(),lease_token=null,lease_until=null
where event_id=-9991;
update private.event_google_calendar_sync
set next_attempt_at=clock_timestamp()+interval '1 day'
where event_id<>-9991 and sync_state='pending';
select is((select was_remote_visible from private.claim_event_google_calendar_sync_batch(
  1,'synthetic-test') where event_id=-9991),true,
  'the worker claim retains prior remote visibility while pending');
update events set name='Concurrent canonical edit' where id=-9991;
select is(private.complete_event_google_calendar_sync(
  -9991,'synthetic-test',6,
  (select lease_token from private.event_google_calendar_sync where event_id=-9991),
  'synced','ch0123456789abcdefghjkmnpqrs','"stale"',null),false,
  'an out-of-order completion cannot acknowledge a newer generation');
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  8::bigint,'stale success requests reconciliation after the newest generation');
select is((select sync_state from private.event_google_calendar_sync where event_id=-9991),
  'pending','stale completion leaves newer canonical work pending');

update events set deleted_at=null,deleted_by=null where id=-9991;
select is((select generation from private.event_google_calendar_sync where event_id=-9991),
  9::bigint,'unarchiving advances the same occurrence generation');
select is((select count(*) from private.event_google_calendar_sync where event_id=-9991),
  1::bigint,'lifecycle changes retain one stable occurrence mapping');

select ok(not has_table_privilege('anon','private.event_google_calendar_sync','select'),
  'anonymous clients cannot read synchronization state');
select ok(not has_table_privilege('authenticated','private.event_google_calendar_sync','select'),
  'officers cannot read synchronization state');
select ok(not has_function_privilege('anon','public.claim_event_google_calendar_sync_batch(integer,text)','execute'),
  'anonymous clients cannot claim sync work');
select ok(not has_function_privilege('authenticated','public.claim_event_google_calendar_sync_batch(integer,text)','execute'),
  'officers cannot claim sync work');

select * from finish();
rollback;
