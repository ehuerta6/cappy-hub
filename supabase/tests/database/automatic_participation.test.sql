begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('anon','private.process_finished_events()','EXECUTE')
  and not has_function_privilege('authenticated','private.process_finished_events()','EXECUTE')
  and has_function_privilege('postgres','private.process_finished_events()','EXECUTE'),
  'only the trusted database role can execute the private processor');
select is((select count(*) from cron.job where jobname='cappy-process-finished-events'),
  1::bigint,'one Cron job is registered');
select lives_ok($$select cron.schedule('cappy-process-finished-events','* * * * *',
  'select private.process_finished_events()')$$,
  'rescheduling the stable name succeeds');

insert into officers(id,name,utep_email,position_id,status) values
  (-801,'PR8 Officer A','pr8-a@example.org',(select id from positions where name='Officer'),'active'),
  (-802,'PR8 Officer B','pr8-b@example.org',(select id from positions where name='Officer'),'inactive');
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000807','pr8-admin@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
  values(-807,'PR8 Admin','pr8-admin@example.org',
    (select id from positions where name='Officer'),'active','admin',
    '00000000-0000-4000-8000-000000000807');
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status) values
  (-801,'Ended 90 minutes','Test event','TBA',(select id from event_types where name='Meeting'),
    '2020-09-20 09:00-06','2020-09-20 10:30-06','upcoming'),
  (-802,'Ended no signups','Test event','TBA',(select id from event_types where name='Meeting'),
    '2020-09-21 09:00-06','2020-09-21 10:00-06','upcoming'),
  (-803,'Cancelled','Test event','TBA',(select id from event_types where name='Meeting'),
    '2020-09-22 09:00-06','2020-09-22 10:00-06','cancelled'),
  (-804,'Future','Test event','TBA',(select id from event_types where name='Meeting'),
    '2099-09-20 09:00-06','2099-09-20 10:00-06','upcoming'),
  (-805,'Completed early','Test event','TBA',(select id from event_types where name='Meeting'),
    '2099-09-21 09:00-06','2099-09-21 11:00-06','past'),
  (-806,'Removed award history','Test event','TBA',(select id from event_types where name='Meeting'),
    '2020-09-23 09:00-06','2020-09-23 10:00-06','upcoming');
insert into event_officers(event_id,officer_id) values
  (-801,-801),(-801,-802),(-803,-801),(-804,-801),(-805,-801),(-806,-801);
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,removed_at,removed_by)
  values(-806,-801,-806,1,'Previously removed','participation',now(),
    '00000000-0000-4000-8000-000000000807');
update application_config set participation_points_per_hour=1.25 where id=1;

set local role anon;
reset role;
set local role authenticated;
select throws_ok($$select private.process_finished_events()$$,'42501',null,
  'authenticated client, including admins and Leads, cannot invoke processor');
reset role;

select is(private.process_finished_events(),3,
  'only scheduled-ended noncancelled events process together');
select is((select participation_points_per_hour_at_end from events where id=-801),
  1.25::numeric,'ended event snapshots configured fractional rate');
select is((select participation_points_per_hour_at_end from events where id=-803),
  null::numeric,'cancelled event is not snapshotted');
select is((select participation_points_per_hour_at_end from events where id=-804),
  null::numeric,'future event is not processed');
select is((select count(*) from point_transactions where event_id=-801
  and award_type='participation'),2::bigint,
  'one award is made for each of two signups, including an inactive officer');
select is((select points from point_transactions where event_id=-801 and officer_id=-801),
  1.875::numeric,'90 scheduled minutes times fractional rate preserves precision');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from point_transactions where event_id=-806),
  1::bigint,'logically removed award remains unique and is not regenerated');
select is((select participation_points_per_hour_at_end from events where id=-805),
  null::numeric,'future manually-past event does not snapshot rate');
select is((select actor_id from audit_logs where action='points.participation_created'
  and details->>'event_id'='-801' limit 1),null::uuid,
  'generated award audit uses System actor');
select ok((select bool_and(details ?& array['transaction_id','event_id','officer_id',
  'scheduled_hours','rate','points']) from audit_logs
  where action='points.participation_created' and details->>'event_id'='-801'),
  'award audit retains transaction, event, officer, duration, rate and amount');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
set local role authenticated;
select is(remove_participation_award((select id from point_transactions
  where event_id=-801 and officer_id=-801)),true,
  'admin logically removes one generated award');
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
select set_config('request.jwt.claim.sub','',true);

select is(private.process_finished_events(),0,'repeated processor run is a no-op');
select is((select count(*) from point_transactions where event_id=-801
  and officer_id=-801 and removed_at is not null),1::bigint,
  'removed generated award stays removed after processor rerun');
update application_config set participation_points_per_hour=2 where id=1;
select is(private.process_finished_events(),0,'rate change alone does not reprocess events');
update events set status='past' where id=-804;
select is(private.process_finished_events(),0,
  'manual past status cannot process future event');
select is((select points from point_transactions where event_id=-804),
  null::numeric,'future event has no award');
select ok((select count(*) from point_transactions where award_type='participation'
  and event_id=-801)=2,'unique participation rows remain stable');

-- An audit failure must roll back the event snapshot and award together.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
  (-807,'Atomicity probe','Test event','TBA',(select id from event_types where name='Meeting'),
    '2020-09-24 09:00-06','2020-09-24 10:00-06');
insert into event_officers(event_id,officer_id) values(-807,-801);
alter table audit_logs add constraint reject_new_participation_audit
  check (action <> 'points.participation_created') not valid;
select throws_ok($$select private.process_finished_events()$$,'23514',null,
  'audit failure surfaces to the scheduled caller');
select is((select participation_points_per_hour_at_end from events where id=-807),
  null::numeric,'failed audit rolls back event snapshot');
select is((select count(*) from point_transactions where event_id=-807),
  0::bigint,'failed audit rolls back generated award');
alter table audit_logs drop constraint reject_new_participation_audit;
select is(private.process_finished_events(),1,
  'next invocation can retry a previously failed event');
select is((select count(*) from point_transactions where event_id=-807),
  1::bigint,'successful retry creates one award');

-- The active primary-award invariant spans the automatic and manual paths,
-- while corrections and logical removal remain separate behaviors.
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-801,-807,2,'Manual duplicate','manual')$$,'23505',null,
  'an active participation award blocks a second Event-linked manual award');
select lives_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-801,-807,1,'Correction','correction')$$,
  'corrections may coexist with an active primary Event award');
select lives_ok($$update point_transactions set points=3
  where event_id=-807 and officer_id=-801 and award_type='participation'$$,
  'primary award amount edits that retain the Officer/Event pair remain possible');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
set local role authenticated;
select is(remove_participation_award((select id from point_transactions
  where event_id=-807 and officer_id=-801 and award_type='participation')),true,
  'authorized logical removal releases the active primary pair');
reset role;
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-801,-807,2,'Replacement manual award','manual')$$,
  'logical removal releases the active primary pair for a manual award');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
  values(-801,-807,3,'Second manual duplicate','manual')$$,'23505',null,
  'a second active manual award for the same Officer/Event pair is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
set local role authenticated;
select is(remove_point_transaction((select id from point_transactions
  where event_id=-807 and officer_id=-801 and award_type='manual')),true,
  'authorized manual award removal remains available');
reset role;
select set_config('request.jwt.claim.sub','',true);
select ok((select indisunique from pg_index where indexrelid =
  'public.one_active_primary_event_award_per_officer'::regclass),
  'primary award uniqueness is enforced by a PostgreSQL unique index');

select * from finish();
rollback;
