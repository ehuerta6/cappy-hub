begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('anon','public.create_warning(bigint,text)','EXECUTE')
  and not has_function_privilege('anon','public.decide_warning(bigint,text)','EXECUTE')
  and not has_function_privilege('anon','public.delete_warning(bigint)','EXECUTE'),
  'anonymous users cannot execute warning mutations');
select ok(has_function_privilege('authenticated','private.has_pending_warning_approval(bigint)','EXECUTE')
  and not has_function_privilege('anon','private.has_pending_warning_approval(bigint)','EXECUTE')
  and not has_table_privilege('authenticated','public.officer_warnings','INSERT')
  and not has_table_privilege('authenticated','public.officer_warnings','UPDATE')
  and not has_table_privilege('authenticated','public.officer_warnings','DELETE')
  and not has_table_privilege('authenticated','public.warning_approvals','UPDATE'),
  'raw warning writes and the private read helper stay closed');

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
select throws_ok($$update public.officer_warnings set reason='changed'$$,'42501',null,
  'normal client cannot edit warning fields directly');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000907',true);
select throws_ok($$select create_warning(-905,'lead forged')$$,'P0001','Admin required',
  'Lead without admin role cannot create');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select throws_ok($$select create_warning(-905,'   ')$$,'P0001','Warning reason is required',
  'blank reason is rejected');
select lives_ok($$select create_warning(-905,'First warning')$$,
  'admin can create a warning');
reset role;
select is((select status from officer_warnings where reason='First warning'),'pending',
  'new warning is pending');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning'),3::bigint,'President and both VPs are snapshotted');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning' and a.decision='pending' and a.decided_at is null),3::bigint,
  'all approval rows begin undecided');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning' and a.approver_role='Vice President'),2::bigint,
  'VP role is stored as a snapshot');
select is((select count(*) from audit_logs where action='warning.created' and details->>'reason'='First warning'
  and actor_id='00000000-0000-4000-8000-000000000901'),1::bigint,
  'creation audit records admin and reason');
select set_config('test.first_warning_id',
  (select id::text from officer_warnings where reason='First warning'),true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,
  'P0001','You are not an approver for this warning',
  'admin cannot vote without a snapshotted approval');
select is((select count(*) from officer_warnings),1::bigint,
  'admin sees pending warning');
select is((select count(*) from warning_approvals),3::bigint,
  'admin sees all approval rows');
reset role;

update officers set status='inactive' where id=-904;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,
  'P0001','Unauthorized','inactive snapshotted leader cannot vote');
reset role;
update officers set status='active' where id=-904;

-- Officer privacy and required-approver read scope are exercised as real roles.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
select is((select count(*) from officer_warnings),0::bigint,
  'warned officer cannot read their pending warning');
select is((select count(*) from warning_approvals),0::bigint,
  'warned officer cannot read approval internals');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000906',true);
select is((select count(*) from officer_warnings),0::bigint,
  'unrelated officer cannot read warning');
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'approved')$$,
  'P0001','You are not an approver for this warning',
  'unrelated officer cannot vote even with warning ID');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select count(*) from officer_warnings),1::bigint,
  'required President sees warning awaiting decision');
select is((select count(*) from warning_approvals),1::bigint,
  'President sees only their own pending approval row');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-902,'President target')$$,
  'admin can warn the President');
reset role;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='President target'),2::bigint,
  'warned President is excluded from their own approval');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='President target' and a.approver_id='00000000-0000-4000-8000-000000000902'),0::bigint,
  'President has no self-vote');
select set_config('test.president_warning_id',
  (select id::text from officer_warnings where reason='President target'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select is((select count(*) from officer_warnings),1::bigint,
  'President cannot see their own pending warning while seeing assigned one');
select throws_ok($$select decide_warning(current_setting('test.president_warning_id')::bigint,'approved')$$,'P0001',
  'You are not an approver for this warning','warned leader cannot self-vote');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select create_warning(-903,'VP target')$$,
  'admin can warn a VP without giving that VP a self-vote');
reset role;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='VP target'),2::bigint,
  'warned VP is excluded and the other required leaders remain');
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='VP target' and a.approver_id='00000000-0000-4000-8000-000000000903'),
  0::bigint,'VP cannot approve own warning');

-- A position change after creation does not change the frozen snapshot.
update officers set position_id=(select id from positions where name='Officer') where id=-902;
select is((select count(*) from warning_approvals a join officer_warnings w on w.id=a.warning_id
  where w.reason='First warning'),3::bigint,'later demotion leaves the original approval set unchanged');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select lives_ok($$select decide_warning((select id from public.officer_warnings
  where reason='First warning'),'approved')$$,
  'former President retains snapshotted voting authority');
