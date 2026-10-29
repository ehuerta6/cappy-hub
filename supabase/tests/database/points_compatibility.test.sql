-- Issue #326: synthetic historical fixtures and CURRENT behavior evidence.
-- The after-end missing credit below is a known gap for #328, not a policy.
-- No production IDs/data; all rows, snapshots and test constraints roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000032601','compat-admin@example.test'),
 ('00000000-0000-4000-8000-000000032602','compat-lead@example.test'),
 ('00000000-0000-4000-8000-000000032603','compat-officer@example.test'),
 ('00000000-0000-4000-8000-000000032604','compat-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-32601,'Compatibility Admin','compat-admin@example.test',(select id from positions where code='officer'),'active','admin','00000000-0000-4000-8000-000000032601'),
 (-32602,'Compatibility Lead','compat-lead@example.test',(select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000032602'),
 (-32603,'Compatibility Officer','compat-officer@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000032603'),
 (-32604,'Compatibility inactive Admin','compat-inactive@example.test',(select id from positions where code='officer'),'inactive','admin','00000000-0000-4000-8000-000000032604');
insert into officers(id,name,utep_email,position_id,status)
 select -32610-n,'Synthetic participant '||n,'compat-participant-'||n||'@example.test',
   (select id from positions where code='officer'),'active' from generate_series(1,5) n;
insert into officer_branches(officer_id,branch_id)
 select -32602,id from branches where name='intro';

-- Wrong original date, two-hour Event. The five signups are real fixture
-- relationships; processing and removals use the existing trusted entrypoints.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-32601,'Synthetic premature processing','Issue 326 regression','TBA',
   (select id from event_types where name='Meeting'),'2020-09-20 09:00-06','2020-09-20 11:00-06');
insert into event_branches(event_id,branch_id) select -32601,id from branches where name='icpc';
insert into event_officers(event_id,officer_id) select -32601,-32610-n from generate_series(1,5) n;
create temp table retained_signups as select to_jsonb(s) row from event_officers s where event_id=-32601;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select set_participation_rate(1);
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),1,'wrong past schedule processes the synthetic Event');
select is((select count(*) from point_transactions where event_id=-32601 and points=2),5::bigint,
 'five premature awards use the original two-hour schedule');
select is((select count(*) from audit_logs where action='points.participation_created'
 and details->>'event_id'='-32601' and actor_id is null),5::bigint,'System creation audit exists for all five awards');

-- No new privileges: Admin-only award removal and scoped Event correction.
set local role anon;
select throws_ok($$select remove_participation_award(0)$$,'42501',null,'anonymous removal remains unavailable');
reset role;
set local role authenticated;
select throws_ok($$select remove_participation_award(0)$$,'P0001','Admin required','unlinked caller cannot remove awards');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032604',true);
select throws_ok($$select remove_participation_award(0)$$,'P0001','Admin required','inactive Admin cannot remove awards');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032603',true);
select throws_ok($$select remove_participation_award(0)$$,'P0001','Admin required','ordinary Officer cannot remove awards');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032602',true);
select throws_ok($$select save_event_with_links('Synthetic premature processing','Issue 326 regression',
 (select id from event_types where name='Meeting'),'TBA','2099-09-20',
 '2099-09-20 09:00-06','2099-09-20 11:00-06',array[(select id from branches where name='icpc')],-32601)$$,
 'P0001','Event outside branch scope','out-of-scope Lead cannot correct the Event');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
select results_eq($$select remove_participation_award(id) from point_transactions where event_id=-32601 order by id$$,
 $$values (true),(true),(true),(true),(true)$$,'Admin removes the five premature awards');
select results_eq($$select remove_participation_award(id) from point_transactions where event_id=-32601 order by id$$,
 $$values (false),(false),(false),(false),(false)$$,'removal retry is a no-op');
reset role;
create temp table premature_history as select to_jsonb(p) row from point_transactions p where event_id=-32601;
create temp table premature_audit as select id,to_jsonb(a) row from audit_logs a
 where (entity_type='point_transaction' and entity_id in
   (select id::text from point_transactions where event_id=-32601)) or
   (entity_type='event' and entity_id='-32601');
