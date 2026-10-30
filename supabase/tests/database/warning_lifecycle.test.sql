begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000033501','warning-admin@example.test'),
 ('00000000-0000-4000-8000-000000033502','warning-target@example.test'),
 ('00000000-0000-4000-8000-000000033503','warning-lead@example.test'),
 ('00000000-0000-4000-8000-000000033504','warning-outsider@example.test'),
 ('00000000-0000-4000-8000-000000033505','warning-inactive@example.test'),
 ('00000000-0000-4000-8000-000000033506','warning-unlinked@example.test');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
 (-33501,'Warning Admin','warning-admin@example.test',(select id from positions where code='officer'),'admin','active','00000000-0000-4000-8000-000000033501'),
 (-33502,'Warning Target','warning-target@example.test',(select id from positions where code='officer'),'officer','active','00000000-0000-4000-8000-000000033502'),
 (-33503,'Warning Lead','warning-lead@example.test',(select id from positions where code='lead'),'officer','active','00000000-0000-4000-8000-000000033503'),
 (-33504,'Warning Outsider','warning-outsider@example.test',(select id from positions where code='officer'),'officer','active','00000000-0000-4000-8000-000000033504'),
 (-33505,'Inactive Admin','warning-inactive@example.test',(select id from positions where code='officer'),'admin','inactive','00000000-0000-4000-8000-000000033505');

-- Preexisting approvals retain their original decision model and identity.
insert into officer_warnings(id,officer_id,reason,status,created_at,voided_at,voided_by) values
 (-33511,-33502,'Legacy pending','pending','2020-01-01',null,null),
 (-33512,-33502,'Legacy rejected','rejected','2020-01-02',null,null),
 (-33513,-33502,'Legacy approved','approved','2020-01-03',null,null),
 (-33514,-33502,'Legacy voided','approved','2020-01-04','2020-01-05',-33501);
insert into warning_approvals(warning_id,approver_id,approver_officer_id,approver_role,decision,decided_at)
 select id,'00000000-0000-4000-8000-000000033503',-33503,'President',status,
 case when status='pending' then null else '2020-01-04'::timestamptz end
 from officer_warnings where id between -33514 and -33511;
