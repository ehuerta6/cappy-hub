begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000034701', 'task-type-admin@example.test'),
  ('00000000-0000-4000-8000-000000034702', 'task-type-officer@example.test'),
  ('00000000-0000-4000-8000-000000034703', 'task-type-inactive@example.test'),
  ('00000000-0000-4000-8000-000000034704', 'task-type-unlinked@example.test');
insert into officers(id, name, utep_email, position_id, status, application_role, auth_user_id)
values
  (-34701, 'Task Type Admin', 'task-type-admin@example.test',
    (select id from positions where code='officer'), 'active', 'admin', '00000000-0000-4000-8000-000000034701'),
  (-34702, 'Task Type Officer', 'task-type-officer@example.test',
    (select id from positions where code='officer'), 'active', 'officer', '00000000-0000-4000-8000-000000034702'),
  (-34703, 'Task Type Inactive', 'task-type-inactive@example.test',
    (select id from positions where code='officer'), 'inactive', 'admin', '00000000-0000-4000-8000-000000034703');
insert into tasks(id, title, description, task_type, branch_id, due_date, points, created_by)
values (-34701, 'Existing typed Task', 'Keep task and related history', 'Flyer',
  (select id from branches where name='intro'), date '2099-10-01', 2, -34701);
insert into task_officer_assignments(task_id, officer_id, assigned_by, completed_at)
values (-34701, -34702, -34701, null);
insert into point_transactions(officer_id, task_id, points, reason, award_type, created_by)
values (-34702, -34701, 2, 'Independent Task history', 'task',
  '00000000-0000-4000-8000-000000034701');
create temporary table task_type_history_before as
select (select to_jsonb(a) from task_officer_assignments a
    where task_id=t.id and officer_id=-34702) assignment_row,
  (select to_jsonb(p) from point_transactions p where task_id=t.id and officer_id=-34702) point_row
from tasks t where id=-34701;
select ok((select relrowsecurity from pg_catalog.pg_class
  where oid='public.task_types'::regclass), 'Task Types retain Row Level Security');
select is((select confdeltype::text || confupdtype::text from pg_catalog.pg_constraint
  where conrelid='public.tasks'::regclass and conname='tasks_task_type_fkey'), 'rc',
  'Task Type references are restricted on delete and cascaded on rename');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000034701', true);
set local role authenticated;
select lives_ok($$select delete_task_type((select id from task_types where name='Flyer'))$$,
  'Admin deletes a referenced Task Type recoverably');
select is((select available_for_new_tasks from task_types where name='Flyer'), false,
  'deleted Task Type remains stored but is unavailable for new Tasks');
select throws_ok($$select save_task('Unavailable type','Test','Flyer',
    (select id from branches where name='intro'),'2099-10-02',1,false)$$,
  'P0001','Invalid task fields','new Tasks cannot select a deleted type');
select lives_ok($$select update_task_details(-34701,'Edited title','Same history','Flyer',
    (select id from branches where name='intro'),'2099-10-01',2)$$,
  'unrelated Task edits may retain the unchanged deleted type');
select lives_ok($$select delete_task_type((select id from task_types where name='Post'))$$,
  'Admin also deletes an unused type for edit validation');
select throws_ok($$select update_task_details(-34701,'Edited title','Same history','Post',
    (select id from branches where name='intro'),'2099-10-01',2)$$,
  'P0001','Invalid task fields','an unavailable type cannot be newly selected on an existing Task');
select lives_ok($$select rename_task_type((select id from task_types where name='Flyer'),'Legacy Flyer')$$,
  'Admin can rename a deleted Task Type');
select is((select task_type from tasks where id=-34701), 'Legacy Flyer',
  'renaming cascades through Task references without deleting the Task');
select is((select available_for_new_tasks from task_types where name='Legacy Flyer'), false,
  'renaming a deleted Task Type preserves its deleted state');
select lives_ok($$select restore_task_type((select id from task_types where name='Legacy Flyer'))$$,
  'Admin restores the same renamed Task Type');
select lives_ok($$select create_task_type('New Type')$$,
  'Admin can create an available Task Type');
select lives_ok($$select save_task('New typed Task','Use catalog','New Type',
    (select id from branches where name='intro'),'2099-10-02',1,false)$$,
  'Admin can use a newly created Task Type immediately');
create temporary table task_type_identity as
select id from task_types where name='New Type';
select lives_ok($$select rename_task_type((select id from task_types where name='New Type'),'Renamed Type')$$,
  'Admin can rename an available Task Type');
select lives_ok($$select delete_task_type((select id from task_types where name='Renamed Type'))$$,
  'unreferenced Task Types use the same recoverable delete');
select lives_ok($$select restore_task_type((select id from task_types where name='Renamed Type'))$$,
  'unreferenced Task Type retains its stable ID for restore');
select is((select id from task_types where name='Renamed Type'),
  (select id from task_type_identity),
  'rename, Delete and Restore preserve the catalog identity');
reset role;

select is((select to_jsonb(a) from task_officer_assignments a
  where task_id=-34701 and officer_id=-34702),
  (select assignment_row from task_type_history_before),
  'Task Type changes preserve assignment and completion identity');
select is((select to_jsonb(p) from point_transactions p
  where task_id=-34701 and officer_id=-34702),
  (select point_row from task_type_history_before),
  'Task Type changes preserve Point transaction history');
select is((select task_type from tasks where id=-34701), 'Legacy Flyer',
  'Task retains its renamed historical type');
select is((select count(*) from audit_logs where entity_type='task_type'
  and actor_officer_id=-34701 and action in ('task_type.deleted','task_type.renamed','task_type.restored')),
  7::bigint, 'each material catalog lifecycle change is audited once');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000034702', true);
set local role authenticated;
select throws_ok($$select create_task_type('Officer type')$$, 'P0001','Admin required',
  'ordinary Officers cannot create Task Types');
select throws_ok($$select delete_task_type((select id from task_types where name='Post'))$$,
  'P0001','Admin required','ordinary Officers cannot delete Task Types');
select throws_ok($$update task_types set available_for_new_tasks=false where name='Post'$$,
  '42501','permission denied for table task_types','direct Task Type table writes remain denied');
select ok((select count(*) > 0 from task_types where available_for_new_tasks),
  'active Officers can read Task Type choices');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000034703', true);
set local role authenticated;
select throws_ok($$select restore_task_type((select id from task_types where name='Legacy Flyer'))$$,
  'P0001','Admin required','inactive Admin cannot restore Task Types');
select is((select count(*) from task_types), 0::bigint,
  'inactive Officers cannot read Task Types');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000034704', true);
set local role authenticated;
select throws_ok($$select create_task_type('Unlinked type')$$, 'P0001','Admin required',
  'unlinked authenticated accounts cannot create Task Types');
reset role;

select * from finish();
rollback;