select is((select count(*) from point_transactions where event_id=-32601
 and removed_by_officer_id=-32601 and removed_at is not null and not slot_selection_removed),5::bigint,
 'all premature removals retain stable Admin attribution, with no structured intent marker');
select is((select count(*) from audit_logs where action='points.participation_removed'
 and details->>'event_id'='-32601' and actor_officer_id=-32601),5::bigint,
 'retry did not duplicate removal audit');

set local role authenticated;
select lives_ok($$select save_event_with_links('Synthetic premature processing','Issue 326 regression',
 (select id from event_types where name='Meeting'),'TBA','2099-09-20',
 '2099-09-20 09:00-06','2099-09-20 11:00-06',array[(select id from branches where name='icpc')],-32601)$$,
 'Admin corrects schedule into the future using the existing RPC');
reset role;
select set_config('request.jwt.claim.sub','',true);
select results_eq($$select to_jsonb(s) from event_officers s where event_id=-32601 order by officer_id$$,
 $$select row from retained_signups order by (row->>'officer_id')::bigint$$,
 'all five original signup rows survive the correction unchanged');
select is(private.process_finished_events(),0,'corrected future schedule does not process');
select is((select coalesce(sum(points),0) from point_transactions where event_id=-32601 and removed_at is null),
 0::numeric,'premature removed awards do not count before corrected end');
select is((select participation_points_per_hour_at_end from events where id=-32601),1::numeric,
 'CURRENT GAP: correction retains the permanent processing marker');

-- Deterministically model the corrected Event having ended, without changing
-- the database clock or clearing its real processing/removal evidence.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select lives_ok($$select save_event_with_links('Synthetic premature processing','Issue 326 regression',
 (select id from event_types where name='Meeting'),'TBA','2021-09-20',
 '2021-09-20 09:00-06','2021-09-20 11:00-06',array[(select id from branches where name='icpc')],-32601)$$,
 'fixture advances to an ended corrected schedule via the same RPC');
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),0,'CURRENT GAP: corrected ended Event is skipped');
select is(private.process_finished_events(),0,'CURRENT behavior is stable on retry');
select is((select count(*) from point_transactions where event_id=-32601 and removed_at is null),0::bigint,
 'CURRENT GAP: missing five legitimate awards; #328 must assert five awards of two points instead');
select results_eq($$select to_jsonb(p) from point_transactions p where event_id=-32601 order by id$$,
 $$select row from premature_history order by (row->>'id')::bigint$$,
 'old transaction IDs, amounts, timestamps and removal attribution remain intact');
select is((select count(*) from premature_audit old join audit_logs a on a.id=old.id
 where to_jsonb(a)=old.row),(select count(*) from premature_audit),'original audit rows remain byte-for-byte equivalent as JSON');
select is((select count(*) from audit_logs where action='event.updated' and entity_id='-32601'
 and details->'before'->>'starts_at' is not null and details->'after'->>'starts_at' is not null
 and actor_officer_id=-32601),2::bigint,'both schedule corrections retain before/after audit and Admin actor');

-- Counterexample: legitimate award deliberately removed, plus an edited
-- automatic award at a NON-1 snapshotted rate. Neither means premature credit.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-32602,'Legitimate suppressed credit','Synthetic suppression control','TBA',
 (select id from event_types where name='Meeting'),'2020-09-21 09:00-06','2020-09-21 10:30-06');
insert into event_officers(event_id,officer_id) values(-32602,-32611),(-32602,-32612);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select set_participation_rate(1.25);
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),1,'control snapshots a fractional configured rate');
select is((select points from point_transactions where event_id=-32602 and officer_id=-32611),1.875::numeric,
 'historical 90-minute award retains fractional rate precision');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select remove_participation_award(id) from point_transactions where event_id=-32602 and officer_id=-32611;
