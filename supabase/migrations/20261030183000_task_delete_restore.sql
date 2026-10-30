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
  if task_row.removed_at is null then return; end if;

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

-- Recurring series operations retain the former protection for completed or
-- awarded occurrences. Single-occurrence Delete remains available through
-- remove_task; only recurring bulk removal and schedule shortening are guarded.
alter function private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])
  rename to mutate_recurring_task_unchecked;
revoke all on function private.mutate_recurring_task_unchecked(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])
  from public,anon,authenticated;

create function private.mutate_recurring_task(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',
  p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  series_row public.task_series%rowtype;
  selected public.tasks%rowtype;
  receipt private.recurrence_mutations%rowtype;
  actor uuid := auth.uid();
  payload jsonb;
  occurrence_ids bigint[];
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or
      p_operation is null or p_operation not in ('edit','remove') or p_request_key is null then
    raise exception 'Invalid recurrence scope or operation';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(
      select 1 from jsonb_object_keys(p_patch) key_name
      where key_name not in ('title','description','task_type','branch_id','due_date','points','approval_required')) or
      exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then
    raise exception 'Invalid recurrence edit fields';
  end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or
      (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or
      (p_scope<>'occurrence' and p_patch ? 'due_date') or
      ((p_rule is null)<>(p_dates is null)) then
    raise exception 'Invalid recurrence edit fields';
  end if;
  payload := jsonb_build_object('domain','task','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,
    'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then
    if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then
      raise exception 'Idempotency key already used';
    end if;
    return receipt.selected_id;
  end if;
  select * into series_row from public.task_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if series_row.revision is distinct from p_revision or series_row.retired then
    raise exception 'Series changed; reload and try again';
  end if;
  perform 1 from public.tasks where recurrence_series_id=series_row.id order by id for update;
  select * into selected from public.tasks where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from series_row.id then
    raise exception 'Occurrence does not belong to this series';
  end if;
  if not private.can_manage_branches(array[selected.branch_id]) then
    raise exception 'Task outside branch scope';
  end if;
  select array_agg(id order by recurrence_key) into occurrence_ids
    from public.tasks
    where recurrence_series_id=series_row.id and
      (recurrence_key<=series_row.ends_on or p_scope='occurrence') and
      (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if occurrence_ids is null then raise exception 'Occurrence outside active schedule'; end if;

  if p_operation='remove' and p_scope<>'occurrence' then
    if exists(
      select 1 from public.tasks t where t.id=any(occurrence_ids)
        and not private.can_manage_branches(array[t.branch_id])
    ) then raise exception 'Task outside branch scope'; end if;
    if exists(
      select 1 from public.tasks t where t.id=any(occurrence_ids) and t.removed_at is null
        and (exists(select 1 from public.task_officer_assignments a
              where a.task_id=t.id and a.completed_at is not null)
          or exists(select 1 from public.point_transactions p
              where p.task_id=t.id and p.award_type='task'))
    ) then raise exception 'Completed or awarded Tasks must be deleted individually'; end if;
  elsif p_operation='edit' and p_rule is not null and cardinality(p_dates)<cardinality(occurrence_ids) then
    if exists(
      select 1 from unnest(occurrence_ids) with ordinality target(id,ordinal)
        join public.tasks t on t.id=target.id
      where target.ordinal>cardinality(p_dates) and not private.can_manage_branches(array[t.branch_id])
    ) then raise exception 'Task outside branch scope'; end if;
    if exists(
      select 1 from unnest(occurrence_ids) with ordinality target(id,ordinal)
        join public.tasks t on t.id=target.id
      where target.ordinal>cardinality(p_dates) and t.removed_at is null
        and (exists(select 1 from public.task_officer_assignments a
              where a.task_id=t.id and a.completed_at is not null)
          or exists(select 1 from public.point_transactions p
              where p.task_id=t.id and p.award_type='task'))
    ) then raise exception 'Completed or awarded Tasks must be deleted individually'; end if;
  end if;

  return private.mutate_recurring_task_unchecked(
    p_selected_id,p_scope,p_operation,p_request_key,p_series_id,p_revision,p_patch,p_rule,p_dates);
end;
$$;

create or replace function public.mutate_recurring_task(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_task(p_selected_id,p_scope,p_operation,p_request_key,
    p_series_id,p_revision,p_patch,p_rule,p_dates)
$$;
revoke all on function private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])
  from public,anon,authenticated;
grant execute on function private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[])
  to authenticated;
