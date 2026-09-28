begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('anon',
  'private.write_audit_log(text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated',
    'private.write_audit_log(text,text,text,jsonb)','EXECUTE'),
  'ordinary clients cannot call the private audit writer');
select ok(not has_table_privilege('authenticated','public.audit_logs','INSERT')
  and not has_table_privilege('authenticated','public.audit_logs','UPDATE')
  and not has_table_privilege('authenticated','public.audit_logs','DELETE'),
  'ordinary clients cannot forge or change audit rows directly');

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000000501','audit-admin@example.org',now(),'{}'),
  ('00000000-0000-4000-8000-000000000502','audit-officer@example.org',now(),'{}'),
  ('00000000-0000-4000-8000-000000000503','audit-lead@example.org',now(),'{}'),
  ('00000000-0000-4000-8000-000000000504','audit-admin2@example.org',now(),'{}'),
  ('00000000-0000-4000-8000-000000000505','audit-link@example.org',now(),'{"provider":"google"}');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
  (-501,'Audit Admin','audit-admin@example.org',17,'admin','00000000-0000-4000-8000-000000000501'),
  (-502,'Audit Officer','audit-officer@example.org',17,'officer','00000000-0000-4000-8000-000000000502'),
  (-503,'Audit Lead','audit-lead@example.org',16,'officer','00000000-0000-4000-8000-000000000503'),
  (-504,'Audit Admin Two','audit-admin2@example.org',17,'admin','00000000-0000-4000-8000-000000000504'),
  (-505,'Audit Link','audit-link@example.org',17,'officer',null);
insert into officer_branches(officer_id,branch_id)
  select -503,id from branches where name='intro';
insert into events(id,name,event_type_id,starts_at,ends_at) values
  (-501,'Audit Event',(select id from event_types where name='General'),
    '2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-502,'Audit Global',(select id from event_types where name='General'),
    '2099-09-21 09:00-06','2099-09-21 10:00-06'),
  (-503,'Audit Lead Event',(select id from event_types where name='General'),
    '2099-09-22 09:00-06','2099-09-22 10:00-06');
insert into event_branches(event_id,branch_id)
  select -501,id from branches where name='intro'
  union all select -503,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values (-502,-502);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
set local role authenticated;
select lives_ok($$select save_officer('Audit Created',17,'active',null,null,'audit-created@example.org')$$,
  'officer creation succeeds');
select is((select count(*) from audit_logs where action='officer.created'),1::bigint,
  'officer creation writes one audit row');
