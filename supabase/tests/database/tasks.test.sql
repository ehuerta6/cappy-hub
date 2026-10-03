begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000971','tasks-admin@example.org'),
 ('00000000-0000-4000-8000-000000000972','tasks-intro@example.org'),
 ('00000000-0000-4000-8000-000000000973','tasks-officer@example.org'),
 ('00000000-0000-4000-8000-000000000974','tasks-president@example.org'),
 ('00000000-0000-4000-8000-000000000975','tasks-inactive@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-971,'Tasks Admin','tasks-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000000971'),
 (-972,'Tasks Intro Lead','tasks-intro@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000000972'),
 (-973,'Tasks Officer','tasks-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000000973'),
 (-974,'Tasks President','tasks-president@example.org',(select id from positions where name='President'),'active','officer','00000000-0000-4000-8000-000000000974'),
 (-975,'Tasks Inactive','tasks-inactive@example.org',(select id from positions where name='Officer'),'inactive','officer','00000000-0000-4000-8000-000000000975');
insert into officer_branches(officer_id,branch_id)
 select -972,id from branches where name='intro';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select throws_ok($$insert into tasks(title,description,task_type,branch_id,due_date,points,created_by)
 values('Raw','Forbidden','Flyer',(select id from branches where name='intro'),'2099-09-20',5,-973)$$,
 '42501',null,'raw Task insertion is denied by database privileges');
select throws_ok($$select save_task('Nope','Description','Flyer',
 (select id from branches where name='intro'),'2099-09-20',5,false)$$,
 'P0001','Task outside branch scope','ordinary officer cannot create task');
select throws_ok($$select save_event_with_links('Nope','Description',
 (select id from event_types where name='Meeting'),'TBA','2099-09-20',
 '2099-09-20 09:00-06','2099-09-20 10:00-06',
 array[(select id from branches where name='intro')]::bigint[])$$,
 'P0001','Event outside branch scope','ordinary officer cannot create event');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select save_event_with_links('Mixed','Description',
 (select id from event_types where name='Meeting'),'TBA','2099-09-20',
 '2099-09-20 09:00-06','2099-09-20 10:00-06',
 array[(select id from branches where name='intro'),(select id from branches where name='icpc')]::bigint[])$$,
 'Lead can create multi-branch Event with one matching branch');
select throws_ok($$select save_task('Wrong','Description','Flyer',
 (select id from branches where name='icpc'),'2099-09-20',5,false)$$,
 'P0001','Task outside branch scope','Lead cannot create another branch task');
select lives_ok($$select save_task('Flyer','Make a flyer','Flyer',
 (select id from branches where name='intro'),'2099-09-20',5,false)$$,
 'Intro Lead creates task');
select lives_ok($$select save_task('Story','Make a story','Story',
 (select id from branches where name='intro'),'2099-09-20',3,true)$$,
 'Lead configures approval-required task');
reset role;
select set_config('test.flyer_id',(select id::text from tasks where title='Flyer'),true);
select set_config('test.story_id',(select id::text from tasks where title='Story'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select lives_ok(format('select assign_task(%s,-973)',current_setting('test.flyer_id')),
 'officer self-assigns task');
select throws_ok(format('select assign_task(%s,-971)',current_setting('test.story_id')),
 'P0001','Cannot assign another officer','officer cannot assign peer');
select lives_ok(format('select complete_task(%s)',current_setting('test.flyer_id')),
 'assignee completes task');
select is((select count(*) from point_transactions where task_id=current_setting('test.flyer_id')::bigint),
 1::bigint,'completion immediately awards points when approval is off');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok(format('select assign_task(%s,-973)',current_setting('test.story_id')),
 'Lead assigns task to officer');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select lives_ok(format('select complete_task(%s)',current_setting('test.story_id')),
 'assignee completes approval-required task');
select is((select count(*) from point_transactions where task_id=current_setting('test.story_id')::bigint),
 0::bigint,'approval-required completion does not award early');
select throws_ok(format('select approve_task(%s)',current_setting('test.story_id')),
 'P0001','Task outside branch scope','officer cannot approve');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok(format('select approve_task(%s)',current_setting('test.story_id')),
 'Lead approves task');
select is((select points from point_transactions where task_id=current_setting('test.story_id')::bigint),
 3::numeric,'approval awards configured points');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000975',true);
set local role authenticated;
select throws_ok(format('select assign_task(%s,-975)',current_setting('test.story_id')),
 'P0001','Unauthorized','inactive officer cannot assign');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000974',true);
set local role authenticated;
select lives_ok($$select save_event_with_links('President ICPC','Description',
 (select id from event_types where name='Workshop'),'TBA','2099-09-20',
 '2099-09-20 09:00-06','2099-09-20 10:00-06',
 array[(select id from branches where name='icpc')]::bigint[])$$,
 'President can create any branch event');
reset role;
select * from finish();
rollback;
