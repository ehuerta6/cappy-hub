-- Issue #465: let Leads and Admins directly set another Officer's completion
-- state for any Task, while retaining completion, Point, and notification history.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'event.created','event.changed','event.cancelled','event.signup','event.left',
  'task.assigned','task.assignment_removed','task.changed','task.completed','task.completion_rejected',
  'task.completion_changed','point.changed','warning.changed','warning.threshold',
  'event.reminder','task.reminder'
));

create function private.set_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_completed boolean, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
  was_completed boolean;
  changed boolean;
  before_status text;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if not (private.current_is_admin() or private.current_is_lead()) then
    raise exception 'Only Leads or Admins can change another Officer completion';
  end if;
  if p_completed is null then raise exception 'Select a completion state'; end if;
  if p_officer_id = actor_id then
    raise exception 'Leads and Admins may only change another Officer''s completion';
  end if;

  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  perform private.assert_task_period_writable(task_row.due_date, p_period_context);
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id and removed_at is null for update;
  if not found then raise exception 'Task assignment not found'; end if;

  was_completed := assignment.completed_at is not null
    and not assignment.completion_approval_pending;
  before_status := case
    when assignment.completion_approval_pending then 'Awaiting approval'
    when was_completed then 'Completed'
    else 'Not completed'
  end;
  changed := assignment.completion_approval_pending
    or was_completed is distinct from p_completed;

  if changed then
    update public.task_officer_assignments set
      completed_at = case when p_completed
        then coalesce(assignment.completed_at, pg_catalog.clock_timestamp())
        else null end,
      completion_approval_pending = false,
      approved_at = case when p_completed then pg_catalog.clock_timestamp() else null end,
      approved_by = case when p_completed then actor_id else null end
    where task_id = p_task_id and officer_id = p_officer_id and removed_at is null;
    perform private.write_audit_log('task.completion_changed', 'task', p_task_id::text,
      pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
        'officer_id', p_officer_id, 'actor_id', actor_id,
        'before', pg_catalog.jsonb_build_object('status', before_status),
        'after', pg_catalog.jsonb_build_object('status',
          case when p_completed then 'Completed' else 'Not completed' end)));
    perform private.create_notification(
      p_officer_id,
      'task.completion_changed',
      case when p_completed then 'Task marked completed' else 'Task marked not completed' end,
      'A Lead or Admin changed your completion for ' || task_row.title || '.',
      'task', p_task_id, '/tasks/' || p_task_id, 'important',
      'task.completion_changed:' || p_task_id || ':' || p_officer_id || ':' || pg_catalog.clock_timestamp()::text
    );
  end if;

  perform private.reconcile_task_award(p_task_id, p_officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
end;
$$;

-- Keep the established three-argument RPC callable. It derives the period
-- from the Task so the legacy entry point cannot bypass historical write rules.
create or replace function private.set_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_completed boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare task_due_date date; period_context text;
begin
  select due_date into task_due_date from public.tasks where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;
  select id::text into period_context from public.academic_periods
    where task_due_date between starts_on and ends_on;
  perform private.set_task_assignment_completion(
    p_task_id, p_officer_id, p_completed, coalesce(period_context, 'none'));
end;
$$;

create function public.set_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_completed boolean, p_period_context text
) returns void language sql security invoker set search_path = '' as $$
  select private.set_task_assignment_completion(
    p_task_id, p_officer_id, p_completed, p_period_context)
$$;

revoke all on function private.set_task_assignment_completion(bigint,bigint,boolean,text),
  public.set_task_assignment_completion(bigint,bigint,boolean,text)
  from public, anon;
grant execute on function private.set_task_assignment_completion(bigint,bigint,boolean,text),
  public.set_task_assignment_completion(bigint,bigint,boolean,text)
  to authenticated;

create or replace function private.notify_task_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; target record;
begin
  if new.completed_at is null or old.completed_at is not distinct from new.completed_at then return new; end if;
  select * into task_row from public.tasks where id=new.task_id;
  for target in select distinct o.id from public.officers o join public.positions p on p.id=o.position_id
    join public.officer_branches ob on ob.officer_id=o.id
    where o.status='active' and p.code='lead' and ob.branch_id=task_row.branch_id
      and not (
        new.approved_by is not null and new.approved_by <> new.officer_id
        and new.approved_by is distinct from old.approved_by
        and o.id=new.officer_id
      )
  loop
    perform private.create_notification(target.id,'task.completed','Task completed: '||task_row.title,
      'An Officer completed a Task for your Branch.','task',task_row.id,'/tasks/'||task_row.id,
      'important','task.completed:'||new.task_id||':'||new.officer_id||':'||target.id||':'||new.completed_at::text);
  end loop;
  return new;
end;
$$;