reset role;
select is((select status from officer_warnings where reason='First warning'),'pending',
  'one of three approvals leaves warning pending');
select ok((select decided_at is not null from warning_approvals a
  join officer_warnings w on w.id=a.warning_id where w.reason='First warning'
  and a.approver_id='00000000-0000-4000-8000-000000000902'),
  'first decision records its time');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select throws_ok($$select decide_warning(current_setting('test.first_warning_id')::bigint,'rejected')$$,'P0001',
  'This approval has already been decided','approver cannot change vote');
reset role;
select is((select count(*) from audit_logs where action='warning.approved_by_approver'
  and actor_id='00000000-0000-4000-8000-000000000902'),1::bigint,
  'approval has actual approver actor and duplicate produced no audit');

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
select is((select count(*) from audit_logs where action='warning.rejected_by_approver'
  and actor_id='00000000-0000-4000-8000-000000000903'),1::bigint,
  'rejection is attributed to rejecting VP');

-- Missing links fail atomically, and a zero-person snapshot never auto-approves.
insert into officers(id,name,utep_email,position_id,status) values
  (-908,'Unlinked VP','pr9-unlinked@example.org',
    (select id from positions where name='Vice President of Academics'),'active');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select create_warning(-905,'Missing account')$$,'P0001',
  'Required approvers must have active linked accounts','unlinked required leader blocks creation');
reset role;
select is((select count(*) from officer_warnings where reason='Missing account'),0::bigint,
  'missing-link failure leaves no partial warning');
select is((select count(*) from audit_logs where action='warning.created'
  and details->>'reason'='Missing account'),0::bigint,
  'failed creation leaves no success audit');
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
select is((select count(*) from officer_warnings where reason='No approvers'),0::bigint,
  'zero-approver failure leaves no warning');
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
select is((select status from officer_warnings where reason='Approved warning'),'approved',
  'all approvals produce approved warning');
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
select is((select count(*) from warning_approvals),0::bigint,
  'assigned officer still cannot read approval rows');
reset role;

-- Deletion retains the complete snapshot outside the deleted source rows.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000906',true);
set local role authenticated;
select throws_ok($$select delete_warning((select id from public.officer_warnings
  where reason='Approved warning'))$$,'P0001','Admin required',
  'normal officer cannot delete');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
select throws_ok($$select delete_warning((select id from public.officer_warnings
  where reason='Approved warning'))$$,'P0001','Admin required',
  'required approver cannot delete by voting authority');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select lives_ok($$select delete_warning((select id from public.officer_warnings
  where reason='Approved warning'))$$,'admin deletes warning');
reset role;
select is((select count(*) from officer_warnings where reason='Approved warning'),0::bigint,
  'warning is physically gone');
select is((select count(*) from warning_approvals a join audit_logs l
  on l.entity_id=a.warning_id::text where l.action='warning.deleted'),0::bigint,
  'cascade leaves no approval rows');
select is((select count(*) from audit_logs where action='warning.deleted'
  and actor_id='00000000-0000-4000-8000-000000000901'),1::bigint,
  'one surviving deletion audit records admin actor');
select is((select details->>'reason' from audit_logs where action='warning.deleted'),
  'Approved warning','deletion audit retains reason');
select is((select pg_catalog.jsonb_array_length(details->'approvers')
  from audit_logs where action='warning.deleted'),2,
  'deletion audit retains every approver');
select is((select count(*) from audit_logs where action='warning.deleted'
  and details->'approvers' @> '[{"decision":"approved"}]'::jsonb),1::bigint,
  'deletion audit retains decisions');
select is((select count(*) from officer_warnings where officer_id=-905 and status='approved'),
  0::bigint,'deletion reduces current approved count');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select throws_ok($$select delete_warning(current_setting('test.approved_warning_id')::bigint)$$,
  'P0001','Warning not found','repeat deletion fails');
reset role;
select is((select count(*) from audit_logs where action='warning.deleted'),1::bigint,
  'failed repeat deletion adds no success audit');

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
select is((select status from officers where id=-905),'active',
  'review threshold does not deactivate officer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000905',true);
set local role authenticated;
select is((select count(*) from officer_warnings where officer_id=-905),3::bigint,
  'officer remains able to read their approved warnings');
reset role;

select * from finish();
rollback;
