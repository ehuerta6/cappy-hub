-- Officers may report completion for their own active assignment. Task
-- managers approve or reject the report; only approved work earns Points.

alter table public.task_officer_assignments
  add column completion_approval_pending boolean not null default false,
  add constraint task_officer_assignments_completion_approval_pending_check
    check (not completion_approval_pending or (completed_at is not null and approved_at is null));

create function private.assert_task_period_writable(
  p_due_date date, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  selected_period_id bigint;
  today date := (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date;
begin
  perform public.assert_academic_period_context_writable(p_period_context);
  if p_period_context = 'none' then return; end if;
  if p_period_context = 'current' then
    select id into selected_period_id from public.academic_periods
      where today between starts_on and ends_on;
    if selected_period_id is null then return; end if;
  else
    selected_period_id := p_period_context::bigint;
  end if;
  if not exists(select 1 from public.academic_periods
      where id = selected_period_id and p_due_date between starts_on and ends_on) then
    raise exception 'Task is outside the selected academic period';
  end if;
end;
$$;
revoke all on function private.assert_task_period_writable(date, text)
  from public, anon, authenticated;

create or replace function private.reconcile_task_award(
  p_task_id bigint, p_officer_id bigint, p_denver_today date
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  award public.point_transactions%rowtype;
  award_id bigint;
  actor_uuid uuid := auth.uid();
  eligible boolean;
  had_award boolean;
begin
  -- Every mutation and processor locks Task first, then assignment and award.
  select * into task_row from public.tasks where id = p_task_id;
  if not found or task_row.removed_at is not null then return false; end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then return false; end if;
  eligible := assignment.removed_at is null and assignment.completed_at is not null
    and not assignment.completion_approval_pending
    and private.task_award_due(task_row.due_date, p_denver_today);
  select * into award from public.point_transactions
    where task_id = p_task_id and officer_id = p_officer_id and award_type = 'task'
    for update;
  had_award := found;
  if not eligible then
    if had_award and award.removed_at is null then
      if actor_uuid is null then raise exception 'A manager is required to reverse Task points'; end if;
      update public.point_transactions set
        removed_at = pg_catalog.clock_timestamp(), removed_by = actor_uuid,
        removed_by_officer_id = null, task_reconciliation_suspended = true,
        updated_at = pg_catalog.clock_timestamp(), updated_by = actor_uuid,
        updated_by_officer_id = null where id = award.id;
      perform private.write_audit_log('points.task_removed', 'point_transaction', award.id::text,
        pg_catalog.jsonb_build_object('transaction_id',award.id,'task_id',p_task_id,
          'task_title',task_row.title,'officer_id',p_officer_id,'points',award.points,
          'reason',award.reason,'before',pg_catalog.to_jsonb(award),
          'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=award.id),
          'reconciliation_reason',case when assignment.removed_at is not null then 'assignment_removed'
            when assignment.completion_approval_pending then 'completion_pending_approval'
            when assignment.completed_at is null then 'completion_reversed' else 'due_date_not_passed' end));
      return true;
    end if;
    return false;
  end if;
  if had_award then
    -- Admin/legacy removals remain excluded. Only known mechanical suspension
    -- may be reversed; ordinary retries preserve direct edits and audit history.
    if award.removed_at is null or not award.task_reconciliation_suspended then return false; end if;
    update public.point_transactions set removed_at=null,removed_by=null,removed_by_officer_id=null,
      task_reconciliation_suspended=false,updated_at=pg_catalog.clock_timestamp(),
      updated_by=actor_uuid,updated_by_officer_id=null where id=award.id;
    perform private.write_audit_log('points.task_reactivated','point_transaction',award.id::text,
      pg_catalog.jsonb_build_object('transaction_id',award.id,'task_id',p_task_id,
        'task_title',task_row.title,'officer_id',p_officer_id,'points',award.points,'reason',award.reason,
        'before',pg_catalog.to_jsonb(award),
        'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=award.id)));
    return true;
  end if;
  insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by)
    values(p_officer_id,p_task_id,task_row.points,'Task completion: '||task_row.title,'task',actor_uuid)
    on conflict(task_id,officer_id) where award_type='task' do nothing returning id into award_id;
  if award_id is null then return false; end if;
  perform private.write_audit_log('points.task_created','point_transaction',award_id::text,
    pg_catalog.jsonb_build_object('transaction_id',award_id,'task_id',p_task_id,
      'task_title',task_row.title,'officer_id',p_officer_id,'points',task_row.points,
      'reason','Task completion: '||task_row.title));
  return true;
end;
$$;
revoke all on function private.reconcile_task_award(bigint, bigint, date)
  from public, anon, authenticated;

create or replace function private.set_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_completed boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
  was_completed boolean;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_completed is null then raise exception 'Select a completion state'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id and removed_at is null for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if assignment.completion_approval_pending then
    raise exception 'Task completion is awaiting approval';
  end if;

  was_completed := assignment.completed_at is not null;
  if was_completed is distinct from p_completed then
    update public.task_officer_assignments set
      completed_at = case when p_completed then pg_catalog.clock_timestamp() else null end,
      completion_approval_pending = false,
      approved_at = case when p_completed then pg_catalog.clock_timestamp() else null end,
      approved_by = case when p_completed then actor_id else null end
    where task_id = p_task_id and officer_id = p_officer_id and removed_at is null;
    perform private.write_audit_log('task.completion_changed', 'task', p_task_id::text,
      pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
        'officer_id', p_officer_id, 'actor_id', actor_id,
        'before', pg_catalog.jsonb_build_object('status',
          case when was_completed then 'Completed' else 'Not completed' end),
        'after', pg_catalog.jsonb_build_object('status',
          case when p_completed then 'Completed' else 'Not completed' end)));
  end if;

  perform private.reconcile_task_award(p_task_id, p_officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
end;
$$;
create function private.self_complete_task_assignment(
  p_task_id bigint, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor_id bigint := private.current_active_officer_id();
  assignment public.task_officer_assignments%rowtype;
  approved_immediately boolean;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  perform private.assert_task_period_writable(task_row.due_date, p_period_context);
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = actor_id for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if assignment.removed_at is not null then raise exception 'Task assignment has been removed'; end if;
  if assignment.completed_at is not null then raise exception 'Task completion already submitted'; end if;

  approved_immediately := private.current_is_admin() or
    (private.current_is_lead() and private.can_manage_branches(array[task_row.branch_id]));
  update public.task_officer_assignments set completed_at = pg_catalog.clock_timestamp(),
    completion_approval_pending = not approved_immediately,
    approved_at = case when approved_immediately then pg_catalog.clock_timestamp() else null end,
    approved_by = case when approved_immediately then actor_id else null end
  where task_id = p_task_id and officer_id = actor_id;
  perform private.write_audit_log('task.completion_submitted', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
      'officer_id', actor_id, 'actor_id', actor_id,
      'approved_immediately', approved_immediately));
  if approved_immediately then
    perform private.reconcile_task_award(p_task_id, actor_id,
      (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  end if;
end;
$$;
revoke all on function private.self_complete_task_assignment(bigint, text)
  from public, anon;
grant execute on function private.self_complete_task_assignment(bigint, text)
  to authenticated;

create function public.self_complete_task_assignment(
  p_task_id bigint, p_period_context text
) returns void language sql security invoker set search_path = '' as $$
  select private.self_complete_task_assignment(p_task_id, p_period_context)
$$;
revoke all on function public.self_complete_task_assignment(bigint, text)
  from public, anon;
grant execute on function public.self_complete_task_assignment(bigint, text)
  to authenticated;

create function private.approve_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  perform private.assert_task_period_writable(task_row.due_date, p_period_context);
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if assignment.removed_at is not null then raise exception 'Task assignment has been removed'; end if;
  if assignment.completed_at is null then raise exception 'Task completion was not submitted'; end if;
  if not assignment.completion_approval_pending then raise exception 'Task completion is not awaiting approval'; end if;
  if assignment.officer_id = actor_id then raise exception 'A different Task manager must approve this completion'; end if;

  update public.task_officer_assignments set completion_approval_pending = false,
    approved_at = pg_catalog.clock_timestamp(),
    approved_by = actor_id where task_id = p_task_id and officer_id = p_officer_id;
  perform private.write_audit_log('task.completion_approved', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
      'officer_id', p_officer_id, 'actor_id', actor_id));
  perform private.reconcile_task_award(p_task_id, p_officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
end;
$$;
revoke all on function private.approve_task_assignment_completion(bigint, bigint, text)
  from public, anon;
grant execute on function private.approve_task_assignment_completion(bigint, bigint, text)
  to authenticated;

create function public.approve_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_period_context text
) returns void language sql security invoker set search_path = '' as $$
  select private.approve_task_assignment_completion(p_task_id, p_officer_id, p_period_context)
$$;
revoke all on function public.approve_task_assignment_completion(bigint, bigint, text)
  from public, anon;
grant execute on function public.approve_task_assignment_completion(bigint, bigint, text)
  to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'event.created','event.changed','event.cancelled','event.signup','event.left',
  'task.assigned','task.changed','task.completed','task.completion_rejected',
  'point.changed','warning.changed','warning.threshold','event.reminder','task.reminder'
));

create function private.reject_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  perform private.assert_task_period_writable(task_row.due_date, p_period_context);
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if assignment.removed_at is not null then raise exception 'Task assignment has been removed'; end if;
  if not assignment.completion_approval_pending then
    raise exception 'Task completion is not awaiting approval';
  end if;
  if assignment.officer_id = actor_id then raise exception 'A different Task manager must review this completion'; end if;

  update public.task_officer_assignments set completed_at = null,
    completion_approval_pending = false, approved_at = null, approved_by = null
  where task_id = p_task_id and officer_id = p_officer_id;
  perform private.write_audit_log('task.completion_rejected', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
      'officer_id', p_officer_id, 'actor_id', actor_id));
  perform private.reconcile_task_award(p_task_id, p_officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  perform private.create_notification(p_officer_id, 'task.completion_rejected',
    'Completion not approved: ' || task_row.title,
    'A Lead or Admin did not approve this completion. You can mark the Task complete again when it is done.',
    'task', task_row.id, '/tasks/' || task_row.id, 'important',
    'task.completion_rejected:' || p_task_id || ':' || p_officer_id || ':' || assignment.completed_at::text);
end;
$$;
revoke all on function private.reject_task_assignment_completion(bigint, bigint, text)
  from public, anon;
grant execute on function private.reject_task_assignment_completion(bigint, bigint, text)
  to authenticated;

create function public.reject_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_period_context text
) returns void language sql security invoker set search_path = '' as $$
  select private.reject_task_assignment_completion(p_task_id, p_officer_id, p_period_context)
$$;
revoke all on function public.reject_task_assignment_completion(bigint, bigint, text)
  from public, anon;
grant execute on function public.reject_task_assignment_completion(bigint, bigint, text)
  to authenticated;

create or replace function private.process_due_tasks() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment record;
  denver_today date := (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date;
  processed_count integer := 0;
begin
  for task_row in
    select * from public.tasks
    where removed_at is null and due_date < denver_today
      and exists (select 1 from public.task_officer_assignments a
        where a.task_id = tasks.id and a.completed_at is not null
          and not a.completion_approval_pending and a.removed_at is null)
    order by due_date, id for update skip locked
  loop
    for assignment in
      select officer_id from public.task_officer_assignments
      where task_id = task_row.id and completed_at is not null
        and not completion_approval_pending and removed_at is null
      order by officer_id for update
    loop
      perform private.reconcile_task_award(task_row.id, assignment.officer_id, denver_today);
    end loop;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;
