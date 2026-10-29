begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000003271','manual-admin@example.test'),
 ('00000000-0000-4000-8000-000000003272','manual-lead@example.test'),
 ('00000000-0000-4000-8000-000000003273','manual-officer@example.test'),
 ('00000000-0000-4000-8000-000000003274','manual-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-3271,'Manual Admin','manual-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000003271'),
 (-3272,'Manual Lead','manual-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000003272'),
 (-3273,'Manual Officer','manual-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000003273'),
 (-3274,'Manual Inactive','manual-inactive@example.test',(select id from positions where name='Officer'),'inactive','admin','00000000-0000-4000-8000-000000003274');
insert into officer_branches(officer_id,branch_id) select -3272,id from branches where name='intro';
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-3271,'Automatic first','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-01-01 09:00-07','2020-01-01 11:00-07'),
 (-3272,'Manual first','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-01-02 09:00-07','2020-01-02 11:00-07');
insert into event_branches(event_id,branch_id) select -3271,id from branches where name='icpc';
insert into event_officers(event_id,officer_id) values(-3271,-3273),(-3272,-3273);
update application_config set participation_points_per_hour=1 where id=1;
-- Isolate the second processing path until its manual transaction exists.
update events set participation_points_per_hour_at_end=1 where id=-3272;
select is(private.process_finished_events(),1,'automatic first creates a two-hour award');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003271',true);
set local role authenticated;
select lives_ok($$select add_manual_transaction(-3273,3,' Additional contribution ','manual',-3271)$$,
 'Admin can add independent manual credit alongside participation');
select is((select total_points from officer_point_totals where id=-3273),5::numeric,
 'two automatic plus three manual Points contribute five');
select lives_ok($$select add_manual_transaction(-3273,-1,'Independent deduction','manual',-3271)$$,
 'a second signed manual entry may reference the same Officer and Event');
select is((select total_points from officer_point_totals where id=-3273),4::numeric,
 'independent negative manual Points subtract from the active total');
select lives_ok($$select add_manual_transaction(-3273,-0.5,'Legacy correction','correction',-3271)$$,
 'correction type remains supported alongside both categories');
select lives_ok($$select add_manual_transaction(-3273,1.5,'Unlinked credit','manual')$$,
 'manual transaction may omit its Event');
select throws_ok($$select add_manual_transaction(-3273,1,'   ','manual',-3271)$$,
 'P0001','Reason required','whitespace-only reason is rejected at the trusted boundary');
select throws_ok($$select add_manual_transaction(-3273,1,E'\t\n','manual')$$,
 'P0001','Reason required','tabs and newlines alone are not a reason');
select throws_ok($$select add_manual_transaction(-3273,0,'Zero','manual')$$,
 'P0001','Invalid point value','zero remains invalid');
select throws_ok($$select add_manual_transaction(-3273,'NaN'::numeric,'NaN','manual')$$,
 'P0001','Invalid point value','nonfinite amounts remain invalid');
select throws_ok($$select add_manual_transaction(-3274,1,'Inactive','manual')$$,
 'P0001','Target officer is not active','inactive recipient remains protected');
select throws_ok($$select add_manual_transaction(-3273,1,'Missing Event','manual',-999999)$$,
 '23503',null,'Event references retain referential integrity');
select lives_ok($$select add_manual_transaction(-3273,3,'Before automatic processing','manual',-3272)$$,
 'manual credit may precede automatic processing');
reset role;
select set_config('request.jwt.claim.sub','',true);
update events set participation_points_per_hour_at_end=null where id=-3272;
select is(private.process_finished_events(),1,'manual credit does not suppress ordinary processing');
select is((select sum(points) from point_transactions where event_id=-3272 and removed_at is null),5::numeric,
 'manual-first order also retains both amounts');
