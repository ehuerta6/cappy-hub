begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Inspect effective database state, not only the migration source.
select is((select count(*) from pg_catalog.pg_policies
  where schemaname='public' and policyname like 'TEMPORARY DEVELOPMENT %'),0::bigint,
  'no prototype policy remains');
select is((select count(*) from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0::bigint,
  'every public application table has RLS enabled');
select is((select count(*) from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and a.attnum>0
    and a.attacl is not null),0::bigint,
  'prototype column-level grants are gone');
select ok(not exists(select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v')
    and (has_table_privilege('anon',c.oid,'SELECT')
      or has_table_privilege('anon',c.oid,'INSERT')
      or has_table_privilege('anon',c.oid,'UPDATE')
      or has_table_privilege('anon',c.oid,'DELETE'))),
  'anon has no operational table or view privileges');
select ok(not exists(select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and (has_any_column_privilege('authenticated',c.oid,'INSERT')
      or has_any_column_privilege('authenticated',c.oid,'UPDATE')
      or has_table_privilege('authenticated',c.oid,'DELETE'))),
  'authenticated has no raw application table writes, including per-column grants');
select ok(not exists(select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='S'
    and (has_sequence_privilege('anon',c.oid,'USAGE')
      or has_sequence_privilege('authenticated',c.oid,'USAGE'))),
  'client roles cannot allocate application sequence values');
select ok(not exists(select 1 from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid=d.defaclrole
  cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
  where n.nspname='public' and owner_role.rolname='postgres' and acl.grantee in
    ((select oid from pg_catalog.pg_roles where rolname='anon'),
     (select oid from pg_catalog.pg_roles where rolname='authenticated'))),
  'future objects created by postgres do not default to client-role privileges');
select ok((select 'security_invoker=true'=any(c.reloptions) from pg_catalog.pg_class c
  where c.oid='public.officer_point_totals'::regclass)
  and (select 'security_invoker=true'=any(c.reloptions) from pg_catalog.pg_class c
  where c.oid='public.dashboard_summary'::regclass)
  and (select 'security_invoker=true'=any(c.reloptions) from pg_catalog.pg_class c
  where c.oid='public.point_history'::regclass),
  'all exposed views invoke underlying RLS as the caller');
select ok(not exists(select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')),
  'anon cannot execute any public application function');
select ok(not has_function_privilege('authenticated','private.process_finished_events()','EXECUTE')
  and has_function_privilege('authenticated','public.claim_current_officer_identity()','EXECUTE')
  and has_function_privilege('authenticated','public.save_officer(text,bigint,text,bigint[],bigint,text,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.set_officer_application_role(bigint,text)','EXECUTE')
  and has_function_privilege('authenticated','public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)','EXECUTE')
  and has_function_privilege('authenticated','public.cancel_event(bigint)','EXECUTE')
  and has_function_privilege('authenticated','public.change_event_signup(bigint,bigint,boolean)','EXECUTE')
  and has_function_privilege('authenticated','public.add_manual_transaction(bigint,numeric,text,text,bigint)','EXECUTE')
  and has_function_privilege('authenticated','public.set_participation_rate(numeric)','EXECUTE')
  and has_function_privilege('authenticated','public.remove_participation_award(bigint)','EXECUTE')
  and (select pg_catalog.bool_and(has_function_privilege('authenticated', signature, 'EXECUTE'))
    from pg_catalog.unnest(array[
      'public.create_position(text)','public.rename_position(bigint,text)','public.delete_position(bigint)',
      'public.create_branch(text)','public.rename_branch(bigint,text)','public.delete_branch(bigint)',
      'public.create_event_type(text)','public.rename_event_type(bigint,text)','public.delete_event_type(bigint)'
    ]) as signature),
  'only checked current-user mutation RPCs retain authenticated access');
select is((select count(*) from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  18::bigint,'authenticated has exactly the eighteen reviewed public RPC entry points');

-- Fixtures are inserted as database owner. Every probe below changes to the
-- real PostgREST roles with a request JWT sub; all fixture writes roll back.
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000401','rls-admin@example.org'),
  ('00000000-0000-4000-8000-000000000402','rls-lead@example.org'),
  ('00000000-0000-4000-8000-000000000403','rls-officer@example.org'),
  ('00000000-0000-4000-8000-000000000404','rls-inactive@example.org'),
  ('00000000-0000-4000-8000-000000000405','rls-unlinked@example.org');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
  (-401,'RLS Admin','rls-admin@example.org',(select id from positions where name='Officer'),'admin','active','00000000-0000-4000-8000-000000000401'),
  (-402,'RLS Lead','rls-lead@example.org',(select id from positions where name='Lead'),'officer','active','00000000-0000-4000-8000-000000000402'),
  (-403,'RLS Officer','rls-officer@example.org',(select id from positions where name='Officer'),'officer','active','00000000-0000-4000-8000-000000000403'),
  (-404,'RLS Inactive','rls-inactive@example.org',(select id from positions where name='Officer'),'officer','inactive','00000000-0000-4000-8000-000000000404');
insert into officer_branches(officer_id,branch_id)
  select -402,id from branches where name='intro';
insert into events(id,name,event_type_id,starts_at,ends_at) values
  (-401,'RLS Global',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-402,'RLS Intro',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-403,'RLS ICPC',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id)
  select -402,id from branches where name='intro'
  union all select -403,id from branches where name='icpc';
insert into point_transactions(id,officer_id,points,reason,award_type) values
  (-401,-403,2,'RLS active points','manual'),
  (-402,-403,5,'RLS removed points','manual');
update point_transactions set removed_at=now() where id=-402;
insert into officer_warnings(id,officer_id,reason,status) values
  (-401,-403,'RLS approved own','approved'),
  (-402,-403,'RLS pending own','pending'),
  (-403,-403,'RLS rejected own','rejected'),
  (-404,-402,'RLS other approved','approved');
insert into warning_approvals(warning_id,approver_id,approver_role) values
  (-402,'00000000-0000-4000-8000-000000000401','President');
insert into audit_logs(id,actor_id,action,entity_type,entity_id) values
  (-401,'00000000-0000-4000-8000-000000000401','rls_test','officer','-403');

-- Anonymous: actual SELECT, INSERT, UPDATE, DELETE, RPC, and view requests.
set local role anon;
select throws_ok($$select * from officers$$,'42501',null,'anon cannot list officers or read contact emails');
select throws_ok($$select * from events$$,'42501',null,'anon cannot read events');
select throws_ok($$select * from point_transactions$$,'42501',null,'anon cannot read points');
select throws_ok($$select * from officer_branches$$,'42501',null,'anon cannot read memberships');
select throws_ok($$select * from event_officers$$,'42501',null,'anon cannot read signups');
select throws_ok($$select * from officer_point_totals$$,'42501',null,'anon cannot read point totals view');
select throws_ok($$select * from dashboard_summary$$,'42501',null,'anon cannot read dashboard view');
select throws_ok($$insert into officers(name,utep_email,position_id) values('Attack','attack-anon@example.org',17)$$,
  '42501',null,'anon cannot insert officer');
select throws_ok($$update officers set application_role='admin' where id=-403$$,
  '42501',null,'anon cannot update roles');
select throws_ok($$delete from event_officers where event_id=-402$$,
  '42501',null,'anon cannot delete signup');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-403,1000000,'Attack','manual')$$,
  '42501',null,'anon cannot forge points');
select throws_ok($$select save_officer('Attack',17,'active',null,null,'attack-anon@example.org')$$,
  '42501',null,'anon cannot invoke trusted mutation');
select throws_ok($$select private.process_finished_events()$$,
  '42501',null,'anon cannot invoke private points processor');
reset role;

-- A valid authenticated role with no officer, or an inactive linked officer,
-- gets no application rows, including aggregate views and warning data.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000405',true);
set local role authenticated;
select is((select count(*) from officers),0::bigint,'unlinked user sees no officers');
select is((select count(*) from events),0::bigint,'unlinked user sees no events');
select is((select count(*) from branches),0::bigint,'unlinked user sees no branch catalog');
select is((select count(*) from officer_branches),0::bigint,'unlinked user sees no memberships');
select is((select count(*) from point_transactions),0::bigint,'unlinked user sees no points');
select is((select count(*) from officer_point_totals),0::bigint,'unlinked user sees no point totals');
select is((select count(*) from dashboard_summary),0::bigint,'unlinked user sees no aggregate dashboard row');
select is((select count(*) from officer_warnings),0::bigint,'unlinked user sees no warnings');
select is((select count(*) from application_config),0::bigint,'unlinked user sees no configuration');
select is(claim_current_officer_identity(),null::bigint,
  'unlinked account cannot claim an unrelated officer');
select throws_ok($$select change_event_signup(-402,-403,false)$$,
  'P0001','Unauthorized','unlinked user cannot call signup RPC successfully');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000404',true);
select is((select count(*) from officers),0::bigint,'inactive linked officer sees no officers');
select is((select count(*) from events),0::bigint,'inactive linked officer sees no events');
select is((select count(*) from event_officers),0::bigint,'inactive linked officer sees no signups');
select is((select count(*) from dashboard_summary),0::bigint,'inactive linked officer sees no dashboard row');
select is((select count(*) from audit_logs),0::bigint,'inactive linked officer sees no audit rows');
select is(claim_current_officer_identity(),null::bigint,
  'inactive account cannot reclaim application access');

-- Normal officer: peer reads work, but every direct mutation path is shut.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000403',true);
select is((select count(*) from officers),4::bigint,'normal officer can read peer directory including inactive history');
select is((select utep_email from officers where id=-401),'rls-admin@example.org',
  'approved officer can read permitted peer contact email');
select is((select count(*) from events),3::bigint,'normal officer can read events');
select is((select count(*) from positions),6::bigint,'normal officer can read positions');
select is((select count(*) from branches),5::bigint,'normal officer can read branches');
select is((select count(*) from event_types),6::bigint,
  'normal officer can query event types');
select is((select count(*) from officer_branches),1::bigint,'normal officer can read memberships');
select is((select count(*) from point_transactions),2::bigint,'normal officer can read point history');
select is((select total_points from officer_point_totals where id=-403),2::numeric,
  'point totals exclude removed transactions');
select is((select count(*) from dashboard_summary),1::bigint,'normal officer can read dashboard summary');
select is((select count(*) from application_config),1::bigint,'normal officer can read harmless rate configuration');
select is((select count(*) from officer_warnings),1::bigint,
  'normal officer sees only own approved warning');
select is((select count(*) from officer_warnings where id in (-402,-403,-404)),0::bigint,
  'normal officer cannot see pending, rejected, or other warning');
select is((select count(*) from warning_approvals),0::bigint,'normal officer cannot enumerate warning approvals');
select is((select count(*) from audit_logs),0::bigint,'normal officer cannot read System Log');
select throws_ok($$insert into officers(name,utep_email,position_id) values('Attack','attack-officer@example.org',17)$$,
  '42501',null,'normal officer cannot insert officer');
select throws_ok($$update officers set application_role='admin' where id=-403$$,
  '42501',null,'normal officer cannot promote self directly');
select throws_ok($$update officers set auth_user_id=null where id=-403$$,
  '42501',null,'normal officer cannot unlink self directly');
select throws_ok($$update officers set auth_user_id='00000000-0000-4000-8000-000000000403' where id=-401$$,
  '42501',null,'normal officer cannot overwrite admin Auth link');
select throws_ok($$insert into officer_branches(officer_id,branch_id) values(-403,3)$$,
  '42501',null,'normal officer cannot grant own branch membership');
select throws_ok($$delete from officer_branches where officer_id=-402$$,
  '42501',null,'normal officer cannot remove memberships');
select throws_ok($$insert into positions(name) values('Attack Position')$$,
  '42501',null,'normal officer cannot create position');
select throws_ok($$insert into branches(name) values('attack-branch')$$,
  '42501',null,'normal officer cannot create branch');
select throws_ok($$insert into event_types(name) values('Attack Type')$$,
  '42501',null,'normal officer cannot create event type');
select throws_ok($$insert into events(name,event_type_id,starts_at,ends_at) values('Attack',1,'2099-09-20 09:00-06','2099-09-20 10:00-06')$$,
  '42501',null,'normal officer cannot create event directly');
select throws_ok($$update events set status='cancelled' where id=-402$$,
  '42501',null,'normal officer cannot cancel event directly');
select throws_ok($$delete from events where id=-403$$,
  '42501',null,'normal officer cannot delete event directly');
select throws_ok($$insert into event_officers(event_id,officer_id) values(-402,-403)$$,
  '42501',null,'self-signup direct insert is denied in favor of trusted RPC');
select lives_ok($$select change_event_signup(-402,-403,false)$$,
  'normal officer can self-signup through trusted RPC');
select throws_ok($$delete from event_officers where event_id=-402 and officer_id=-403$$,
  '42501',null,'direct self-signout delete is denied');
select throws_ok($$delete from event_officers where event_id=-402 and officer_id=-402$$,
  '42501',null,'normal officer cannot remove another signup directly');
select lives_ok($$select change_event_signup(-402,-403,true)$$,
  'normal officer can self-signout through trusted RPC');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-403,1000000,'Attack','manual')$$,
  '42501',null,'normal officer cannot forge points directly');
