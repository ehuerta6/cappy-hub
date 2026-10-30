begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000033201','task-delete-admin@example.test'),
 ('00000000-0000-4000-8000-000000033202','task-delete-lead@example.test'),
 ('00000000-0000-4000-8000-000000033203','task-delete-officer@example.test'),
 ('00000000-0000-4000-8000-000000033204','task-delete-inactive@example.test'),
 ('00000000-0000-4000-8000-000000033205','task-delete-unlinked@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-33201,'Task Delete Admin','task-delete-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000033201'),
 (-33202,'Task Delete Lead','task-delete-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000033202'),
 (-33203,'Task Delete Officer','task-delete-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000033203'),
 (-33204,'Task Delete Inactive','task-delete-inactive@example.test',(select id from positions where name='Officer'),'inactive','officer','00000000-0000-4000-8000-000000033204'),
 (-33205,'Task Delete Unlinked','task-delete-unlinked@example.test',(select id from positions where name='Officer'),'active','officer',null);
insert into officer_branches(officer_id,branch_id)
 select -33202,id from branches where name='intro';
select set_config('test.denver_today',
  (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date::text,true);

insert into task_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values(-33201,'00000000-0000-4000-8000-000000033201','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',-33202,
  current_setting('test.denver_today')::date-1,current_setting('test.denver_today')::date);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,
  recurrence_series_id,recurrence_key)
values
 (-33201,'Completed awarded Task','Preserve its history','Flyer',(select id from branches where name='intro'),
  current_setting('test.denver_today')::date-1,4,false,-33202,-33201,current_setting('test.denver_today')::date-1),
 (-33202,'Not-yet-due awarded Task','Keep the award suspended','Post',(select id from branches where name='intro'),
   current_setting('test.denver_today')::date+1,2,false,-33202,null,null),
  (-33203,'Previously removed award','Do not revive independent removals','Story',(select id from branches where name='intro'),
   current_setting('test.denver_today')::date-1,3,false,-33202,null,null),
  (-33204,'Removed while deleted','Respect a later deliberate removal','LinkedIn',(select id from branches where name='intro'),
   current_setting('test.denver_today')::date-1,1,false,-33202,null,null),
  (-33205,'Out-of-scope Task','Lead must not cross Branch scope','Post',(select id from branches where name='icpc'),
   current_setting('test.denver_today')::date-1,2,false,-33202,null,null);
insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
values(-33201,-33203,-33202,now()-interval '2 days'),(-33202,-33203,-33202,now()-interval '1 day'),
  (-33203,-33203,-33202,now()-interval '2 days'),(-33204,-33203,-33202,now()-interval '2 days');
insert into point_transactions(officer_id,task_id,points,reason,award_type,created_by)
values
 (-33203,-33201,4,'Task completion: Completed awarded Task','task','00000000-0000-4000-8000-000000033202'),
 (-33203,-33202,2,'Task completion: Not-yet-due awarded Task','task','00000000-0000-4000-8000-000000033202'),
 (-33203,-33203,3,'Task completion: Previously removed award','task','00000000-0000-4000-8000-000000033202'),
 (-33203,-33204,1,'Task completion: Removed while deleted','task','00000000-0000-4000-8000-000000033202');
create temporary table task_before_delete as
 select id,to_jsonb(t) as row from tasks t where id in (-33201,-33202,-33203,-33204);
create temporary table assignment_before_delete as
 select task_id,officer_id,to_jsonb(a) as row from task_officer_assignments a where task_id in (-33201,-33202,-33203,-33204);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033201',true);
set local role authenticated;
select lives_ok($$select remove_point_transaction((select id from point_transactions where task_id=-33203 and award_type='task'))$$,
  'Admin intentionally removes a Task award before Task deletion');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033202',true);
set local role authenticated;
select lives_ok($$select remove_task(-33201)$$,
  'authorized branch manager deletes a completed and awarded Task');
select lives_ok($$select remove_task(-33201)$$,
  'repeated Task delete is safe');
reset role;
select isnt((select removed_at from tasks where id=-33201),null::timestamptz,
  'deleted Task is removed from active workflows');
select is((select to_jsonb(t)-'removed_at'-'removed_by' from tasks t where id=-33201),
  (select row-'removed_at'-'removed_by' from task_before_delete where id=-33201),
  'delete preserves the Task row and recurrence identity');
select is((select task_type from tasks where id=-33201), 'Flyer',
  'Task delete preserves its catalog-backed type');
select is((select to_jsonb(a)-'removed_at'-'removed_by' from task_officer_assignments a
  where task_id=-33201 and officer_id=-33203),
  (select row-'removed_at'-'removed_by' from assignment_before_delete where task_id=-33201 and officer_id=-33203),
  'delete preserves assignment and completion history');
select isnt((select removed_at from point_transactions where task_id=-33201 and award_type='task'),null::timestamptz,
  'delete suspends the active automatic Task award');
select ok((select task_reconciliation_suspended from point_transactions
  where task_id=-33201 and award_type='task'),
  'Task delete marks only its mechanical award suspension');
select is((select count(*) from audit_logs where action='task.deleted' and entity_id='-33201'),1::bigint,
  'Task delete writes one audit entry across retries');

select lives_ok($$select restore_task(-33201)$$,
  'authorized branch manager restores a deleted Task');
select lives_ok($$select restore_task(-33201)$$,
  'retrying Task restore succeeds without duplicating reconciliation');
select is((select removed_at from tasks where id=-33201),null::timestamptz,
  'restore returns the Task to active workflows');
select is((select recurrence_key from tasks where id=-33201),
  current_setting('test.denver_today')::date-1,
  'restore preserves the original recurrence occurrence identity');
select is((select task_type from tasks where id=-33201), 'Flyer',
  'Task restore preserves its catalog-backed type');
select is((select removed_at from point_transactions where task_id=-33201 and award_type='task'),null::timestamptz,
  'restore reactivates an eligible mechanically suspended award');
select is((select task_reconciliation_suspended from point_transactions
  where task_id=-33201 and award_type='task'),false,
  'restored award is no longer mechanically suspended');
select is((select count(*) from audit_logs where action='task.deleted' and entity_id='-33201'
  and actor_officer_id=-33202),1::bigint,'delete audit attributes the manager');
select is((select count(*) from audit_logs where action='task.restored' and entity_id='-33201'
  and actor_officer_id=-33202),1::bigint,'restore audit attributes the manager and retry adds no duplicate');

create function pg_temp.fail_task_delete_audit() returns trigger language plpgsql as $$
begin
  if new.action='task.deleted' and new.entity_id='-33201' then
    raise exception 'Synthetic Task audit failure';
  end if;
  return new;
end;
$$;
create trigger fail_task_delete_audit before insert on audit_logs
  for each row execute function pg_temp.fail_task_delete_audit();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033202',true);
set local role authenticated;
select throws_ok($$select remove_task(-33201)$$,'P0001','Synthetic Task audit failure',
  'audit failure aborts Task deletion');
reset role;
select is((select removed_at from tasks where id=-33201),null::timestamptz,
  'audit failure rolls back the Task removal marker');
select is((select removed_at from point_transactions where task_id=-33201 and award_type='task'),
  null::timestamptz,'audit failure rolls back automatic Point suspension');
select is((select task_reconciliation_suspended from point_transactions
  where task_id=-33201 and award_type='task'),false,
  'audit failure rolls back the mechanical suspension marker');
select is((select count(*) from audit_logs where action='task.deleted' and entity_id='-33201'),1::bigint,
  'audit failure leaves no partial Task delete audit');
drop trigger fail_task_delete_audit on audit_logs;

select lives_ok($$select remove_task(-33202)$$,
  'manager can delete an open or not-yet-due Task');
select lives_ok($$select restore_task(-33202)$$,
  'manager can restore a not-yet-due Task');
select isnt((select removed_at from point_transactions where task_id=-33202 and award_type='task'),null::timestamptz,
  'restore does not reactivate an award before the due-date rule permits it');
select ok((select task_reconciliation_suspended from point_transactions
  where task_id=-33202 and award_type='task'),
  'ineligible award remains marked as mechanically suspended');

select lives_ok($$select remove_task(-33203)$$,
  'manager can delete a Task with a previously removed award');
select lives_ok($$select restore_task(-33203)$$,
  'manager can restore a Task with a previously removed award');
select isnt((select removed_at from point_transactions where task_id=-33203 and award_type='task'),null::timestamptz,
  'restore does not revive an award intentionally removed before Task deletion');
select ok(not (select task_reconciliation_suspended from point_transactions
  where task_id=-33203 and award_type='task'),
  'an independent removal is not reclassified as Task-delete suspension');

select lives_ok($$select remove_task(-33204)$$,
  'manager can delete an eligible awarded Task');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033201',true);
select lives_ok($$select remove_point_transaction((select id from point_transactions where task_id=-33204 and award_type='task'))$$,
  'Admin can deliberately remove a suspended award while its Task is deleted');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033202',true);
select lives_ok($$select restore_task(-33204)$$,
  'manager can restore a Task after a deliberate award removal');
select isnt((select removed_at from point_transactions where task_id=-33204 and award_type='task'),null::timestamptz,
  'restore preserves the Admin removal made while the Task was deleted');
select ok(not (select task_reconciliation_suspended from point_transactions
  where task_id=-33204 and award_type='task'),
  'deliberate removal clears the mechanical Task-delete marker');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033203',true);
set local role authenticated;
select throws_ok($$select remove_task(-33201)$$,'P0001','Task outside branch scope',
  'ordinary Officer cannot delete a Task');
select throws_ok($$select restore_task(-33201)$$,'P0001','Task outside branch scope',
  'ordinary Officer cannot restore a Task');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033202',true);
set local role authenticated;
select throws_ok($$select remove_task(-33205)$$,'P0001','Task outside branch scope',
  'Lead cannot delete a Task outside assigned Branches');
select throws_ok($$select restore_task(-33205)$$,'P0001','Task outside branch scope',
  'Lead cannot restore a Task outside assigned Branches');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033204',true);
select throws_ok($$select remove_task(-33201)$$,'P0001','Unauthorized',
  'inactive linked Officer cannot delete Tasks');
select throws_ok($$select restore_task(-33201)$$,'P0001','Unauthorized',
  'inactive linked Officer cannot restore Tasks');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033205',true);
select throws_ok($$select remove_task(-33201)$$,'P0001','Unauthorized',
  'active but unlinked Officer identity cannot delete Tasks');
select throws_ok($$select restore_task(-33201)$$,'P0001','Unauthorized',
  'active but unlinked Officer identity cannot restore Tasks');
reset role;

select is((select count(*) from audit_logs where action='task.restored' and entity_id='-33201'),1::bigint,
  'Task restore writes one audit entry');
select * from finish();
rollback;
