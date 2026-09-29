begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(to_regprocedure('public.process_completed_events(numeric)') is null,
  'caller-rate prototype processor is gone');
select ok(not has_function_privilege('anon','private.process_finished_events()','EXECUTE')
  and not has_function_privilege('authenticated','private.process_finished_events()','EXECUTE')
  and has_function_privilege('postgres','private.process_finished_events()','EXECUTE'),
  'only the trusted database role can execute the private processor');
select is((select count(*) from cron.job where jobname='cappy-process-finished-events'),
  1::bigint,'one Cron job is registered');
select is((select schedule from cron.job where jobname='cappy-process-finished-events'),
  '* * * * *','Cron schedules processing every minute');
select is((select command from cron.job where jobname='cappy-process-finished-events'),
  'select private.process_finished_events()','Cron calls the private function');
select lives_ok($$select cron.schedule('cappy-process-finished-events','* * * * *',
  'select private.process_finished_events()')$$,
  'rescheduling the stable name succeeds');
select is((select count(*) from cron.job where jobname='cappy-process-finished-events'),
  1::bigint,'rescheduling the same name does not duplicate the job');

insert into officers(id,name,utep_email,position_id,status) values
  (-801,'PR8 Officer A','pr8-a@example.org',(select id from positions where name='Officer'),'active'),
  (-802,'PR8 Officer B','pr8-b@example.org',(select id from positions where name='Officer'),'inactive');
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000807','pr8-admin@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
  values(-807,'PR8 Admin','pr8-admin@example.org',
    (select id from positions where name='Officer'),'active','admin',
    '00000000-0000-4000-8000-000000000807');
insert into events(id,name,event_type_id,starts_at,ends_at,status) values
  (-801,'Ended 90 minutes',(select id from event_types where name='General'),
    '2020-09-20 09:00-06','2020-09-20 10:30-06','upcoming'),
  (-802,'Ended no signups',(select id from event_types where name='General'),
    '2020-09-21 09:00-06','2020-09-21 10:00-06','upcoming'),
  (-803,'Cancelled',(select id from event_types where name='General'),
    '2020-09-22 09:00-06','2020-09-22 10:00-06','cancelled'),
  (-804,'Future',(select id from event_types where name='General'),
    '2099-09-20 09:00-06','2099-09-20 10:00-06','upcoming'),
  (-805,'Completed early',(select id from event_types where name='General'),
    '2099-09-21 09:00-06','2099-09-21 11:00-06','past'),
  (-806,'Removed award history',(select id from event_types where name='General'),
    '2020-09-23 09:00-06','2020-09-23 10:00-06','upcoming');
insert into event_officers(event_id,officer_id) values
  (-801,-801),(-801,-802),(-803,-801),(-804,-801),(-805,-801),(-806,-801);
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,removed_at)
  values(-806,-801,-806,1,'Previously removed','participation',now());
update application_config set participation_points_per_hour=1.25 where id=1;

set local role anon;
select throws_ok($$select private.process_finished_events()$$,'42501',null,
  'anonymous client cannot invoke private processor');
reset role;
set local role authenticated;
select throws_ok($$select private.process_finished_events()$$,'42501',null,
  'authenticated client, including admins and Leads, cannot invoke processor');
reset role;

select is(private.process_finished_events(),3,
  'only scheduled-ended noncancelled events process together');
select is((select participation_points_per_hour_at_end from events where id=-801),
  1.25::numeric,'ended event snapshots configured fractional rate');
select is((select participation_points_per_hour_at_end from events where id=-802),
  1.25::numeric,'zero-signup event is marked processed');
select is((select count(*) from point_transactions where event_id=-802),
  0::bigint,'zero-signup event creates no awards');
select is((select count(*) from audit_logs where action='event.participation_processed'
  and entity_id='-802'),1::bigint,'zero-signup processing has an audit record');
select is((select participation_points_per_hour_at_end from events where id=-803),
  null::numeric,'cancelled event is not snapshotted');
select is((select count(*) from point_transactions where event_id=-803),
  0::bigint,'cancelled event creates no award');
select is((select participation_points_per_hour_at_end from events where id=-804),
  null::numeric,'future event is not processed');
select is((select count(*) from audit_logs where action='event.participation_processed'
  and entity_id in ('-803','-804')),0::bigint,
  'cancelled and future events have no processing audit');
select is((select count(*) from point_transactions where event_id=-801
  and award_type='participation'),2::bigint,
  'one award is made for each of two signups, including an inactive officer');
