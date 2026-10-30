begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000032801','reconcile-admin@example.test'),
 ('00000000-0000-4000-8000-000000032802','reconcile-officer@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-32801,'Reconciliation Admin','reconcile-admin@example.test',(select id from positions where code='officer'),'active','admin','00000000-0000-4000-8000-000000032801'),
 (-32802,'Reconciliation Officer','reconcile-officer@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000032802');
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-32801,'Corrected schedule','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-01-01 09:00-07','2020-01-01 11:00-07');
insert into event_officers(event_id,officer_id) values(-32801,-32802);
update application_config set participation_points_per_hour=9 where id=1;
select is(private.process_finished_events(),1,'new processing uses approved calculation');
select is((select points from point_transactions where event_id=-32801),2::numeric,'legacy config9 does not change new two-hour award');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032801',true);
set local role authenticated;
select add_manual_transaction(-32802,3,'Independent manual credit','manual',-32801);
reset role;
create temp table retained_manual as select to_jsonb(p) original from point_transactions p where award_type='manual';
create temp table retained_signups as select to_jsonb(eo) original from event_officers eo where event_id=-32801;
update events set ends_at='2020-01-01 12:30-07' where id=-32801;
select is((select points from point_transactions where event_id=-32801 and award_type='participation'),3.5::numeric,'duration correction earns fractional hours');
select is((select total_points from officer_point_totals where id=-32802),6.5::numeric,'signed independent credit adds to corrected participation');
create temp table before_description as select to_jsonb(p) original from point_transactions p where event_id=-32801;
update events set description='Description correction only' where id=-32801;
select results_eq($$select to_jsonb(p) from point_transactions p where event_id=-32801 order by id$$,
 $$select original from before_description order by (original->>'id')::bigint$$,'descriptive edit leaves every transaction unchanged');
update events set event_date='2099-01-01',starts_at='2099-01-01 09:00-07',ends_at='2099-01-01 12:30-07' where id=-32801;
select is((select total_points from officer_point_totals where id=-32802),3::numeric,'moving into future excludes premature automatic credit only');
select is(private.process_finished_events(),0,'future schedule cannot grant credit');
select results_eq($$select to_jsonb(eo) from event_officers eo where event_id=-32801$$,
 $$select original from retained_signups$$,'corrected future schedule preserves signup identity');
update events set event_date='2021-01-01',starts_at='2021-01-01 09:00-07',ends_at='2021-01-01 10:15-07' where id=-32801;
select is((select total_points from officer_point_totals where id=-32802),4.25::numeric,'mechanical suspension reconciles after corrected end');
select is((select count(*) from point_transactions where event_id=-32801 and award_type='participation'),1::bigint,'mechanical correction retains automatic identity without duplicate');
select is(private.process_finished_events(),0,'retry is a no-op');
select results_eq($$select to_jsonb(p) from point_transactions p where award_type='manual'$$,
 $$select original from retained_manual$$,'manual amount, ID, reason and audit actors stay unchanged');
select is((select count(*) from audit_logs where action='points.participation_suspended' and entity_id in
 (select id::text from point_transactions where event_id=-32801)),1::bigint,'suspension is audited once');
select ok(exists(select 1 from audit_logs where action='points.participation_reconciled' and details->>'rate'='1'),'reconciliation explains source-derived amount');
-- A future withdrawal makes the suspended award ineligible. Cron must
-- settle with no repeat processing/audit noise even though history survives.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at)
 values(-32803,'Withdrawn corrected Event','Synthetic','Campus',(select id from event_types where name='Meeting'),
 '2020-02-01 09:00-07','2020-02-01 10:00-07');
insert into event_officers(event_id,officer_id) values(-32803,-32802);
select private.process_finished_events();
update events set event_date='2099-02-01',starts_at='2099-02-01 09:00-07',ends_at='2099-02-01 10:00-07' where id=-32803;
delete from event_officers where event_id=-32803;
update events set event_date='2021-02-01',starts_at='2021-02-01 09:00-07',ends_at='2021-02-01 10:00-07' where id=-32803;
select is(private.process_finished_events(),0,'withdrawn signup leaves no pending eligible reconciliation');
select is(private.process_finished_events(),0,'repeat does not create processing noise for withdrawn signup');
select is((select count(*) from point_transactions where event_id=-32803 and removed_at is null),0::bigint,
 'withdrawal never resurrects suspended credit');
select is((select count(*) from audit_logs where action='event.participation_processed' and entity_id='-32803'),1::bigint,
 'withdrawn corrected Event retains only its original processing audit');

-- Fractional selected slots earn only their own durations, excluding gaps.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at)
 values(-32804,'Fractional slots','Synthetic','Campus',(select id from event_types where name='Meeting'),
 '2020-03-01 09:00-07','2020-03-01 12:00-07');
insert into event_officers(event_id,officer_id) values(-32804,-32802);
insert into event_time_slots(id,event_id,starts_at,ends_at) values
 (-328041,-32804,'2020-03-01 09:00-07','2020-03-01 09:30-07'),
 (-328042,-32804,'2020-03-01 10:00-07','2020-03-01 10:45-07');
insert into event_time_slot_officers(event_id,slot_id,officer_id) values(-32804,-328041,-32802),(-32804,-328042,-32802);
select is(private.process_finished_events(),1,'fractional slot Event processes');
select is((select sum(points) from point_transactions where event_id=-32804),1.25::numeric,
 '30 and45 minute slots earn1.25 Points excluding interior gap and unused schedule');
select is((select count(*) from point_transactions where event_id=-32804),2::bigint,'each selected slot retains automatic identity');