create temp table original_approvals as select to_jsonb(a) original from warning_approvals a;
create temp table original_warnings as select id,to_jsonb(w) original from officer_warnings w;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033501',true);
set local role authenticated;
select throws_ok($$select create_warning(-33502,E' \t\n ')$$,'P0001','Warning reason is required','whitespace-only creation reason is rejected at trusted boundary');
select throws_ok($$select update_warning(-33511,E'\n\t')$$,'P0001','Warning reason is required','whitespace-only correction is rejected');
select throws_ok($$select update_warning(-999999,'Correction')$$,'P0001','Warning not found','missing historical warning fails clearly');
select lives_ok($$select create_warning(-33502,'  Direct Admin warning  ')$$,'Admin creates an immediately effective Warning with no leaders');
reset role;
select is((select status from officer_warnings where reason='Direct Admin warning'),'approved','new Warning is immediately effective');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id where w.reason='Direct Admin warning'),0::bigint,'new Warning has no voting requirements or synthetic approvals');
select is((select count(*) from audit_logs where action='warning.created' and actor_officer_id=-33501 and details->>'management'='direct_admin'),1::bigint,'creation audit attributes the Admin and direct management');
select set_config('test.direct_warning_id',(select id::text from officer_warnings where reason='Direct Admin warning'),true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.direct_warning_id')::bigint,'rejected')$$,'P0001','This warning is already closed','legacy decision RPC cannot alter a new effective Warning');
select is(update_warning(-33511,'Corrected pending reason'),-33502::bigint,'update returns the canonical recipient');
select lives_ok($$select update_warning(-33512,'Corrected rejected reason')$$,'Admin corrects historical rejected Warning');
select lives_ok($$select update_warning(-33514,'Corrected voided reason')$$,'Admin corrects historical voided Warning');
select lives_ok($$select update_warning(current_setting('test.direct_warning_id')::bigint,'Corrected current reason')$$,'Admin corrects current Warning');
select lives_ok($$select update_warning(-33511,'Corrected pending reason')$$,'exact correction retry is safe');
reset role;
select results_eq($$select to_jsonb(a) from warning_approvals a order by warning_id$$,$$select original from original_approvals order by (original->>'warning_id')::bigint$$,'corrections preserve every legacy approval identity, decision and time');
select results_eq($$select to_jsonb(w)-'reason' from officer_warnings w where id between -33514 and -33511 order by id$$,$$select original-'reason' from original_warnings order by id$$,'corrections never promote legacy states or modify lifecycle/creation history');
select is((select count(*) from audit_logs where action='warning.updated'),4::bigint,'four material corrections audited once, exact retry creates no duplicate change');
select is((select count(*) from audit_logs where action='warning.updated' and entity_id='-33511' and actor_officer_id=-33501 and details->'before'->>'reason'='Legacy pending' and details->'after'->>'reason'='Corrected pending reason'),1::bigint,'correction audit retains before and after reason with actor');

-- Two existing active effective records plus one new Warning yield review,
-- without changing Officer access. Voiding remains the prior lifecycle here.
select is((select count(*) from officer_warnings where officer_id=-33502 and status='approved' and voided_at is null),2::bigint,'pending, rejected and voided records do not count');
set local role authenticated;
select create_warning(-33502,'Third active warning');
reset role;
select is((select count(*) from officer_warnings where officer_id=-33502 and status='approved' and voided_at is null),3::bigint,'third active Warning reaches Admin review threshold immediately');
select is((select status from officers where id=-33502),'active','review threshold does not deactivate Officer');
set local role authenticated;
select void_warning(current_setting('test.direct_warning_id')::bigint);
reset role;
select is((select count(*) from officer_warnings where officer_id=-33502 and status='approved' and voided_at is null),2::bigint,'void removes effective Warning from active count');
select is((select status from officer_warnings where id=current_setting('test.direct_warning_id')::bigint),'approved','void retains original effective status');
set local role authenticated;
select throws_ok($$select void_warning(current_setting('test.direct_warning_id')::bigint)$$,'P0001','Warning is already voided','repeat Void retains existing lifecycle rule');
select throws_ok($$select delete_warning(-33511)$$,'P0001','Warning deletion is disabled; void instead','physical delete compatibility remains disabled until lifecycle Issue');
select throws_ok($$delete from officer_warnings where id=-33511$$,'42501','permission denied for table officer_warnings','Admin cannot physically delete history');
select throws_ok($$update officer_warnings set status='approved' where id=-33511$$,'42501','permission denied for table officer_warnings','direct table status bypass denied');
reset role;

-- IDs alone never grant legacy approval access, and an unlinked account has
-- neither active role nor Officer access despite a valid authenticated session.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033504',true);
set local role authenticated;
select throws_ok($$select decide_warning(-33511,'approved')$$,'P0001','You are not an approver for this warning','outsider cannot decide legacy pending Warning by ID');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033506',true);
set local role authenticated;
select is((select count(*) from officer_warnings),0::bigint,'unlinked account cannot read Warnings');
select throws_ok($$select create_warning(-33502,'Unlinked')$$,'P0001','Admin required','unlinked account cannot create');
select throws_ok($$select update_warning(-33511,'Unlinked')$$,'P0001','Admin required','unlinked account cannot edit');
select throws_ok($$select decide_warning(-33511,'approved')$$,'P0001','Unauthorized','unlinked account cannot decide legacy Warning');
reset role;

-- Existing pending assignments remain an explicit legacy-only compatibility
-- route. Unrelated edits do not decide them, and new records have no approvals.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033503',true);
set local role authenticated;
select is((select count(*) from officer_warnings),1::bigint,'legacy approver retains only assigned pending visibility');
select throws_ok($$select create_warning(-33502,'Forged Lead warning')$$,'P0001','Admin required','Lead cannot create Warning');
select throws_ok($$select update_warning(-33511,'Forged Lead correction')$$,'P0001','Admin required','Lead cannot correct Warning');
select lives_ok($$select decide_warning(-33511,'rejected')$$,'legacy snapshotted approver can explicitly close old pending decision');
select throws_ok($$select decide_warning(-33511,'approved')$$,'P0001','This warning is already closed','closed legacy decision cannot be changed');
select throws_ok($$select decide_warning(-33514,'approved')$$,'P0001','This warning is voided','voided legacy Warning cannot receive decisions');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033502',true);
set local role authenticated;
select is((select count(*) from officer_warnings),2::bigint,'recipient sees only own nonvoided effective Warnings');
select is((select count(*) from warning_approvals),0::bigint,'recipient cannot read historical approval details');
select throws_ok($$select create_warning(-33502,'Forged own warning')$$,'P0001','Admin required','ordinary Officer cannot create');
select throws_ok($$select update_warning(-33513,'Forged own edit')$$,'P0001','Admin required','ordinary Officer cannot edit');
select throws_ok($$select void_warning(-33513)$$,'P0001','Admin required','ordinary Officer cannot void');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033504',true);
set local role authenticated;
select is((select count(*) from officer_warnings),0::bigint,'unrelated Officer cannot read Warning reasons');
select is((select count(*) from warning_approvals),0::bigint,'unrelated Officer cannot read approvals');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033505',true);
set local role authenticated;
select throws_ok($$select create_warning(-33502,'Inactive Admin')$$,'P0001','Admin required','inactive Admin cannot create');
select throws_ok($$select update_warning(-33513,'Inactive Admin')$$,'P0001','Admin required','inactive Admin cannot edit');
reset role;
set local role anon;
select throws_ok($$select create_warning(-33502,'Anonymous')$$,'42501','permission denied for function create_warning','anonymous cannot create');
select throws_ok($$select update_warning(-33513,'Anonymous')$$,'42501','permission denied for function update_warning','anonymous cannot edit');
reset role;

-- Source mutations roll back with their audit if recording history fails.
create function pg_temp.reject_warning_audit() returns trigger language plpgsql as $$
begin
 if new.action in ('warning.created','warning.updated') then raise exception 'Synthetic audit failure'; end if;
 return new;
end;
$$;
create trigger reject_warning_audit before insert on audit_logs for each row execute function pg_temp.reject_warning_audit();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033501',true);
set local role authenticated;
select throws_ok($$select create_warning(-33502,'Should roll back')$$,'P0001','Synthetic audit failure','create and audit fail atomically');
select throws_ok($$select update_warning(-33513,'Should roll back')$$,'P0001','Synthetic audit failure','historical correction and audit fail atomically');
reset role;
select is((select count(*) from officer_warnings where reason='Should roll back'),0::bigint,'no unaudited create or reason edit remains');
select is((select reason from officer_warnings where id=-33513),'Legacy approved','failed edit preserves original historical reason');

select * from finish();
rollback;