select throws_ok($$update point_transactions set points=1000000 where id=-401$$,
  '42501',null,'normal officer cannot change existing points');
select throws_ok($$update point_transactions set removed_at=now() where id=-401$$,
  '42501',null,'normal officer cannot remove award directly');
select throws_ok($$update application_config set participation_points_per_hour=1000000$$,
  '42501',null,'normal officer cannot change rate directly');
select throws_ok($$insert into officer_warnings(officer_id,reason) values(-402,'Attack')$$,
  '42501',null,'normal officer cannot create warning');
select throws_ok($$update warning_approvals set decision='approved' where warning_id=-402$$,
  '42501',null,'normal officer cannot forge warning vote');
select throws_ok($$insert into audit_logs(action,entity_type,entity_id) values('fake','officer','-403')$$,
  '42501',null,'normal officer cannot forge audit entry');

-- Lead: same peer reads, no raw write to acquire another branch or event.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
select is((select count(*) from events),3::bigint,'Lead can read operational events');
select is((select count(*) from officer_warnings),1::bigint,'Lead sees own approved warning only');
select is((select count(*) from audit_logs),0::bigint,'Lead cannot read audit logs');
select throws_ok($$update officers set application_role='admin' where id=-402$$,
  '42501',null,'Lead cannot promote self directly');
