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
-- One reviewed allowlist catches newly exposed RPCs without a brittle count.
-- Required entry points are checked separately; private processing stays closed.
select ok(not has_function_privilege('authenticated','private.process_finished_events()','EXECUTE')
  and has_function_privilege('authenticated','public.claim_current_officer_identity()','EXECUTE')
  and has_function_privilege('authenticated','public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.create_event_location(text)','EXECUTE')
  and has_function_privilege('authenticated','public.rename_event_location(bigint,text)','EXECUTE')
  and has_function_privilege('authenticated','public.delete_event_location(bigint)','EXECUTE')
  and has_function_privilege('authenticated','public.change_event_signup(bigint,bigint,boolean)','EXECUTE')
  and has_function_privilege('authenticated','public.bulk_add_event_officers(bigint,bigint[])','EXECUTE'),
  'essential checked RPCs remain callable and private processing stays closed');
select ok(not exists(select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and p.oid not in (
      'public.change_event_signup(bigint,bigint,boolean)'::regprocedure,
      'public.bulk_add_event_officers(bigint,bigint[])'::regprocedure,
      'public.save_officer(text,bigint,text,bigint[],bigint,text,text,text)'::regprocedure,
      'public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)'::regprocedure,
      'public.claim_current_officer_identity()'::regprocedure,
      'public.set_officer_application_role(bigint,text)'::regprocedure,
      'public.cancel_event(bigint)'::regprocedure,
      'public.restore_event(bigint)'::regprocedure,
      'public.add_manual_transaction(bigint,numeric,text,text,bigint)'::regprocedure,
      'public.create_position(text)'::regprocedure,
      'public.rename_position(bigint,text)'::regprocedure,
      'public.delete_position(bigint)'::regprocedure,
      'public.create_branch(text)'::regprocedure,
      'public.rename_branch(bigint,text)'::regprocedure,
      'public.delete_branch(bigint)'::regprocedure,
      'public.create_event_type(text)'::regprocedure,
      'public.rename_event_type(bigint,text)'::regprocedure,
      'public.delete_event_type(bigint)'::regprocedure,
      'public.set_participation_rate(numeric)'::regprocedure,
      'public.remove_participation_award(bigint)'::regprocedure,
      'public.create_warning(bigint,text)'::regprocedure,
      'public.decide_warning(bigint,text)'::regprocedure,
      'public.delete_warning(bigint)'::regprocedure,
      'public.remove_event(bigint)'::regprocedure,
      'public.update_point_transaction(bigint,numeric)'::regprocedure,
      'public.remove_point_transaction(bigint)'::regprocedure,
      'public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text)'::regprocedure,
      'public.save_task(text,text,text,bigint,date,numeric,boolean)'::regprocedure,
      'public.assign_task(bigint,bigint)'::regprocedure,
      'public.complete_task(bigint)'::regprocedure,
      'public.approve_task(bigint)'::regprocedure
      ,'public.create_recurring_event(text,text,bigint,text,bigint[],text,text,uuid,text,date[],timestamptz[],timestamptz[])'::regprocedure
      ,'public.create_recurring_task(text,text,text,bigint,numeric,boolean,uuid,text,date[])'::regprocedure
      ,'public.remove_task(bigint)'::regprocedure
      ,'public.mutate_recurring_event(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])'::regprocedure
      ,'public.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])'::regprocedure
      ,'public.create_event_location(text)'::regprocedure
      ,'public.rename_event_location(bigint,text)'::regprocedure
      ,'public.delete_event_location(bigint)'::regprocedure
    )), 'authenticated has no unreviewed public RPC entry point');

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
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
  (-401,'RLS Global','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-402,'RLS Intro','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-403,'RLS ICPC','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06');
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
select throws_ok($$select * from point_transactions$$,'42501',null,'anon cannot read points');
select throws_ok($$select * from dashboard_summary$$,'42501',null,'anon cannot read dashboard view');
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
select is((select count(*) from dashboard_summary),0::bigint,'unlinked user sees no aggregate dashboard row');
select is((select count(*) from officer_warnings),0::bigint,'unlinked user sees no warnings');
select is(claim_current_officer_identity(),null::bigint,
  'unlinked account cannot claim an unrelated officer');
select throws_ok($$select change_event_signup(-402,-403,false)$$,
  'P0001','Unauthorized','unlinked user cannot call signup RPC successfully');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000404',true);
select is((select count(*) from officers),0::bigint,'inactive linked officer sees no officers');
select is((select count(*) from dashboard_summary),0::bigint,'inactive linked officer sees no dashboard row');
select is(claim_current_officer_identity(),null::bigint,
  'inactive account cannot reclaim application access');