select is(private.process_finished_events(),0,'exact automatic retry creates no duplicate awards');
select is((select count(*) from point_transactions where event_id=-3272 and award_type='participation'),1::bigint,
 'ordinary automatic identity remains unique');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-3273,-3272,2,'Duplicate automatic','participation')$$,'23505',null,
 'database rejects duplicate automatic identity independently of the processor');
select ok((select bool_and(created_by_officer_id=-3271 and created_by='00000000-0000-4000-8000-000000003271'::uuid)
 from point_transactions where award_type in ('manual','correction') and officer_id=-3273),
 'manual and correction transactions retain stable Admin attribution');
select is((select reason from point_transactions where event_id=-3271 and points=3),'Additional contribution',
 'reason is trimmed and retained');
select is((select count(*) from audit_logs where action in ('points.manual_created','points.correction_created')
 and actor_officer_id=-3271),5::bigint,'each successful manual or correction entry has its own attributed audit');

-- Adding independent credit never revives an intentional removal or rewrites an edited automatic amount.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003271',true);
set local role authenticated;
select remove_participation_award((select id from point_transactions where event_id=-3271 and award_type='participation'));
select update_point_transaction((select id from point_transactions where event_id=-3272 and award_type='participation'),7);
reset role;
create temp table original_points as select id,to_jsonb(p) original from point_transactions p;
create temp table original_audit as select id,to_jsonb(a) original from audit_logs a;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003271',true);
set local role authenticated;
select lives_ok($$select add_manual_transaction(-3273,2,'After intentional removal','manual',-3271)$$,
 'manual creation preserves intentional removal');
select lives_ok($$select add_manual_transaction(-3273,-1,'After direct edit','manual',-3272)$$,
 'manual deduction coexists with a historically edited automatic amount');
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(private.process_finished_events(),0,'manual writes do not reset processing markers');
select results_eq($$select p.id,to_jsonb(p) from point_transactions p join original_points o using(id) order by p.id$$,
 $$select id,original from original_points order by id$$,'all prior transaction fields remain unchanged');
select results_eq($$select a.id,to_jsonb(a) from audit_logs a join original_audit o using(id) order by a.id$$,
 $$select id,original from original_audit order by id$$,'all prior audit fields remain unchanged');
select is((select total_points from officer_point_totals where id=-3273),14::numeric,
 'totals include signed manual/correction credit and edited automatic credit, excluding removed credit');

set local role anon;
select throws_ok($$select add_manual_transaction(-3273,1,'Attack','manual')$$,'42501',null,
 'anonymous callers cannot execute the manual RPC');
reset role;
set local role authenticated;
select throws_ok($$select add_manual_transaction(-3273,1,'Attack','manual')$$,'P0001','Admin required',
 'unlinked authenticated caller cannot create credit');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003272',true);
select throws_ok($$select add_manual_transaction(-3273,1,'Attack','manual',-3271)$$,'P0001','Admin required',
 'Lead cannot bypass Admin-only manual permissions through an out-of-scope Event');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003273',true);
select throws_ok($$select add_manual_transaction(-3273,1,'Attack','manual')$$,'P0001','Admin required',
 'ordinary Officer cannot create personal credit');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-3273,1,'Attack','manual')$$,
 '42501',null,'direct table writes cannot bypass trusted authorization');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003274',true);
select throws_ok($$select add_manual_transaction(-3273,1,'Attack','manual')$$,'P0001','Admin required',
 'inactive Admin cannot create credit');
reset role;

-- Audit failure is atomic for the independent manual path too.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003271',true);
alter table audit_logs add constraint reject_manual_audit check(action<>'points.manual_created') not valid;
set local role authenticated;
select throws_ok($$select add_manual_transaction(-3273,100,'Must roll back','manual',-3271)$$,'23514',null,
 'manual audit failure surfaces');
reset role;
select is((select count(*) from point_transactions where reason='Must roll back'),0::bigint,
 'manual audit failure leaves no transaction');
select * from finish();
rollback;