select throws_ok($$update officers set name='Attack' where id=-403$$,
  '42501',null,'Lead cannot edit peer officer directly');
select throws_ok($$insert into officer_branches(officer_id,branch_id) values(-402,3)$$,
  '42501',null,'Lead cannot add ICPC branch to self');
select throws_ok($$insert into event_branches(event_id,branch_id) values(-403,1)$$,
  '42501',null,'Lead cannot take over unrelated event by raw branch insert');
select throws_ok($$insert into event_branches(event_id,branch_id) values(-401,1)$$,
  '42501',null,'Lead cannot take over global event by raw branch insert');
select throws_ok($$update events set status='cancelled' where id=-403$$,
  '42501',null,'Lead cannot directly cancel unrelated event');
select throws_ok($$insert into event_officers(event_id,officer_id) values(-403,-403)$$,
  '42501',null,'Lead cannot use raw signup for another officer');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-402,2,'Attack','manual')$$,
  '42501',null,'Lead cannot insert points');
select throws_ok($$update application_config set participation_points_per_hour=2$$,
  '42501',null,'Lead cannot update configuration');
select lives_ok($$select change_event_signup(-402,-403,false)$$,
  'Lead can manage another signup through trusted scoped RPC');
select throws_ok($$select change_event_signup(-403,-403,false)$$,
  'P0001','Cannot manage another officer signup for this event',
  'Lead trusted RPC still rejects unrelated signup management');
