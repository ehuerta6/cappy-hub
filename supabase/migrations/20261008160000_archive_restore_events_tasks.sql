-- Archiving keeps the original occurrence and all related workflow history.
create or replace function private.remove_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare old_event public.events; branch_ids bigint[];
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into old_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if old_event.deleted_at is not null then return false; end if;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into branch_ids from public.event_branches where event_id=p_event_id;
  update public.events set deleted_at=pg_catalog.clock_timestamp(),deleted_by=auth.uid()
    where id=p_event_id;
  perform private.write_audit_log('event.archived','event',p_event_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(old_event),
      'branch_ids',branch_ids,'signup_count',
      (select count(*) from public.event_officers where event_id=p_event_id),
      'point_count',(select count(*) from public.point_transactions where event_id=p_event_id),
      'archived_by',auth.uid()));
  return true;
end;
$$;

create or replace function private.restore_event_archive(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_event public.events%rowtype;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into old_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if old_event.deleted_at is null then raise exception 'Event is not archived'; end if;
  update public.events set deleted_at=null,deleted_by=null where id=p_event_id;
  perform private.write_audit_log('event.restored','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',old_event.name,'event_date',old_event.event_date,
      'status',old_event.status,'recurrence_series_id',old_event.recurrence_series_id,
      'recurrence_key',old_event.recurrence_key,'archived_at',old_event.deleted_at,
      'archived_by',old_event.deleted_by));
end;
$$;

create function public.restore_event_archive(p_event_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_event_archive(p_event_id)
$$;

create or replace function private.remove_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope'; end if;
  if task_row.removed_at is not null then return; end if;
  if exists(select 1 from public.task_officer_assignments
      where task_id=p_task_id and completed_at is not null)
    or exists(select 1 from public.point_transactions
      where task_id=p_task_id and award_type='task') then
    raise exception 'Completed or awarded Tasks cannot be archived';
  end if;
  update public.tasks set removed_at=pg_catalog.clock_timestamp(),removed_by=actor_id where id=p_task_id;
  perform private.write_audit_log('task.archived','task',p_task_id::text,
    pg_catalog.jsonb_build_object('title',task_row.title,'due_date',task_row.due_date,
      'recurrence_series_id',task_row.recurrence_series_id,
      'recurrence_key',task_row.recurrence_key,'assignment_count',
      (select count(*) from public.task_officer_assignments where task_id=p_task_id),
      'point_count',(select count(*) from public.point_transactions where task_id=p_task_id)));
end;
$$;

create or replace function public.remove_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.remove_task(p_task_id)
$$;

create function private.restore_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then raise exception 'Task outside branch scope'; end if;
  if task_row.removed_at is null then raise exception 'Task is not archived'; end if;
  update public.tasks set removed_at=null,removed_by=null where id=p_task_id;
  perform private.write_audit_log('task.restored','task',p_task_id::text,
    pg_catalog.jsonb_build_object('title',task_row.title,'due_date',task_row.due_date,
      'branch_id',task_row.branch_id,'recurrence_series_id',task_row.recurrence_series_id,
      'recurrence_key',task_row.recurrence_key,'archived_at',task_row.removed_at,
      'archived_by',task_row.removed_by,'assignment_count',
      (select count(*) from public.task_officer_assignments where task_id=p_task_id),
      'point_count',(select count(*) from public.point_transactions where task_id=p_task_id)));
end;
$$;

create function public.restore_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_task(p_task_id)
$$;

revoke all on function private.restore_event_archive(bigint),public.restore_event_archive(bigint),
  private.restore_task(bigint),public.restore_task(bigint),private.remove_task(bigint),public.remove_task(bigint)
  from public,anon,authenticated;
grant execute on function private.restore_event_archive(bigint),private.restore_task(bigint),private.remove_task(bigint)
  to authenticated;
grant execute on function public.restore_event_archive(bigint),public.restore_task(bigint),public.remove_task(bigint)
  to authenticated;
