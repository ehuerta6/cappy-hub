begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000033101','task-correction-admin@example.test'),
 ('00000000-0000-4000-8000-000000033102','task-correction-lead@example.test'),
 ('00000000-0000-4000-8000-000000033103','task-correction-officer@example.test'),
 ('00000000-0000-4000-8000-000000033104','task-correction-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-33101,'Correction Admin','task-correction-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000033101'),
 (-33102,'Correction Lead','task-correction-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000033102'),
 (-33103,'Correction Officer','task-correction-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000033103'),
 (-33104,'Inactive Admin','task-correction-inactive@example.test',(select id from positions where name='Officer'),'inactive','admin','00000000-0000-4000-8000-000000033104');
insert into officer_branches select -33102,id from branches where name='intro';
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
 values(-33101,'Historical correction','Synthetic','Flyer',(select id from branches where name='intro'),
 (statement_timestamp() at time zone 'America/Denver')::date-2,3,-33101);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
set local role authenticated;
select lives_ok($$select bulk_assign_task_officers(-33101,array[-33101,-33103]::bigint[])$$,'scoped Lead assigns Officers');
select set_task_assignment_completion(-33101,-33101,true);
select set_task_assignment_completion(-33101,-33103,true);
reset role;
create temp table original_assignments as select * from task_officer_assignments where task_id=-33101;
create temp table original_awards as select * from point_transactions where task_id=-33101;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
set local role authenticated;
select lives_ok($$select update_task_details(-33101,'Corrected history','Corrected description','Post',
 (select id from branches where name='intro'),(statement_timestamp() at time zone 'America/Denver')::date-2,7.5)$$,
 'Lead corrects completed title, type, description and fixed Points');
select is((select count(*) from point_transactions where task_id=-33101 and points=7.5 and removed_at is null),2::bigint,
 'all eligible assignments reflect corrected fixed value');
select lives_ok($$select update_task_details(-33101,'Corrected history','Corrected description','Post',
 (select id from branches where name='intro'),(statement_timestamp() at time zone 'America/Denver')::date+2,7.5)$$,
 'Lead moves completed Task due date into future');
select is((select count(*) from point_transactions where task_id=-33101 and removed_at is null),0::bigint,
 'no active credit before corrected Denver due date passes');
reset role;
select is((select count(*) from point_transactions where task_id=-33101 and task_reconciliation_suspended),2::bigint,
 'source correction records mechanical suspension without pretending Admin intent');
select private.process_due_tasks();
select is((select count(*) from point_transactions where task_id=-33101 and removed_at is null),0::bigint,
 'processor retry before due date cannot restore premature credit');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
set local role authenticated;
select update_task_details(-33101,'Corrected history','Corrected description','Post',
 (select id from branches where name='intro'),(statement_timestamp() at time zone 'America/Denver')::date-1,7.5);
select is((select count(*) from point_transactions where task_id=-33101 and removed_at is null),2::bigint,
 'moving due date back reconciles eligible credit immediately');
select lives_ok($$select remove_task_assignment(-33101,-33103)$$,'completed and awarded assignment can be corrected');
select is((select count(*) from task_officer_assignments where task_id=-33101),1::bigint,
 'removed assignment is absent from current roster via RLS');
select is((select count(*) from point_transactions where task_id=-33101 and officer_id=-33103 and removed_at is null),0::bigint,
 'assignment removal suspends only affected Officer award');
select is((select points from point_transactions where task_id=-33101 and officer_id=-33101 and removed_at is null),7.5::numeric,
 'independent Officer award remains active');
select lives_ok($$select remove_task_assignment(-33101,-33103)$$,'assignment removal retry is idempotent');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033103',true);
select throws_ok($$select self_assign_task(-33101)$$,'P0001','A manager must restore a completed Task assignment',
 'ordinary self-assignment cannot restore a manager-removed completed award');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
select lives_ok($$select bulk_assign_task_officers(-33101,array[-33103]::bigint[])$$,'explicit re-add restores preserved completed assignment');
select isnt((select completed_at from task_officer_assignments where task_id=-33101 and officer_id=-33103),null::timestamptz,
 'restored assignment exposes retained completion');
reset role;
select results_eq($$select officer_id,assigned_at,assigned_by,completed_at,approved_at,approved_by from task_officer_assignments where task_id=-33101 order by officer_id$$,
 $$select officer_id,assigned_at,assigned_by,completed_at,approved_at,approved_by from original_assignments order by officer_id$$,
 'assignment remove/re-add preserves every original completion and approval field');
select results_eq($$select id,officer_id,created_at,created_by from point_transactions where task_id=-33101 order by id$$,
 $$select id,officer_id,created_at,created_by from original_awards order by id$$,
 'corrections reuse transaction identity and original attribution');
select is((select count(*) from audit_logs where entity_id='-33101' and action='task.updated' and actor_officer_id=-33102
 and details ? 'before' and details ? 'after'),3::bigint,'historical Task edits record attributed before/after audit');
select is((select count(*) from audit_logs where action='points.task_updated' and details->>'task_id'='-33101'
 and details ? 'before' and details ? 'after'),2::bigint,'fixed value changes preserve prior amounts in audit');
select is((select count(*) from audit_logs where action='task.officer_removed' and entity_id='-33101'),1::bigint,
 'repeated assignment removal does not duplicate audit');
-- Explicit Admin suppression and edited historical amounts remain meaningful.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033101',true);
set local role authenticated;
select remove_point_transaction((select id from point_transactions where task_id=-33101 and officer_id=-33103));
select update_point_transaction((select id from point_transactions where task_id=-33101 and officer_id=-33101),11);
reset role;
select private.process_due_tasks();
select is((select points from point_transactions where task_id=-33101 and officer_id=-33101),11::numeric,
 'routine processing preserves independently edited amount without deciding editing policy');
select isnt((select removed_at from point_transactions where task_id=-33101 and officer_id=-33103),null::timestamptz,
 'routine processing preserves independent Admin removal');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
set local role authenticated;
select update_task_details(-33101,'Corrected history','Descriptive change only','Post',
 (select id from branches where name='intro'),(statement_timestamp() at time zone 'America/Denver')::date-1,7.5);
select is((select points from point_transactions where task_id=-33101 and officer_id=-33101),11::numeric,
 'descriptive edit does not overwrite historical direct amount edit');
select set_task_assignment_completion(-33101,-33101,false);
select set_task_assignment_completion(-33101,-33101,true);
select is((select points from point_transactions where task_id=-33101 and officer_id=-33101),11::numeric,
 'completion correction preserves edited amount through mechanical suspension');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033103',true);
select throws_ok($$select update_task_details(-33101,'Unauthorized','Synthetic','Flyer',
 (select id from branches where name='intro'),current_date,3)$$,'P0001','Task outside branch scope','ordinary Officer cannot correct Task');
select throws_ok($$select remove_task_assignment(-33101,-33101)$$,'P0001','Task outside branch scope','ordinary Officer cannot remove completed assignment');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033104',true);
select throws_ok($$select remove_task_assignment(-33101,-33101)$$,'P0001','Unauthorized','inactive Admin cannot correct assignment');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
select throws_ok($$select update_task_details(-33101,'Out of scope','Synthetic','Flyer',
 (select id from branches where name<>'intro' limit 1),current_date,3)$$,'P0001','Task outside branch scope','Lead cannot move corrected Task outside scope');
select throws_ok($$update task_officer_assignments set removed_at=null where task_id=-33101$$,'42501',null,'direct assignment writes remain denied');
reset role;
-- An intentional Admin removal during suspension takes precedence over recovery.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
select set_task_assignment_completion(-33101,-33101,false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033101',true);
select is(remove_point_transaction((select id from point_transactions where task_id=-33101 and officer_id=-33101)),true,
 'Admin explicitly suppresses a mechanically suspended award');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
select set_task_assignment_completion(-33101,-33101,true);
select isnt((select removed_at from point_transactions where task_id=-33101 and officer_id=-33101),null::timestamptz,
 're-completion cannot undo explicit Admin suppression during suspension');
-- Prepare a distinct active award for the rollback probe, without changing suppression.
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
 values(-33102,'Rollback Task','Synthetic','Flyer',(select id from branches where name='intro'),
 (statement_timestamp() at time zone 'America/Denver')::date-2,7.5,-33101);
select bulk_assign_task_officers(-33102,array[-33102]::bigint[]);
select set_task_assignment_completion(-33102,-33102,true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033101',true);
select update_point_transaction((select id from point_transactions where task_id=-33102 and officer_id=-33102),11);
-- Audit failure must roll back the source correction and dependent credit.
create function pg_temp.fail_task_audit() returns trigger language plpgsql as $$begin
 if new.action='points.task_updated' then raise exception 'Synthetic Task audit failure'; end if;
 return new; end;$$;
create trigger test_task_audit_failure before insert on audit_logs for each row execute function pg_temp.fail_task_audit();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033102',true);
set local role authenticated;
select throws_ok($$select update_task_details(-33102,'Rollback','Synthetic','Flyer',
 (select id from branches where name='intro'),(statement_timestamp() at time zone 'America/Denver')::date-1,20)$$,
 'P0001','Synthetic Task audit failure','audit failure rolls back source and reconciliation');
select is((select points from tasks where id=-33102),7.5::numeric,'failed correction preserves source value');
select is((select points from point_transactions where task_id=-33102 and officer_id=-33102),11::numeric,'failed correction preserves edited award');
reset role;
select * from finish();
rollback;