select lives_ok($$select cancel_event(-402)$$,'Lead can cancel managed event via trusted RPC');

-- Admin: broad reads and checked RPC writes; raw writes stay denied.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select is((select count(*) from officer_warnings),4::bigint,'admin reads every warning');
select is((select count(*) from warning_approvals),1::bigint,'admin reads approval records');
select is((select count(*) from audit_logs where id=-401),1::bigint,
  'admin reads the fixture System Log record alongside new mutation entries');
select throws_ok($$update officers set application_role='officer' where id=-401$$,
  '42501',null,'admin cannot bypass role-management safeguards with raw update');
select throws_ok($$update officers set auth_user_id=null where id=-403$$,
  '42501',null,'admin cannot directly alter another Auth link');
select throws_ok($$insert into officer_branches(officer_id,branch_id) values(-403,1)$$,
  '42501',null,'admin must edit memberships through officer-save RPC');
select throws_ok($$insert into events(name,event_type_id,starts_at,ends_at) values('Raw admin attack',1,'2099-09-20 09:00-06','2099-09-20 10:00-06')$$,
  '42501',null,'admin must create events through trusted RPC');
select throws_ok($$delete from point_transactions where id=-401$$,
  '42501',null,'admin cannot erase point history directly');
select throws_ok($$delete from audit_logs where id=-401$$,
  '42501',null,'admin cannot delete audit history directly');
select throws_ok($$update application_config set participation_points_per_hour=2$$,
  '42501',null,'admin must wait for trusted configuration operation');
select throws_ok($$delete from officer_warnings where id=-401$$,
  '42501',null,'admin cannot directly delete warnings before trusted workflow exists');
select lives_ok($$select save_officer('RLS created',17,'active',null,null,'rls-created@example.org')$$,
  'admin officer-save RPC still works after raw writes are revoked');
select lives_ok($$select save_event('RLS admin event','',1,'','2099-09-22 09:00-06','2099-09-22 10:00-06',null)$$,
  'admin event-save RPC still creates global events');
select lives_ok($$select add_manual_transaction(-403,1,'RLS admin correction','correction')$$,
  'admin points RPC still works');
select lives_ok($$select set_officer_application_role(-403,'admin')$$,
  'admin role-management RPC still works');
select lives_ok($$select cancel_event(-401)$$,
  'admin cancellation RPC still works on global events');

select * from finish();
rollback;
