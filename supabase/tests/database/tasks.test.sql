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
select set_config('test.denver_today',
  (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date::text,true);

select ok(to_regclass('public.task_assignments') is null,
 'Task assignment reads and writes have no legacy projection table');
select ok(to_regprocedure('private.sync_legacy_task_assignment(bigint)') is null
  and to_regprocedure('private.sync_legacy_task_assignment_write()') is null
  and not exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='public.task_officer_assignments'::regclass and not tgisinternal
      and tgname='task_assignments_sync_officer_assignments'),
 'legacy projection synchronization objects are absent');

insert into tasks
  (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,removed_at,removed_by)
values
 (-9710,'Self assignment','Task for self-assignment','Flyer',(select id from branches where name='intro'),current_setting('test.denver_today')::date,5,false,-972,null,null),
 (-9711,'Due today','Must wait for Denver date rollover','Post',(select id from branches where name='intro'),current_setting('test.denver_today')::date,5,false,-972,null,null),
 (-9712,'Past Task','Due-date award and reversal','Airtable',(select id from branches where name='intro'),current_setting('test.denver_today')::date-1,5,false,-972,null,null),
 (-9713,'Editable Task','Standalone edit and assignment removal','LinkedIn',(select id from branches where name='intro'),current_setting('test.denver_today')::date+5,3,false,-972,null,null),
 (-9714,'Removed past Task','Processor must skip removed Tasks','Flyer',(select id from branches where name='intro'),current_setting('test.denver_today')::date-2,5,false,-972,now(),-972),
 (-9715,'Legacy Task','Old deployed completion and approval RPCs','Story',(select id from branches where name='intro'),current_setting('test.denver_today')::date-1,2.5,true,-972,null,null),
 (-9716,'Processor Task','Completed assignment for scheduled processing','Airtable',(select id from branches where name='intro'),current_setting('test.denver_today')::date-1,6,false,-972,null,null),
 (-9717,'Removable Task','Eligible standalone removal','Flyer',(select id from branches where name='intro'),current_setting('test.denver_today')::date+4,2,false,-972,null,null),
 (-9718,'Historical Task','Preserved approval and point history','Story',(select id from branches where name='intro'),current_setting('test.denver_today')::date-3,2.5,true,-972,null,null);
insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
values
 (-9714,-973,-972,now()-interval '2 days'),
 (-9716,-973,-972,now()-interval '2 days'),
 (-9716,-974,-972,null);
-- Seed representative historical approval and award rows as existing data.
insert into task_officer_assignments(task_id,officer_id,assigned_by,assigned_at,completed_at,approved_at,approved_by)
values(-9718,-973,-972,now()-interval '5 days',now()-interval '4 days',now()-interval '3 days',-972);
insert into point_transactions(officer_id,task_id,points,reason,award_type,created_by)
values(-973,-9718,2.5,'Historical Task award','task','00000000-0000-4000-8000-000000000972');

select ok(to_regprocedure('public.assign_task(bigint,bigint)') is null
  and to_regprocedure('private.assign_task(bigint,bigint)') is null
  and to_regprocedure('public.complete_task(bigint)') is null
  and to_regprocedure('private.complete_task(bigint)') is null
  and to_regprocedure('public.approve_task(bigint)') is null
  and to_regprocedure('private.approve_task(bigint)') is null
  and to_regprocedure('private.award_task(bigint)') is null
  and to_regprocedure('public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)') is null
  and to_regprocedure('private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)') is null,
  'retired Task and Event compatibility RPCs and unused helpers are removed');

select ok(not has_function_privilege('anon','private.process_due_tasks()','EXECUTE')
  and not has_function_privilege('authenticated','private.process_due_tasks()','EXECUTE')
  and has_function_privilege('postgres','private.process_due_tasks()','EXECUTE'),
  'scheduled Task processor is private to trusted database execution');
select is((select count(*) from cron.job where jobname='cappy-process-due-tasks'),1::bigint,
  'one stable due Task cron job is installed');
select is((select schedule from cron.job where jobname='cappy-process-due-tasks'),'* * * * *'::text,
  'Task processor runs once per minute');
select is(private.task_award_due(current_setting('test.denver_today')::date,current_setting('test.denver_today')::date),false,
  'a Task due today has not passed in America/Denver');
select is(private.task_award_due(current_setting('test.denver_today')::date-1,current_setting('test.denver_today')::date),true,
  'a Task due yesterday has passed in America/Denver');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select throws_ok($$insert into tasks(title,description,task_type,branch_id,due_date,points,created_by)
 values('Raw','Forbidden','Flyer',(select id from branches where name='intro'),current_date,5,-973)$$,
 '42501',null,'raw Task insertion remains denied by database privileges');
select throws_ok($$select save_task('Nope','Description','Flyer',
 (select id from branches where name='intro'),current_date,5,false)$$,
 'P0001','Task outside branch scope','ordinary Officer cannot create Tasks');