select is((select points from point_transactions where event_id=-801 and officer_id=-801),
  1.875::numeric,'90 scheduled minutes times fractional rate preserves precision');
select is((select created_by from point_transactions where event_id=-801 and officer_id=-801),
  null::uuid,'automatic award has no human creator');
select is((select total_points from officer_point_totals where id=-802),
  1.875::numeric,'inactive officer with historical signup receives award in derived total');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
select is((select half_year_points from dashboard_summary),3.75::numeric,
  'new automatic transactions immediately appear in current half-year Dashboard total');
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from point_transactions where event_id=-806),
  1::bigint,'logically removed award remains unique and is not regenerated');
select is((select count(*) from audit_logs where action='points.participation_created'
  and details->>'event_id'='-806'),0::bigint,
  'no new award audit is written for removed award');
select is((select participation_points_per_hour_at_end from events where id=-805),
  null::numeric,'future manually-past event does not snapshot rate');
select is((select points from point_transactions where event_id=-805),
  null::numeric,'future manually-past event receives no award');
select is((select starts_at from events where id=-805),
  '2099-09-21 09:00-06'::timestamptz,'early completion preserves scheduled start');
select is((select ends_at from events where id=-805),
  '2099-09-21 11:00-06'::timestamptz,'early completion preserves scheduled end');
select is((select actor_id from audit_logs where action='points.participation_created'
  and details->>'event_id'='-801' limit 1),null::uuid,
  'generated award audit uses System actor');
select is((select count(*) from audit_logs where action='points.participation_created'
  and details->>'event_id'='-801'),2::bigint,'each generated award has one audit row');
select ok((select bool_and(details ?& array['transaction_id','event_id','officer_id',
  'scheduled_hours','rate','points']) from audit_logs
  where action='points.participation_created' and details->>'event_id'='-801'),
  'award audit retains transaction, event, officer, duration, rate and amount');
select is((select count(*) from audit_logs where action='event.participation_processed'
  and entity_id in ('-801','-802','-805','-806')),3::bigint,
  'each processed event has one concise processing audit');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
set local role authenticated;
select is(remove_participation_award((select id from point_transactions
  where event_id=-801 and officer_id=-801)),true,
  'admin logically removes one generated award');
reset role;
select set_config('request.jwt.claim.sub','',true);
select is((select total_points from officer_point_totals where id=-801),
  0::numeric,'logical removal lowers officer total');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000807',true);
select is((select half_year_points from dashboard_summary),1.875::numeric,
  'logical removal immediately lowers derived Dashboard total');
select set_config('request.jwt.claim.sub','',true);

select is(private.process_finished_events(),0,'repeated processor run is a no-op');
select is((select count(*) from point_transactions where event_id=-801),2::bigint,
  'repeat run does not duplicate awards');
select is((select count(*) from point_transactions where event_id=-801
  and officer_id=-801 and removed_at is not null),1::bigint,
  'removed generated award stays removed after processor rerun');
select is((select count(*) from audit_logs where action='points.participation_created'
  and details->>'event_id'='-801'),2::bigint,
  'repeat run does not duplicate award audit');
update application_config set participation_points_per_hour=2 where id=1;
select is(private.process_finished_events(),0,'rate change alone does not reprocess events');
select is((select participation_points_per_hour_at_end from events where id=-801),
  1.25::numeric,'rate change does not rewrite first event snapshot');
select is((select points from point_transactions where event_id=-801 and officer_id=-801),
  1.875::numeric,'rate change does not recalculate first award');
update events set status='past' where id=-804;
select is(private.process_finished_events(),0,
  'manual past status cannot process future event');
select is((select participation_points_per_hour_at_end from events where id=-804),
  null::numeric,'future event has no rate snapshot');
select is((select points from point_transactions where event_id=-804),
  null::numeric,'future event has no award');
select is((select count(*) from audit_logs where action='points.participation_created'
  and details->>'event_id'='-804'),0::bigint,'future event has no award audit');
select ok((select count(*) from point_transactions where award_type='participation'
  and event_id=-801)=2,'unique participation rows remain stable');

-- An audit failure must roll back the event snapshot and award together.
insert into events(id,name,event_type_id,starts_at,ends_at) values
  (-807,'Atomicity probe',(select id from event_types where name='General'),
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
select is((select count(*) from audit_logs where action='points.participation_created'
  and details->>'event_id'='-807'),1::bigint,
  'successful retry creates one matching audit entry');

select * from finish();
rollback;
