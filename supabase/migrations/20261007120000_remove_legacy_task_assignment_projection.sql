-- cappy-hub: approve-destructive-migration
-- reason: supported app calls use canonical assignments; #146 retired old RPC callers and production rollout completed.
-- Preserve any assignment identity and historical fields that remain only in
-- the compatibility projection before removing the table.
insert into public.task_officer_assignments
  (task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by)
select task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by
from public.task_assignments
on conflict (task_id, officer_id) do update set
  assigned_at = least(task_officer_assignments.assigned_at, excluded.assigned_at),
  completed_at = coalesce(task_officer_assignments.completed_at, excluded.completed_at),
  approved_at = coalesce(task_officer_assignments.approved_at, excluded.approved_at),
  approved_by = coalesce(task_officer_assignments.approved_by, excluded.approved_by);

-- The current recurring mutation, due-date guard, and supported assignment
-- RPCs were created in earlier migrations while both relations existed. Update
-- their stored definitions in place, preserving their signatures, grants, and
-- all existing authorization and workflow logic.
do $contract$
declare
  routine regprocedure;
  definition text;
  rewritten text;
  routines regprocedure[] := array[
    'private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])'::regprocedure,
    'private.prevent_task_due_date_rewrite_after_award()'::regprocedure,
    'private.self_assign_task(bigint)'::regprocedure,
    'private.bulk_assign_task_officers(bigint,bigint[])'::regprocedure,
    'private.set_task_assignment_completion(bigint,bigint,boolean)'::regprocedure,
    'private.remove_task_assignment(bigint,bigint)'::regprocedure
  ];
begin
  foreach routine in array routines loop
    definition := pg_catalog.pg_get_functiondef(routine);
    rewritten := pg_catalog.replace(definition, 'public.task_assignments', 'public.task_officer_assignments');
    rewritten := pg_catalog.replace(rewritten, 'perform private.sync_legacy_task_assignment(p_task_id);', '');

    if rewritten = definition or
       rewritten like '%public.task_assignments%' or
       rewritten like '%private.sync_legacy_task_assignment%' then
      raise exception 'Unexpected legacy Task assignment reference in %', routine;
    end if;
    execute rewritten;
  end loop;
end;
$contract$;

drop trigger task_assignments_sync_officer_assignments on public.task_assignments;
drop function private.sync_legacy_task_assignment_write();
drop function private.sync_legacy_task_assignment(bigint);
drop table public.task_assignments;