select update_point_transaction(id,7) from point_transactions where event_id=-32602 and officer_id=-32612;
select add_manual_transaction(p_officer_id => -32613,p_event_id => null,p_points => -2,
 p_reason => 'Synthetic independent deduction',p_award_type => 'correction');
reset role;
select is((select count(*) from point_transactions where event_id=-32602 and removed_at is not null
 and removed_by_officer_id=-32601 and not slot_selection_removed),1::bigint,
 'legitimate suppression has the SAME removal marker shape as premature awards');
select is((select points from point_transactions where event_id=-32602 and officer_id=-32612),7::numeric,
 'current direct automatic amount editing remains possible; target policy remains pending');
select is((select updated_by_officer_id from point_transactions where event_id=-32602 and officer_id=-32612),-32601::bigint,
 'direct edit retains stable editor attribution');
select is((select count(*) from audit_logs where action='points.transaction_updated'
 and details->'before'->'points'='1.875'::jsonb and details->'after'->'points'='7'::jsonb),1::bigint,
 'direct edit audit preserves original and edited amounts');
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),0,'retry neither revives legitimate suppression nor overwrites direct edit');
select is((select total_points from officer_point_totals where id=-32613),-2::numeric,
 'independent negative correction contributes to totals');

-- Legacy combinations: Cancel and Archive are independent, and currently
-- neither lifecycle flag suspends an existing manual award in active totals.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status) values
 (-32603,'Legacy cancelled','Synthetic lifecycle','TBA',(select id from event_types where name='Meeting'),
 '2020-09-22 09:00-06','2020-09-22 10:00-06','cancelled');
insert into event_officers(event_id,officer_id) values(-32603,-32614);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select add_manual_transaction(p_officer_id => -32614,p_event_id => -32603,p_points => 3,
 p_reason => 'Synthetic legacy linked credit',p_award_type => 'manual');
select remove_event(-32603);
reset role;
select is((select total_points from officer_point_totals where id=-32614),3::numeric,
 'CURRENT GAP: cancelled AND archived Event-linked manual Points still count');
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),0,'legacy cancelled/archived Event is not processed');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032601',true);
set local role authenticated;
select restore_event_archive(-32603);
select is((select status from events where id=-32603),'cancelled','unarchive does not uncancel');
select restore_event(-32603);
reset role;
select is((select count(*) from event_officers where event_id=-32603),1::bigint,'legacy recovery preserves signup identity');
select is((select participation_points_per_hour_at_end from events where id=-32603),null::numeric,
 'legacy recovery does not fabricate processing history');

-- Legacy Warning states remain orthogonal to void and approval snapshots.
insert into officer_warnings(id,officer_id,reason,status) values
 (-32601,-32615,'Synthetic approved','approved'),(-32602,-32615,'Synthetic pending','pending'),
 (-32603,-32615,'Synthetic rejected','rejected');
insert into warning_approvals(warning_id,approver_id,approver_officer_id,approver_role,decision,decided_at)
 select id,'00000000-0000-4000-8000-000000032601',-32601,'President',status,
 case when status='pending' then null else now() end from officer_warnings where officer_id=-32615;
create temp table retained_approvals as select to_jsonb(a) row from warning_approvals a
 where warning_id in (-32601,-32602,-32603);
set local role authenticated;
select void_warning(id) from officer_warnings where officer_id=-32615 order by id;
reset role;
select results_eq($$select status from officer_warnings where officer_id=-32615 order by id$$,
 $$values ('rejected'::text),('pending'),('approved')$$,'void preserves rejected, pending and approved statuses');
select results_eq($$select to_jsonb(a) from warning_approvals a where warning_id in (-32601,-32602,-32603) order by warning_id$$,
 $$select row from retained_approvals order by (row->>'warning_id')::bigint$$,'all approval snapshots and decision times survive void');
select is((select count(*) from officer_warnings where officer_id=-32615 and status='approved' and voided_at is null),
 0::bigint,'voided approved Warning does not count; pending/rejected never become approved');

select * from finish();
rollback;
