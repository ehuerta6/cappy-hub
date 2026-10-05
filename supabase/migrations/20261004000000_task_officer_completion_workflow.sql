-- Expand Tasks to per-Officer assignments without changing the singular
-- task_assignments relationship used by the currently deployed application.
create table public.task_officer_assignments (
  task_id bigint not null references public.tasks(id) on delete restrict,
  officer_id bigint not null references public.officers(id) on delete restrict,
  assigned_by bigint not null references public.officers(id) on delete restrict,
  assigned_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by bigint references public.officers(id) on delete restrict,
  primary key (task_id, officer_id),
  check ((approved_at is null) = (approved_by is null))
);

create index task_officer_assignments_officer_idx
  on public.task_officer_assignments(officer_id, task_id);

alter table public.task_officer_assignments enable row level security;
revoke all on public.task_officer_assignments from public, anon, authenticated;
grant select on public.task_officer_assignments to authenticated;
create policy "Approved officers read Task officer assignments"
  on public.task_officer_assignments for select to authenticated
  using ((select private.current_active_officer_id()) is not null);

-- Preserve every existing field, including approval history that the current
-- Task product no longer uses.
insert into public.task_officer_assignments
  (task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by)
select task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by
from public.task_assignments;

-- Old application RPCs still write task_assignments during migration-first
-- rollout. Keep those writes synchronized into the new canonical relation.
create function private.sync_legacy_task_assignment_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Internal representative writes must not flow back over canonical history.
  if pg_catalog.current_setting('cappy.projecting_task_assignment', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.task_officer_assignments
      where task_id = old.task_id and officer_id = old.officer_id;
    return old;
  end if;

  insert into public.task_officer_assignments
    (task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by)
  values
    (new.task_id, new.officer_id, new.assigned_by, new.assigned_at,
      new.completed_at, new.approved_at, new.approved_by)
  on conflict (task_id, officer_id) do update set
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at,
    completed_at = excluded.completed_at,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by;
  return new;
end;
$$;
revoke all on function private.sync_legacy_task_assignment_write()
  from public, anon, authenticated;
create trigger task_assignments_sync_officer_assignments
  after insert or update or delete on public.task_assignments
  for each row execute function private.sync_legacy_task_assignment_write();

-- task_assignments remains a one-row rollback/old-client projection. Prefer a
-- completed representative so existing recurring guards continue to notice
-- protected completion history. It is never the source for current UI reads.
create function private.sync_legacy_task_assignment(p_task_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare representative public.task_officer_assignments%rowtype;
  previous_projection_setting text := pg_catalog.current_setting('cappy.projecting_task_assignment', true);
begin
  select * into representative
  from public.task_officer_assignments
  where task_id = p_task_id
  order by (completed_at is not null) desc, assigned_at, officer_id
  limit 1;

  if not found then
    perform pg_catalog.set_config('cappy.projecting_task_assignment', 'on', true);
    delete from public.task_assignments where task_id = p_task_id;
    perform pg_catalog.set_config('cappy.projecting_task_assignment', coalesce(previous_projection_setting, ''), true);
    return;
  end if;

  perform pg_catalog.set_config('cappy.projecting_task_assignment', 'on', true);
  insert into public.task_assignments
    (task_id, officer_id, assigned_by, assigned_at, completed_at, approved_at, approved_by)
  values
    (representative.task_id, representative.officer_id, representative.assigned_by,
      representative.assigned_at, representative.completed_at,
      case when representative.completed_at is null then null else representative.approved_at end,
      case when representative.completed_at is null then null else representative.approved_by end)
  on conflict (task_id) do update set
    officer_id = excluded.officer_id,
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at,
    completed_at = excluded.completed_at,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by;
  perform pg_catalog.set_config('cappy.projecting_task_assignment', coalesce(previous_projection_setting, ''), true);
end;
$$;
revoke all on function private.sync_legacy_task_assignment(bigint)
  from public, anon, authenticated;

-- The old unique index would prevent two Officers receiving Task points. Keep
-- one historical transaction per Task/Officer, including logically removed
-- rows, so completion reversal and restoration reuse the same history.
drop index public.one_task_award;
create unique index one_task_award_per_officer
  on public.point_transactions(task_id, officer_id) where award_type = 'task';

create function private.task_award_due(p_due_date date, p_denver_today date)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_due_date < p_denver_today
$$;
revoke all on function private.task_award_due(date, date)
  from public, anon, authenticated;

-- One trusted reconciler is used by manager changes, the legacy award helper,
-- and the scheduled processor. A Task row lock is taken by every caller first.
create function private.reconcile_task_award(
  p_task_id bigint, p_officer_id bigint, p_denver_today date
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  award public.point_transactions%rowtype;
  award_id bigint;
  actor_uuid uuid := auth.uid();
  changed boolean := false;
begin
  select * into task_row from public.tasks where id = p_task_id;
  if not found or task_row.removed_at is not null then return false; end if;

  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then return false; end if;

  select * into award from public.point_transactions
    where task_id = p_task_id and officer_id = p_officer_id and award_type = 'task'
    for update;

  if assignment.completed_at is null then
    if found and award.removed_at is null then
      if actor_uuid is null then
        raise exception 'A manager is required to reverse Task points';
      end if;
      update public.point_transactions set
        removed_at = pg_catalog.clock_timestamp(), removed_by = actor_uuid,
        removed_by_officer_id = null,
        updated_at = pg_catalog.clock_timestamp(), updated_by = actor_uuid,
        updated_by_officer_id = null
      where id = award.id;
      perform private.write_audit_log('points.task_removed', 'point_transaction', award.id::text,
        pg_catalog.jsonb_build_object('transaction_id', award.id, 'task_id', p_task_id,
          'task_title', task_row.title, 'officer_id', p_officer_id,
          'points', award.points, 'reason', award.reason));
      return true;
    end if;
    return false;
  end if;

  -- Keep migrated/legacy historical rows intact. New awards are activated only
  -- after the due date has passed in America/Denver calendar-day terms.
  if not private.task_award_due(task_row.due_date, p_denver_today) then
    return false;
  end if;

  if found and award.removed_at is null then return false; end if;

  if found then
    update public.point_transactions set
      removed_at = null, removed_by = null, removed_by_officer_id = null,
      updated_at = pg_catalog.clock_timestamp(), updated_by = actor_uuid,
      updated_by_officer_id = null
    where id = award.id;
    perform private.write_audit_log('points.task_reactivated', 'point_transaction', award.id::text,
      pg_catalog.jsonb_build_object('transaction_id', award.id, 'task_id', p_task_id,
        'task_title', task_row.title, 'officer_id', p_officer_id,
        'points', award.points, 'reason', award.reason));
    return true;
  end if;

  insert into public.point_transactions
    (officer_id, task_id, points, reason, award_type, created_by)
  values
    (p_officer_id, p_task_id, task_row.points,
      'Task completion: ' || task_row.title, 'task', actor_uuid)
  on conflict (task_id, officer_id) where award_type = 'task'
    do nothing returning id into award_id;

  if award_id is not null then
    perform private.write_audit_log('points.task_created', 'point_transaction', award_id::text,
      pg_catalog.jsonb_build_object('transaction_id', award_id, 'task_id', p_task_id,
        'task_title', task_row.title, 'officer_id', p_officer_id,
        'points', task_row.points, 'reason', 'Task completion: ' || task_row.title));
    return true;
  end if;

  -- The pair index remains the final duplicate guard if a nonstandard writer
  -- races this reconciler. Re-read and restore only a previously removed row.
  select * into award from public.point_transactions
    where task_id = p_task_id and officer_id = p_officer_id and award_type = 'task'
    for update;
  if found and award.removed_at is not null then
    update public.point_transactions set
      removed_at = null, removed_by = null, removed_by_officer_id = null,
      updated_at = pg_catalog.clock_timestamp(), updated_by = actor_uuid,
      updated_by_officer_id = null
    where id = award.id;
    perform private.write_audit_log('points.task_reactivated', 'point_transaction', award.id::text,
      pg_catalog.jsonb_build_object('transaction_id', award.id, 'task_id', p_task_id,
        'task_title', task_row.title, 'officer_id', p_officer_id,
        'points', award.points, 'reason', award.reason));
    return true;
  end if;
  return changed;
end;
$$;
revoke all on function private.reconcile_task_award(bigint, bigint, date)
  from public, anon, authenticated;

-- Keep the old private helper used by the deployed completion/approval RPCs,
-- but move its ON CONFLICT behavior to the new Task/Officer unique index.
create or replace function private.award_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  legacy_assignment public.task_assignments%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  select * into legacy_assignment from public.task_assignments where task_id = p_task_id;
  if not found or legacy_assignment.completed_at is null then
    raise exception 'Task is not awardable';
  end if;
  perform private.reconcile_task_award(p_task_id, legacy_assignment.officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
end;
$$;

-- The deployed app's complete_task RPC used to lock the legacy assignment
-- before the Task row. Lock the Task first so old RPC writes share the lock
-- order used by the new completion API and due processor during rollout.
create or replace function private.complete_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  select * into assignment from public.task_assignments where task_id = p_task_id for update;
  if not found then raise exception 'Task is not assigned'; end if;
  if assignment.officer_id <> actor_id then
    raise exception 'Only the assignee can complete this task';
  end if;
  if assignment.completed_at is not null then raise exception 'Task already completed'; end if;
  update public.task_assignments set completed_at = pg_catalog.clock_timestamp()
    where task_id = p_task_id;
  perform private.write_audit_log('task.completed', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('officer_id', actor_id));
  if not task_row.approval_required then perform private.award_task(p_task_id); end if;
end;
$$;

create function private.self_assign_task(p_task_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
  inserted_officer bigint;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  insert into public.task_officer_assignments(task_id, officer_id, assigned_by)
    values (p_task_id, actor_id, actor_id)
    on conflict (task_id, officer_id) do nothing returning officer_id into inserted_officer;
  if inserted_officer is not null then
    perform private.write_audit_log('task.officer_added', 'task', p_task_id::text,
      pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
        'officer_id', actor_id, 'actor_id', actor_id, 'self_assigned', true));
    perform private.sync_legacy_task_assignment(p_task_id);
  end if;
end;
$$;

create function public.self_assign_task(p_task_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.self_assign_task(p_task_id)
$$;

create function private.bulk_assign_task_officers(p_task_id bigint, p_officer_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor_id bigint := private.current_active_officer_id();
  requested_ids bigint[];
  added_ids bigint[];
  already_ids bigint[];
  target_id bigint;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids) = 0 or
      array_position(p_officer_ids, null) is not null then
    raise exception 'Select at least one valid officer';
  end if;
  select array_agg(id order by id) into requested_ids
  from (select distinct unnest(p_officer_ids) as id) submitted;

  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  if (select count(*) from public.officers
      where id = any(requested_ids) and status = 'active') <> cardinality(requested_ids) then
    raise exception 'Every selected officer must be active';
  end if;

  with inserted as (
    insert into public.task_officer_assignments(task_id, officer_id, assigned_by)
    select p_task_id, id, actor_id from unnest(requested_ids) id
    on conflict (task_id, officer_id) do nothing
    returning officer_id
  )
  select coalesce(array_agg(officer_id order by officer_id), '{}'::bigint[])
    into added_ids from inserted;
  select coalesce(array_agg(id order by id), '{}'::bigint[])
    into already_ids from unnest(requested_ids) id where id <> all(added_ids);

  foreach target_id in array added_ids loop
    perform private.write_audit_log('task.officer_added', 'task', p_task_id::text,
      pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
        'officer_id', target_id, 'actor_id', actor_id, 'self_assigned', false));
  end loop;
  if cardinality(added_ids) > 0 then
    perform private.sync_legacy_task_assignment(p_task_id);
  end if;
  return pg_catalog.jsonb_build_object(
    'added_officer_ids', added_ids, 'already_assigned_officer_ids', already_ids);
end;
$$;

create function public.bulk_assign_task_officers(p_task_id bigint, p_officer_ids bigint[])
returns jsonb language sql security invoker set search_path = '' as $$
  select private.bulk_assign_task_officers(p_task_id, p_officer_ids)
$$;

create function private.set_task_assignment_completion(
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
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then raise exception 'Task assignment not found'; end if;

  was_completed := assignment.completed_at is not null;
  if was_completed is distinct from p_completed then
    update public.task_officer_assignments set
      completed_at = case when p_completed then pg_catalog.clock_timestamp() else null end
    where task_id = p_task_id and officer_id = p_officer_id;
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
  perform private.sync_legacy_task_assignment(p_task_id);
end;
$$;

create function public.set_task_assignment_completion(
  p_task_id bigint, p_officer_id bigint, p_completed boolean
) returns void language sql security invoker set search_path = '' as $$
  select private.set_task_assignment_completion(p_task_id, p_officer_id, p_completed)
$$;

create function private.remove_task_assignment(p_task_id bigint, p_officer_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  assignment public.task_officer_assignments%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if assignment.completed_at is not null or exists (
    select 1 from public.point_transactions
    where task_id = p_task_id and officer_id = p_officer_id and award_type = 'task'
  ) then
    raise exception 'Completed or awarded Task assignments cannot be removed';
  end if;

  delete from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id;
  perform private.write_audit_log('task.officer_removed', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
      'officer_id', p_officer_id, 'actor_id', actor_id,
      'assigned_at', assignment.assigned_at));
  perform private.sync_legacy_task_assignment(p_task_id);
end;
$$;

create function public.remove_task_assignment(p_task_id bigint, p_officer_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.remove_task_assignment(p_task_id, p_officer_id)
$$;

create or replace function private.remove_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if task_row.removed_at is not null then return; end if;
  if exists (select 1 from public.task_officer_assignments
      where task_id = p_task_id and completed_at is not null)
    or exists (select 1 from public.point_transactions
      where task_id = p_task_id and award_type = 'task') then
    raise exception 'Completed or awarded Tasks cannot be removed';
  end if;
  update public.tasks set removed_at = pg_catalog.clock_timestamp(), removed_by = actor_id
    where id = p_task_id;
  perform private.write_audit_log('task.removed', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('title', task_row.title, 'due_date', task_row.due_date,
      'recurrence_series_id', task_row.recurrence_series_id,
      'recurrence_key', task_row.recurrence_key));
end;
$$;

create function private.update_task_details(
  p_task_id bigint, p_title text, p_description text, p_task_type text,
  p_branch_id bigint, p_due_date date, p_points numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) or
      not private.can_manage_branches(array[p_branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  if nullif(pg_catalog.btrim(p_title), '') is null or
      nullif(pg_catalog.btrim(p_description), '') is null or
      p_task_type not in ('Flyer', 'LinkedIn', 'Airtable', 'Story', 'Post') or
      p_due_date is null or p_points is null or p_points <= 0 or
      p_points in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Invalid task fields';
  end if;
  if p_points is distinct from task_row.points and (
      exists (select 1 from public.task_officer_assignments
        where task_id = p_task_id and completed_at is not null) or
      exists (select 1 from public.point_transactions
        where task_id = p_task_id and award_type = 'task')
  ) then
    raise exception 'Completed or awarded Task point settings cannot be edited';
  end if;
  update public.tasks set title = pg_catalog.btrim(p_title),
    description = pg_catalog.btrim(p_description), task_type = p_task_type,
    branch_id = p_branch_id, due_date = p_due_date, points = p_points
  where id = p_task_id;
  perform private.write_audit_log('task.updated', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('before', pg_catalog.to_jsonb(task_row),
      'after', (select pg_catalog.to_jsonb(t) from public.tasks t where id = p_task_id)));
end;
$$;

create function private.prevent_task_due_date_rewrite_after_award()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.due_date is distinct from old.due_date and (
    exists (select 1 from public.task_officer_assignments
      where task_id = old.id and completed_at is not null) or
    exists (select 1 from public.task_assignments
      where task_id = old.id and completed_at is not null) or
    exists (select 1 from public.point_transactions
      where task_id = old.id and award_type = 'task')
  ) then
    raise exception 'Completed or awarded Task due dates cannot be edited';
  end if;
  return new;
end;
$$;

create trigger task_due_date_history_guard
before update of due_date on public.tasks
for each row execute function private.prevent_task_due_date_rewrite_after_award();

revoke all on function private.prevent_task_due_date_rewrite_after_award() from public, anon, authenticated;

create function public.update_task_details(
  p_task_id bigint, p_title text, p_description text, p_task_type text,
  p_branch_id bigint, p_due_date date, p_points numeric
) returns void language sql security invoker set search_path = '' as $$
  select private.update_task_details(p_task_id, p_title, p_description,
    p_task_type, p_branch_id, p_due_date, p_points)
$$;

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
        where a.task_id = tasks.id and a.completed_at is not null)
    order by due_date, id for update skip locked
  loop
    for assignment in
      select officer_id from public.task_officer_assignments
      where task_id = task_row.id and completed_at is not null
      order by officer_id for update
    loop
      perform private.reconcile_task_award(task_row.id, assignment.officer_id, denver_today);
    end loop;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;

revoke all on function private.process_due_tasks() from public, anon, authenticated;
select cron.schedule('cappy-process-due-tasks', '* * * * *',
  'select private.process_due_tasks()');

revoke all on function private.self_assign_task(bigint),
  public.self_assign_task(bigint),
  private.bulk_assign_task_officers(bigint, bigint[]),
  public.bulk_assign_task_officers(bigint, bigint[]),
  private.set_task_assignment_completion(bigint, bigint, boolean),
  public.set_task_assignment_completion(bigint, bigint, boolean),
  private.remove_task_assignment(bigint, bigint),
  public.remove_task_assignment(bigint, bigint),
  private.update_task_details(bigint, text, text, text, bigint, date, numeric),
  public.update_task_details(bigint, text, text, text, bigint, date, numeric)
  from public, anon, authenticated;
grant execute on function private.self_assign_task(bigint),
  public.self_assign_task(bigint),
  private.bulk_assign_task_officers(bigint, bigint[]),
  public.bulk_assign_task_officers(bigint, bigint[]),
  private.set_task_assignment_completion(bigint, bigint, boolean),
  public.set_task_assignment_completion(bigint, bigint, boolean),
  private.remove_task_assignment(bigint, bigint),
  public.remove_task_assignment(bigint, bigint),
  private.update_task_details(bigint, text, text, text, bigint, date, numeric),
  public.update_task_details(bigint, text, text, text, bigint, date, numeric)
  to authenticated;