-- Normal officer: peer reads work, but every direct mutation path is shut.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000403',true);
select is((select count(*) from officers),4::bigint,'normal officer can read peer directory including inactive history');
select is((select utep_email from officers where id=-401),'rls-admin@example.org',
  'approved officer can read permitted peer contact email');
select is((select count(*) from point_transactions),2::bigint,'normal officer can read point history');
select is((select total_points from officer_point_totals where id=-403),2::numeric,
  'point totals exclude removed transactions');
select is((select count(*) from dashboard_summary),1::bigint,'normal officer can read dashboard summary');
select is((select count(*) from officer_warnings),1::bigint,
  'normal officer sees only own approved warning');
select is((select count(*) from officer_warnings where id in (-402,-403,-404)),0::bigint,
  'normal officer cannot see pending, rejected, or other warning');
select is((select count(*) from warning_approvals),0::bigint,'normal officer cannot enumerate warning approvals');
select is((select count(*) from audit_logs),0::bigint,'normal officer cannot read System Log');
select throws_ok($$insert into officers(name,utep_email,position_id) values('Attack','attack-officer@example.org',17)$$,
  '42501',null,'normal officer cannot insert officer');
select throws_ok($$insert into events(name,description,location,event_type_id,starts_at,ends_at) values('Attack','Test event','TBA',1,'2099-09-20 09:00-06','2099-09-20 10:00-06')$$,
  '42501',null,'normal officer cannot create event directly');
select throws_ok($$insert into event_officers(event_id,officer_id) values(-402,-403)$$,
  '42501',null,'self-signup direct insert is denied in favor of trusted RPC');
select lives_ok($$select change_event_signup(-402,-403,false)$$,
  'normal officer can self-signup through trusted RPC');
select lives_ok($$select change_event_signup(-402,-403,true)$$,
  'normal officer can self-signout through trusted RPC');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-403,1000000,'Attack','manual')$$,
  '42501',null,'normal officer cannot forge points directly');
select throws_ok($$insert into officer_warnings(officer_id,reason) values(-402,'Attack')$$,
  '42501',null,'normal officer cannot create warning');
select throws_ok($$insert into audit_logs(action,entity_type,entity_id) values('fake','officer','-403')$$,
  '42501',null,'normal officer cannot forge audit entry');

-- Lead: same peer reads, no raw write to acquire another branch or event.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
select is((select count(*) from events),3::bigint,'Lead can read operational events');
select is((select count(*) from officer_warnings),1::bigint,'Lead sees own approved warning only');
select is((select count(*) from audit_logs),0::bigint,'Lead cannot read audit logs');
select throws_ok($$insert into event_branches(event_id,branch_id) values(-403,1)$$,
  '42501',null,'Lead cannot take over unrelated event by raw branch insert');
select lives_ok($$select change_event_signup(-402,-403,false)$$,
  'Lead can manage another signup through trusted scoped RPC');
select throws_ok($$select change_event_signup(-403,-403,false)$$,
  'P0001','Cannot manage another officer signup for this event',
  'Lead trusted RPC still rejects unrelated signup management');
select lives_ok($$select cancel_event(-402)$$,'Lead can cancel managed event via trusted RPC');

-- Admin: broad reads and checked RPC writes; raw writes stay denied.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select is((select count(*) from officer_warnings),4::bigint,'admin reads every warning');
select is((select count(*) from audit_logs where id=-401),1::bigint,
  'admin reads the fixture System Log record alongside new mutation entries');
select throws_ok($$update officers set application_role='officer' where id=-401$$,
  '42501',null,'admin cannot bypass role-management safeguards with raw update');
select throws_ok($$delete from point_transactions where id=-401$$,
  '42501',null,'admin cannot erase point history directly');
select throws_ok($$delete from audit_logs where id=-401$$,
  '42501',null,'admin cannot delete audit history directly');
select lives_ok($$select save_officer('RLS created',17,'active',null,null,'rls-created@example.org')$$,
  'admin officer-save RPC still works after raw writes are revoked');
select lives_ok($$select save_event('RLS admin event','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22 09:00-06','2099-09-22 10:00-06',null)$$,
  'admin event-save RPC still creates global events');
select lives_ok($$select add_manual_transaction(-403,1,'RLS admin correction','correction')$$,
  'admin points RPC still works');
select lives_ok($$select set_officer_application_role(-403,'admin')$$,
  'admin role-management RPC still works');
select lives_ok($$select cancel_event(-401)$$,
  'admin cancellation RPC still works on global events');

select * from finish();
rollback;
