begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();


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
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
  (-501,'Audit Event','Test event','TBA',(select id from event_types where name='Meeting'),
    '2099-09-20 09:00-06','2099-09-20 10:00-06'),
  (-502,'Audit Global','Test event','TBA',(select id from event_types where name='Meeting'),
    '2099-09-21 09:00-06','2099-09-21 10:00-06'),
  (-503,'Audit Lead Event','Test event','TBA',(select id from event_types where name='Meeting'),
    '2099-09-22 09:00-06','2099-09-22 10:00-06');
insert into event_branches(event_id,branch_id)
  select -501,id from branches where name='intro'
  union all select -503,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values (-502,-502);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
set local role authenticated;
select lives_ok($$select save_officer('Audit Created',17,'active',null,null,'audit-created@example.org')$$,
  'officer creation succeeds');
select is((select details #>> '{after,name}' from audit_logs where action='officer.created'),
  'Audit Created','creation details retain a useful officer summary');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer edit succeeds');
select is((select details #>> '{before,name}' from audit_logs where action='officer.updated'),
  'Audit Officer','edit records the previous name');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'repeating the same officer save succeeds');
select is((select count(*) from audit_logs where action='officer.updated'),1::bigint,
  'no-op officer save does not add noise');
select lives_ok($$select save_officer('Audit Officer Edited',17,'inactive',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer deactivation succeeds');
select lives_ok($$select save_officer('Audit Officer Edited',17,'active',
  array[(select id from branches where name='intro')],-502,'audit-officer@example.org')$$,
  'officer reactivation succeeds');
select lives_ok($$select set_officer_application_role(-502,'admin')$$,
  'admin promotes another officer');
select is((select details ->> 'new_role' from audit_logs where action='officer.role_changed'),
  'admin','role change retains the new role');
select lives_ok($$select set_officer_application_role(-502,'admin')$$,
  'repeating a role assignment succeeds');
select is((select count(*) from audit_logs where action='officer.role_changed'),1::bigint,
  'no-op role assignment is not logged');
select lives_ok($$select set_officer_application_role(-502,'officer')$$,
  'admin restores the officer role for the following access tests');

select lives_ok($$select save_event('Audit Created Event','Test event',(select id from event_types where name='Meeting'),'TBA',
  '2099-09-23 09:00-06','2099-09-23 10:00-06',null)$$,
  'event creation succeeds');
select lives_ok($$select save_event('Audit Event Edited','Test event',(select id from event_types where name='Meeting'),'TBA',
  '2099-09-20 09:00-06','2099-09-20 10:00-06',null,-501)$$,
  'event edit succeeds');
select is((select details #>> '{before,name}' from audit_logs where action='event.updated'),
  'Audit Event','event edit records previous name');
select lives_ok($$select save_event('Audit Event Edited','Test event',(select id from event_types where name='Meeting'),'TBA',
  '2099-09-20 09:00-06','2099-09-20 10:00-06',null,-501)$$,
  'repeating the event save succeeds');
select is((select count(*) from audit_logs where action='event.updated'),1::bigint,
  'no-op event save does not add noise');
select lives_ok($$select cancel_event(-501)$$,'event cancellation succeeds');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select lives_ok($$select change_event_signup(-502,-502,false)$$,
  'self-signup succeeds');
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

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is((select count(*) from audit_logs where action='event.signup'),1::bigint,
  'self-signup is logged exactly once');
select is((select count(*) from audit_logs where action='event.officer_assigned'),1::bigint,
  'manager assignment is distinct from self-signup');
select lives_ok($$select add_manual_transaction(-502,5,'Audit manual','manual')$$,
  'manual points succeed');
select lives_ok($$select add_manual_transaction(-502,-2,'Audit correction','correction')$$,
  'correction succeeds');
select is((select count(*) from audit_logs where action='points.manual_created'),1::bigint,
  'manual points have a distinct audit action');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000505',true);
select is(claim_current_officer_identity(),-505::bigint,
  'first verified login creates the auth link');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is((select count(*) from audit_logs where action='officer.auth_linked'),1::bigint,
  'only the first auth link is audited');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select throws_ok($$select add_manual_transaction(-502,0,'Invalid','manual')$$,
  'P0001','Invalid point value','invalid point mutation is rejected');

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

-- No business-record FK exists on audit_logs.entity_id: historical context
-- remains after a fixture record is deleted by this privileged test setup.
reset role;
delete from officers where utep_email='audit-created@example.org';
select is((select details #>> '{after,name}' from audit_logs where action='officer.created'),
  'Audit Created','audit snapshot survives later source deletion');
select * from finish();
rollback;