select throws_ok($$select self_assign_task(-9714)$$,
 'P0001','Task has been removed','removed Task cannot be self-assigned');
select lives_ok($$select self_assign_task(-9710)$$,
 'active Officer self-assigns an available Task');
select lives_ok($$select self_assign_task(-9710)$$,
 'self-assignment retry does not create a duplicate');
select is((select count(*) from task_officer_assignments where task_id=-9710),1::bigint,
 'self-assignment creates only the current Officer row');
select is((select completed_at from task_officer_assignments where task_id=-9710 and officer_id=-973),null::timestamptz,
 'new self-assignment starts Not completed');
select throws_ok($$select bulk_assign_task_officers(-9710,array[-974]::bigint[])$$,
 'P0001','Task outside branch scope','ordinary Officer cannot bulk-assign');
select throws_ok($$select set_task_assignment_completion(-9710,-973,true)$$,
 'P0001','Task outside branch scope','ordinary Officer cannot change completion');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select bulk_assign_task_officers(-9711,array[-973,-971]::bigint[])$$,
 'branch Lead bulk-assigns multiple active Officers');
select is((select count(*) from task_officer_assignments where task_id=-9711),2::bigint,
 'different Officers can share one Task');
select is((select count(*) from task_officer_assignments where task_id=-9711 and completed_at is not null),0::bigint,
 'bulk-added assignments start Not completed');
select is(jsonb_array_length(bulk_assign_task_officers(-9711,array[-973,-971]::bigint[])->'added_officer_ids'),0,
 'repeat bulk add reports existing assignments without duplicating them');
select throws_ok($$select bulk_assign_task_officers(-9711,array[-973,-975]::bigint[])$$,
 'P0001','Every selected officer must be active','bulk add rejects any inactive Officer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
select throws_ok($$select remove_task_assignment(-9711,-973)$$,
 'P0001','Task outside branch scope','ordinary Officer cannot remove an assignment');
select throws_ok($$select set_task_assignment_completion(-9711,-971,true)$$,
 'P0001','Task outside branch scope','ordinary Officer cannot change another assignment completion');
reset role;
select throws_ok($$insert into task_officer_assignments(task_id,officer_id,assigned_by)
 values(-9711,-973,-972)$$,
 '23505',null,'Task and Officer pair uniqueness is enforced by the database');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select set_task_assignment_completion(-9711,-973,true)$$,
 'manager can mark an assigned Officer completed before due date');
select is((select count(*) from point_transactions where task_id=-9711 and award_type='task'),0::bigint,
 'completion before the due date creates no award');
select is((select completed_at from task_officer_assignments where task_id=-9711 and officer_id=-971),null::timestamptz,
 'one Officer completion does not change another Officer state');
select throws_ok($$select remove_task_assignment(-9711,-973)$$,
 'P0001','Completed or awarded Task assignments cannot be removed','completed assignment cannot be removed');
select throws_ok($$select remove_task(-9711)$$,
 'P0001','Completed or awarded Tasks cannot be removed','completed standalone Task cannot be removed');
select lives_ok($$select set_task_assignment_completion(-9711,-973,false)$$,
 'manager can correct an unawarded completion to Not completed');
select lives_ok($$select set_task_assignment_completion(-9711,-973,true)$$,
 'manager can mark the assignment completed again');
select is((select count(*) from point_transactions where task_id=-9711 and award_type='task'),0::bigint,
 'same-day repeated completion remains unawarded');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select bulk_assign_task_officers(-9712,array[-973,-974]::bigint[])$$,
 'past Task accepts separate Officer assignments');
select lives_ok($$select set_task_assignment_completion(-9712,-973,true)$$,
 'manager completion after the due date immediately awards points');
select is((select points from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),5::numeric,
 'late completion receives the configured Task points');
select is((select count(*) from point_transactions where task_id=-9712 and officer_id=-974 and award_type='task'),0::bigint,
 'Not completed assignment receives no Task points');
select lives_ok($$select set_task_assignment_completion(-9712,-974,true)$$,
 'second Officer can independently complete the same past Task');
select is((select count(*) from point_transactions where task_id=-9712 and award_type='task' and removed_at is null),2::bigint,
 'each completed Officer receives an independent award');
select set_config('test.original_award_id',(select id::text from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),true);
select lives_ok($$select set_task_assignment_completion(-9712,-973,false)$$,
 'manager can reverse a completed assignment after due date');
select is((select count(*) from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),1::bigint,
 'completion reversal keeps the historical Task transaction');
select isnt((select removed_at from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),null::timestamptz,
 'completion reversal logically removes the Task award');
select is((select removed_by from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),
 '00000000-0000-4000-8000-000000000972'::uuid,'logical removal records the acting manager');
select lives_ok($$select set_task_assignment_completion(-9712,-973,true)$$,
 're-completion reactivates the historical award');
