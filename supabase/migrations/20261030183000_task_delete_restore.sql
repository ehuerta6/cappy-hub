-- Task deletion suspends only active automatic awards. Existing independent
-- removals and all Task/assignment identity remain untouched.
create or replace function private.remove_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor_id bigint := private.current_active_officer_id();
  award public.point_transactions%rowtype;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is not null then return; end if;

  update public.tasks set removed_at=pg_catalog.clock_timestamp(),removed_by=actor_id
    where id=p_task_id;

  for award in
    select * from public.point_transactions
    where task_id=p_task_id and award_type='task' and removed_at is null
    order by id for update
  loop
    update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
      removed_by=auth.uid(),removed_by_officer_id=null,task_reconciliation_suspended=true,
      updated_at=pg_catalog.clock_timestamp(),updated_by=auth.uid(),updated_by_officer_id=null
      where id=award.id;
    perform private.write_audit_log('points.task_removed','point_transaction',award.id::text,
      pg_catalog.jsonb_build_object('transaction_id',award.id,'task_id',p_task_id,
        'task_title',task_row.title,'officer_id',award.officer_id,'points',award.points,
        'reason',award.reason,'before',pg_catalog.to_jsonb(award),
        'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=award.id),
        'reconciliation_reason','task_deleted'));
  end loop;

  perform private.write_audit_log('task.deleted','task',p_task_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(task_row),
      'after',(select pg_catalog.to_jsonb(t) from public.tasks t where id=p_task_id),
      'assignment_count',(select count(*) from public.task_officer_assignments where task_id=p_task_id),
      'point_count',(select count(*) from public.point_transactions where task_id=p_task_id)));
end;
$$;

create or replace function public.remove_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.remove_task(p_task_id)
$$;

create or replace function private.restore_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor_id bigint := private.current_active_officer_id();
  assignment record;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is null then raise exception 'Task is not deleted'; end if;

  update public.tasks set removed_at=null,removed_by=null where id=p_task_id;
  for assignment in
    select officer_id from public.task_officer_assignments
    where task_id=p_task_id order by officer_id
  loop
    perform private.reconcile_task_award(p_task_id,assignment.officer_id,
      (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  end loop;
  perform private.write_audit_log('task.restored','task',p_task_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(task_row),
      'after',(select pg_catalog.to_jsonb(t) from public.tasks t where id=p_task_id),
      'assignment_count',(select count(*) from public.task_officer_assignments where task_id=p_task_id),
      'point_count',(select count(*) from public.point_transactions where task_id=p_task_id)));
end;
$$;

create or replace function public.restore_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_task(p_task_id)
$$;

-- Preserve the existing trusted entry points and authenticated grants.
revoke all on function private.remove_task(bigint),public.remove_task(bigint),
  private.restore_task(bigint),public.restore_task(bigint) from public,anon,authenticated;
grant execute on function private.remove_task(bigint),private.restore_task(bigint)
  to authenticated;
grant execute on function public.remove_task(bigint),public.restore_task(bigint)
  to authenticated;
