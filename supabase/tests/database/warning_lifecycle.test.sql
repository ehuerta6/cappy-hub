begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();


insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000901','pr9-admin@example.org'),
  ('00000000-0000-4000-8000-000000000902','pr9-president@example.org'),
  ('00000000-0000-4000-8000-000000000903','pr9-vpo@example.org'),
  ('00000000-0000-4000-8000-000000000904','pr9-vpa@example.org'),
  ('00000000-0000-4000-8000-000000000905','pr9-target@example.org'),
  ('00000000-0000-4000-8000-000000000906','pr9-outsider@example.org'),
  ('00000000-0000-4000-8000-000000000907','pr9-lead@example.org');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
  (-901,'Warning Admin','pr9-admin@example.org',(select id from positions where name='Officer'),'admin','active','00000000-0000-4000-8000-000000000901'),
  (-902,'Warning President','pr9-president@example.org',(select id from positions where name='President'),'officer','active','00000000-0000-4000-8000-000000000902'),
  (-903,'Warning VP Operations','pr9-vpo@example.org',(select id from positions where name='Vice President of Operations'),'officer','active','00000000-0000-4000-8000-000000000903'),
  (-904,'Warning VP Academics','pr9-vpa@example.org',(select id from positions where name='Vice President of Academics'),'officer','active','00000000-0000-4000-8000-000000000904'),
  (-905,'Warning Target','pr9-target@example.org',(select id from positions where name='Officer'),'officer','active','00000000-0000-4000-8000-000000000905'),
  (-906,'Warning Outsider','pr9-outsider@example.org',(select id from positions where name='Officer'),'officer','active','00000000-0000-4000-8000-000000000906'),
  (-907,'Warning Lead','pr9-lead@example.org',(select id from positions where name='Lead'),'officer','active','00000000-0000-4000-8000-000000000907');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
select throws_ok($$select create_warning(-905,'forged')$$,'P0001','Admin required',
  'normal officer cannot create a warning');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000907',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select lives_ok($$select create_warning(-905,'First warning')$$,
  'admin can create a warning');
reset role;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning'),3::bigint,'President and both VPs are snapshotted');
select is((select approver_officer_id from warning_approvals a
  join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning' and a.approver_id='00000000-0000-4000-8000-000000000902'),
  -902::bigint,'current warning snapshot writes the stable approver Officer ID');
select set_config('test.first_warning_id',
  (select id::text from officer_warnings where reason='First warning'),true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,
  'P0001','You are not an approver for this warning',
  'admin cannot vote without a snapshotted approval');
reset role;

update officers set status='inactive' where id=-904;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
set local role authenticated;
reset role;
update officers set status='active' where id=-904;

-- Officer privacy and required-approver read scope are exercised as real roles.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000906',true);
select is((select count(*) from officer_warnings),0::bigint,
  'unrelated officer cannot read warning');
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,
  'P0001','You are not an approver for this warning',
  'unrelated officer cannot vote even with warning ID');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-902,'President target')$$,
  'admin can warn the President');
reset role;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='President target' and a.approver_id='00000000-0000-4000-8000-000000000902'),0::bigint,
  'President has no self-vote');
select set_config('test.president_warning_id',
  (select id::text from officer_warnings where reason='President target'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-903,'VP target')$$,
  'admin can warn a VP without giving that VP a self-vote');
reset role;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='VP target' and a.approver_id='00000000-0000-4000-8000-000000000903'),
  0::bigint,'VP cannot approve own warning');

-- A position change after creation does not change the frozen snapshot.
update officers set position_id=(select id from positions where name='Officer') where id=-902;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select lives_ok($$select decide_warning((select id from public.officer_warnings
  where reason='First warning'),'approved')$$,
  'former President retains snapshotted voting authority');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'rejected')$$,'P0001',
  'This approval has already been decided','approver cannot change vote');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select lives_ok($$select decide_warning((select id from public.officer_warnings
  where reason='First warning'),'rejected')$$,'VP can reject');
reset role;
select is((select status from officer_warnings where reason='First warning'),'rejected',
  'one rejection closes warning as rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,'P0001','This warning is already closed',
  'remaining approver cannot reopen a rejected warning');
reset role;

-- Missing links fail atomically, and a zero-person snapshot never auto-approves.
insert into officers(id,name,utep_email,position_id,status) values
  (-908,'Unlinked VP','pr9-unlinked@example.org',
    (select id from positions where name='Vice President of Academics'),'active');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select create_warning(-905,'Missing account')$$,'P0001',
  'Required approvers must have active linked accounts','unlinked required leader blocks creation');
reset role;
delete from officers where id=-908;
update officers set status='inactive' where id=-904;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select create_warning(-905,'Inactive leader')$$,'P0001',
  'Required approvers must have active linked accounts',
  'inactive current leader blocks creation rather than being silently omitted');
reset role;
update officers set status='active' where id=-904;
update officers set position_id=(select id from positions where name='Officer')
  where id in (-903,-904);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select create_warning(-905,'No approvers')$$,'P0001',
  'No eligible approvers remain','zero-approver warning cannot be created');
reset role;
update officers set position_id=(select id from positions where name='Vice President of Operations')
  where id=-903;
update officers set position_id=(select id from positions where name='Vice President of Academics')
  where id=-904;

-- A second target can be fully approved; only that warning enters counts.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-905,'Approved warning')$$,'admin creates second warning');
reset role;
select set_config('test.approved_warning_id',
  (select id::text from officer_warnings where reason='Approved warning'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select lives_ok($$select decide_warning(current_setting('test.approved_warning_id')::bigint,'approved')$$,
  'first approval works');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
select lives_ok($$select decide_warning(current_setting('test.approved_warning_id')::bigint,'approved')$$,
  'last approval works');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.approved_warning_id')::bigint,'rejected')$$,
  'P0001','This warning is already closed','approved status is terminal');
reset role;
select is((select count(*) from officer_warnings where officer_id=-905 and status='approved'),
  1::bigint,'approved-only count excludes rejected warning');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
select is((select count(*) from officer_warnings),1::bigint,
  'assigned officer sees only own approved warning');
reset role;

-- Deletion retains the complete snapshot outside the deleted source rows.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000906',true);
set local role authenticated;
select throws_ok($$select delete_warning((select id from public.officer_warnings
  where reason='Approved warning'))$$,'P0001','Admin required',
  'normal officer cannot delete');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select lives_ok($$select delete_warning((select id from public.officer_warnings
  where reason='Approved warning'))$$,'admin deletes warning');
reset role;
select is((select pg_catalog.jsonb_array_length(details->'approvers')
  from audit_logs where action='warning.deleted'),2,
  'deletion audit retains every approver');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select delete_warning(current_setting('test.approved_warning_id')::bigint)$$,
  'P0001','Warning not found','repeat deletion fails');
reset role;

-- The review flag is derived from approved count; it never mutates access.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-905,'Review one')$$,'create review warning one');
select lives_ok($$select create_warning(-905,'Review two')$$,'create review warning two');
select lives_ok($$select create_warning(-905,'Review three')$$,'create review warning three');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select lives_ok($$select decide_warning(id,'approved') from public.officer_warnings
  where reason like 'Review %'$$,'first VP approves review warnings');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
set local role authenticated;
select lives_ok($$select decide_warning(id,'approved') from public.officer_warnings
  where reason like 'Review %'$$,'second VP approves review warnings');
reset role;
select is((select count(*) from officer_warnings where officer_id=-905 and status='approved'),
  3::bigint,'three approved warnings yield admin-review threshold');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
reset role;

select * from finish();
rollback;