select is((select count(*) from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),1::bigint,
 're-completion does not duplicate Task awards');
select is((select id from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),
 current_setting('test.original_award_id')::bigint,'re-completion reuses the same transaction identity');
select is((select removed_at from point_transactions where task_id=-9712 and officer_id=-973 and award_type='task'),null::timestamptz,
 'reactivated Task award is active');
select throws_ok($$select update_task_details(-9712,'Past Task','Changed title','Airtable',
 (select id from branches where name='intro'),current_setting('test.denver_today')::date-1,9)$$,
 'P0001','Completed or awarded Task point settings cannot be edited','Task points cannot rewrite award history');
select lives_ok($$select update_task_details(-9712,'Past Task','Changed title','Airtable',
 (select id from branches where name='intro'),current_setting('test.denver_today')::date-1,5)$$,
 'other Task details may change without recalculating existing points');
select throws_ok($$select update_task_details(-9712,'Past Task','Changed title','Airtable',
 (select id from branches where name='intro'),current_setting('test.denver_today')::date+5,5)$$,
 'P0001','Completed or awarded Task due dates cannot be edited','awarded standalone Task due date cannot move ahead of its history');
select is((select due_date from tasks where id=-9712),current_setting('test.denver_today')::date-1,
 'rejected standalone due-date edit leaves Task date unchanged');
reset role;

-- Simulate completion already present before the scheduled processor runs.
select private.process_due_tasks();
select is((select count(*) from point_transactions where task_id=-9716 and award_type='task' and removed_at is null),1::bigint,
 'scheduled processor awards a past completed assignment');
select is((select count(*) from point_transactions where task_id=-9716 and officer_id=-974 and award_type='task'),0::bigint,
 'scheduled processor does not award a Not completed Officer');
select is((select count(*) from point_transactions where task_id=-9714 and award_type='task'),0::bigint,
 'scheduled processor ignores logically removed Tasks');
select private.process_due_tasks();
select is((select count(*) from point_transactions where task_id=-9716 and officer_id=-973 and award_type='task'),1::bigint,
 'repeated scheduled processing is duplicate-safe');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select bulk_assign_task_officers(-9713,array[-973,-974]::bigint[])$$,
 'standalone Task manager can prepare assignment removal');
select lives_ok($$select update_task_details(-9713,'Edited Task','Edited description','LinkedIn',
 (select id from branches where name='intro'),current_setting('test.denver_today')::date+5,4)$$,
 'manager can edit standalone Task details before protected history');
select is((select title from tasks where id=-9713),'Edited Task','standalone Task edit saves details');
select lives_ok($$select remove_task_assignment(-9713,-973)$$,
 'manager can remove an uncompleted and unawarded assignment');
select is((select count(*) from task_officer_assignments where task_id=-9713 and officer_id=-973),0::bigint,
 'assignment removal affects only the selected Officer');
select is((select count(*) from task_officer_assignments where task_id=-9713 and officer_id=-974),1::bigint,
 'assignment removal preserves another Officer');
select lives_ok($$select remove_task_assignment(-9713,-974)$$,
 'remaining uncompleted assignment can be removed');
select lives_ok($$select remove_task(-9713)$$,
 'eligible standalone Task is logically removable');
select isnt((select removed_at from tasks where id=-9713),null::timestamptz,
 'standalone removal stores a timestamp');
select is((select removed_by from tasks where id=-9713),-972::bigint,
 'standalone removal stores the acting manager');
select lives_ok($$select remove_task(-9717)$$,
 'unassigned standalone Task is logically removable');
reset role;
select is((select count(*) from audit_logs where entity_type='task' and entity_id='-9713' and action='task.removed'),1::bigint,
 'standalone removal is audited once');

-- Current bulk assignment uses the canonical relation without a projection.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',true);
set local role authenticated;
select lives_ok($$select bulk_assign_task_officers(-9715,array[-973]::bigint[])$$,
 'manager assigns the approval-required Task through the supported bulk RPC');
reset role;
select is((select count(*) from task_officer_assignments where task_id=-9715 and officer_id=-973),1::bigint,
 'supported bulk assignment writes to the canonical relation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select is((select completed_at from task_officer_assignments where task_id=-9715 and officer_id=-973),null::timestamptz,
 'assignment remains Not completed before manager completion');
select is((select count(*) from point_transactions where task_id=-9715 and award_type='task'),0::bigint,
 'unfinished Task has no Task point award');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000973',true);
set local role authenticated;
select is((select approved_at is not null and approved_by=-972
  from task_officer_assignments where task_id=-9718 and officer_id=-973),true,
 'Officer can still read historical Task approval values');
select is((select count(*) from point_history where task_id=-9718 and officer_id=-973
  and award_type='task' and points=2.5 and reason='Historical Task award'),1::bigint,
 'Officer can still read historical Task point history');
reset role;

select * from finish();
rollback;