-- Required audits are atomic with schedule/amount reconciliation.
alter table audit_logs add constraint reconciliation_test_audit_failure
 check(action<>'points.participation_reconciled') not valid;
select throws_ok($$update events set ends_at='2021-01-01 11:00-07' where id=-32801$$,
 '23514',null,'failed reconciliation audit rejects the source correction');
select is((select ends_at from events where id=-32801),'2021-01-01 10:15-07'::timestamptz,'audit failure rolls back schedule');
select is((select points from point_transactions where event_id=-32801 and award_type='participation'),1.25::numeric,
 'audit failure rolls back changed participation amount');
alter table audit_logs drop constraint reconciliation_test_audit_failure;

-- A deliberate removal is not regenerated merely because its source changes.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at)
 values(-32805,'Deliberate suppression','Synthetic','Campus',(select id from event_types where name='Meeting'),
 '2020-04-01 09:00-06','2020-04-01 10:00-06');
insert into event_officers(event_id,officer_id) values(-32805,-32802);
select private.process_finished_events();
set local role authenticated;
select remove_participation_award(id) from point_transactions where event_id=-32805;
reset role;
create temp table deliberate_removal as select to_jsonb(p) original from point_transactions p where event_id=-32805;
update events set event_date='2099-04-01',starts_at='2099-04-01 09:00-06',ends_at='2099-04-01 10:00-06' where id=-32805;
update events set event_date='2021-04-01',starts_at='2021-04-01 09:00-06',ends_at='2021-04-01 11:00-06' where id=-32805;
select is(private.process_finished_events(),0,'unknown or deliberate removal does not generate replacement');
select results_eq($$select to_jsonb(p) from point_transactions p where event_id=-32805$$,
 $$select original from deliberate_removal$$,'deliberate removal remains byte-for-byte intact through schedule corrections');

-- An Admin can intentionally suppress an award while the corrected Event
-- is still future; mechanical suspension must not undo that later decision.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at)
 values(-32807,'Suppression during suspension','Synthetic','Campus',(select id from event_types where name='Meeting'),
 '2020-06-01 09:00-06','2020-06-01 10:00-06');
insert into event_officers(event_id,officer_id) values(-32807,-32802);
select private.process_finished_events();
update events set event_date='2099-06-01',starts_at='2099-06-01 09:00-06',ends_at='2099-06-01 10:00-06' where id=-32807;
set local role authenticated;
select is(remove_point_transaction((select id from point_transactions where event_id=-32807)),true,
 'explicit Admin removal replaces mechanical suspension with intentional suppression');
select is(remove_point_transaction((select id from point_transactions where event_id=-32807)),false,
 'intentional removal retry is a no-op');
reset role;
update events set event_date='2021-06-01',starts_at='2021-06-01 09:00-06',ends_at='2021-06-01 10:00-06' where id=-32807;
select is((select count(*) from point_transactions where event_id=-32807 and removed_at is null),0::bigint,
 'corrected end cannot undo an intentional removal made during suspension');
select is((select removed_by_officer_id from point_transactions where event_id=-32807),-32801::bigint,
 'explicit removal retains current stable Admin attribution');

-- An independent automatic edit remains preserved; required source changes
-- are explicitly blocked until the narrow product policy is resolved.
set local role authenticated;
select update_point_transaction(id,7) from point_transactions where event_id=-32801 and award_type='participation';
reset role;
select throws_ok($$update events set ends_at='2021-01-01 11:00-07' where id=-32801$$,'P0001',
 'Edited automatic Points need an explicit policy decision before schedule reconciliation','source correction cannot silently overwrite an independent automatic edit');
select is((select ends_at from events where id=-32801),'2021-01-01 10:15-07'::timestamptz,'blocked correction rolls back schedule');
select is((select points from point_transactions where event_id=-32801 and award_type='participation'),7::numeric,'edited amount stays intact');
select lives_ok($$update events set description='Historical description still editable' where id=-32801$$,'descriptive correction remains possible with edited award');
-- Missing legacy basis is unknown, not evidence of an unedited amount.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,participation_points_per_hour_at_end)
 values(-32806,'Unknown legacy basis','Synthetic','Campus',(select id from event_types where name='Meeting'),
 '2020-05-01 09:00-06','2020-05-01 10:00-06',2.5);
insert into event_officers(event_id,officer_id) values(-32806,-32802);
insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-32802,-32806,7,'Synthetic marker-free historic amount','participation');
delete from private.event_participation_basis where transaction_id in(select id from point_transactions where event_id=-32806);
select throws_ok($$update events set ends_at='2020-05-01 11:00-06' where id=-32806$$,'P0001',
 'Historical participation needs reviewed compatibility handling before schedule reconciliation',
 'unknown historical direct-edit provenance is not silently overwritten');
select is((select points from point_transactions where event_id=-32806),7::numeric,'unknown historic amount remains intact');

-- Confirmation authorization and validation operate at trusted RPC boundary.
set local role anon;
select throws_ok($$select confirm_premature_participation(0,'Verified')$$,'42501',null,'anonymous confirmation denied');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032802',true);
set local role authenticated;
select throws_ok($$select confirm_premature_participation(0,'Verified')$$,'P0001','Admin required','ordinary Officer confirmation denied');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032801',true);
set local role authenticated;
select throws_ok($$select confirm_premature_participation(0,E'\t\n')$$,'P0001','Reason required','confirmation needs explicit nonblank verification');
select throws_ok($$select confirm_premature_participation((select id from point_transactions where event_id=-32801 and award_type='manual'),'Verified')$$,
 'P0001','Only an independently removed participation award can be confirmed premature','confirmation cannot change independent manual credit');
reset role;
select * from finish();
rollback;