select is((select details #>> '{after,name}' from audit_logs where action='officer.created'),
  'Audit Created','creation details retain a useful officer summary');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer edit succeeds');
select is((select details #>> '{before,name}' from audit_logs where action='officer.updated'),
  'Audit Officer','edit records the previous name');
select is((select details #>> '{after,name}' from audit_logs where action='officer.updated'),
  'Audit Officer Edited','edit records the new name');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'repeating the same officer save succeeds');
select is((select count(*) from audit_logs where action='officer.updated'),1::bigint,
  'no-op officer save does not add noise');
select lives_ok($$select save_officer('Audit Officer Edited',17,'inactive',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer deactivation succeeds');
select is((select details ->> 'future_signups_removed' from audit_logs
  where action='officer.deactivated'),'1','deactivation records automatic signup cleanup');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer reactivation succeeds');
select is((select count(*) from audit_logs where action='officer.reactivated'),1::bigint,
  'reactivation has its own audit action');
select lives_ok($$select set_officer_application_role(-502,'admin')$$,
  'admin promotes another officer');
select is((select details ->> 'old_role' from audit_logs where action='officer.role_changed'),
  'officer','role change retains the old role');
select is((select details ->> 'new_role' from audit_logs where action='officer.role_changed'),
  'admin','role change retains the new role');
select lives_ok($$select set_officer_application_role(-502,'admin')$$,
  'repeating a role assignment succeeds');
select is((select count(*) from audit_logs where action='officer.role_changed'),1::bigint,
  'no-op role assignment is not logged');
select lives_ok($$select set_officer_application_role(-502,'officer')$$,
  'admin restores the officer role for the following access tests');

select lives_ok($$select save_event('Audit Created Event','',1,'',
  '2099-09-23 09:00-06','2099-09-23 10:00-06',null)$$,
  'event creation succeeds');
select is((select details #>> '{after,name}' from audit_logs where action='event.created'),
  'Audit Created Event','event creation records its summary');
select lives_ok($$select save_event('Audit Event Edited','',1,'',
  '2099-09-20 09:00-06','2099-09-20 10:00-06',null,-501)$$,
  'event edit succeeds');
select is((select details #>> '{before,name}' from audit_logs where action='event.updated'),
  'Audit Event','event edit records previous name');
select is((select details #>> '{after,name}' from audit_logs where action='event.updated'),
  'Audit Event Edited','event edit records new name');
select is((select details #> '{after,branch_ids}' from audit_logs where action='event.updated'),
  '[]'::jsonb,'event edit records changed branch associations');
select lives_ok($$select save_event('Audit Event Edited','',1,'',
  '2099-09-20 09:00-06','2099-09-20 10:00-06',null,-501)$$,
  'repeating the event save succeeds');
select is((select count(*) from audit_logs where action='event.updated'),1::bigint,
  'no-op event save does not add noise');
select lives_ok($$select cancel_event(-501)$$,'event cancellation succeeds');
select is((select details ->> 'new_status' from audit_logs where action='event.cancelled'),
  'cancelled','cancellation records its state transition');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select lives_ok($$select change_event_signup(-502,-502,false)$$,
  'self-signup succeeds');
select is((select count(*) from event_officers where event_id=-502 and officer_id=-502),1::bigint,
  'self-signup row exists');
select is((select count(*) from audit_logs),0::bigint,
  'normal officer cannot read System Log after signup');
select lives_ok($$select change_event_signup(-502,-502,false)$$,
  'duplicate self-signup is harmless');
select lives_ok($$select change_event_signup(-502,-502,true)$$,
  'self-signout succeeds');
select lives_ok($$select change_event_signup(-502,-502,true)$$,
  'repeated self-signout is harmless');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000503',true);
select lives_ok($$select change_event_signup(-503,-502,false)$$,
  'Lead assigns another officer in branch scope');
select lives_ok($$select change_event_signup(-503,-502,true)$$,
  'Lead removes another officer in branch scope');
select is((select count(*) from audit_logs),0::bigint,
  'Lead cannot read System Log after assigning an officer');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is((select count(*) from audit_logs where action='event.signup'),1::bigint,
  'self-signup is logged exactly once');
select is((select count(*) from audit_logs where action='event.signout'),1::bigint,
  'self-signout is logged exactly once');
select is((select count(*) from audit_logs where action='event.officer_assigned'),1::bigint,
  'manager assignment is distinct from self-signup');
select is((select count(*) from audit_logs where action='event.officer_removed'),1::bigint,
  'manager removal is distinct from self-signout');
select is((select actor_id from audit_logs where action='event.officer_assigned'),
  '00000000-0000-4000-8000-000000000503'::uuid,
  'manager audit actor comes from the authenticated Lead');
select lives_ok($$select add_manual_transaction(-502,5,'Audit manual','manual')$$,
  'manual points succeed');
select lives_ok($$select add_manual_transaction(-502,-2,'Audit correction','correction')$$,
  'correction succeeds');
select is((select count(*) from audit_logs where action='points.manual_created'),1::bigint,
  'manual points have a distinct audit action');
select is((select count(*) from audit_logs where action='points.correction_created'),1::bigint,
  'corrections have a distinct audit action');
select is((select a.actor_id from audit_logs a where action='points.manual_created'),
  (select p.created_by from point_transactions p where reason='Audit manual'),
  'manual transaction and audit row share the real actor');
select is((select details ->> 'points' from audit_logs where action='points.correction_created'),
  '-2','correction details retain the amount');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000505',true);
select is(claim_current_officer_identity(),-505::bigint,
  'first verified login creates the auth link');
select is(claim_current_officer_identity(),-505::bigint,
  'repeated login reuses the existing link');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is((select count(*) from audit_logs where action='officer.auth_linked'),1::bigint,
  'only the first auth link is audited');
select is((select actor_id from audit_logs where action='officer.auth_linked'),
  '00000000-0000-4000-8000-000000000505'::uuid,
  'auth-link audit actor is the linked account');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select throws_ok($$select save_officer('Bad',17,'active',null,null,'bad-audit@example.org')$$,
  'P0001','Admin required','normal officer cannot create an audited officer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is((select count(*) from audit_logs where action='officer.created'),1::bigint,
  'failed officer mutation leaves no success audit entry');
select throws_ok($$select add_manual_transaction(-502,0,'Invalid','manual')$$,
  'P0001','Invalid point value','invalid point mutation is rejected');
select is((select count(*) from audit_logs where action='points.manual_created'),1::bigint,
  'failed point mutation leaves no success audit entry');

-- If the audit insert fails, the business write cannot commit on its own.
reset role;
alter table audit_logs add constraint audit_test_reject_creation
  check (action <> 'officer.created') not valid;
set local role authenticated;
select throws_ok($$select save_officer('Audit rollback',17,'active',null,null,
  'audit-rollback@example.org')$$,'23514',null,
  'audit-write failure rejects the officer mutation');
reset role;
select is((select count(*) from officers where utep_email='audit-rollback@example.org'),
  0::bigint,'audit-write failure rolls back the officer creation');
alter table audit_logs drop constraint audit_test_reject_creation;

-- Future trusted system jobs can omit a human actor without a fake account.
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$select private.write_audit_log('system.fixture','fixture','1',
  '{"source":"test"}'::jsonb)$$,'trusted system write accepts no human actor');
select is((select actor_id from audit_logs where action='system.fixture'),null::uuid,
  'trusted system audit row has a null actor');

-- No business-record FK exists on audit_logs.entity_id: historical context
-- remains after a fixture record is deleted by this privileged test setup.
reset role;
delete from officers where utep_email='audit-created@example.org';
select is((select details #>> '{after,name}' from audit_logs where action='officer.created'),
  'Audit Created','audit snapshot survives later source deletion');
select * from finish();
rollback;
