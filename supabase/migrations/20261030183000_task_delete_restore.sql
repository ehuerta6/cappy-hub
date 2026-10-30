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

-- Preserve the existing recurring mutation contract while retaining its
-- completed/awarded Task guard for bulk removal and schedule shortening.
create or replace function private.mutate_recurring_task(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',
  p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.tasks; r public.tasks; s public.task_series;
  actor uuid := auth.uid(); payload jsonb; receipt private.recurrence_mutations;
  ids bigint[]; preserved_removed_ids bigint[]; target_series bigint; i integer := 0; day date; previous_day date;
  before_definition jsonb; after_definition jsonb; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or
    p_operation is null or p_operation not in ('edit','remove') or p_request_key is null then
    raise exception 'Invalid recurrence scope or operation'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(
    select 1 from jsonb_object_keys(p_patch) k where k not in ('title','description','task_type','branch_id','due_date','points','approval_required')) or
    exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then
    raise exception 'Invalid recurrence edit fields'; end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or
    (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or
    (p_scope<>'occurrence' and p_patch ? 'due_date') or
    ((p_rule is null)<>(p_dates is null)) then raise exception 'Invalid recurrence edit fields'; end if;
  payload := jsonb_build_object('domain','task','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,
    'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then
    if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then
      raise exception 'Idempotency key already used'; end if;
    return receipt.selected_id;
  end if;
  -- Series first, then rows in ID order. Existing workflow RPCs lock the same
  -- rows, so assignments, awards and individual mutations serialize with bulk.
  select * into s from public.task_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if s.revision is distinct from p_revision or s.retired then raise exception 'Series changed; reload and try again'; end if;
  perform 1 from public.tasks where recurrence_series_id=s.id order by id for update;
  select * into selected from public.tasks where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_branches(array[selected.branch_id]) then raise exception 'Task outside branch scope'; end if;
  if selected.removed_at is not null and p_operation='edit' then raise exception 'Task has been removed'; end if;
  select array_agg(id order by recurrence_key) into ids from public.tasks
    where recurrence_series_id=s.id and (recurrence_key<=s.ends_on or p_scope='occurrence') and
      (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if ids is null then raise exception 'Occurrence outside active schedule'; end if;
  select coalesce(array_agg(id),'{}'::bigint[]) into preserved_removed_ids from public.tasks where id=any(ids) and removed_at is not null;
  before_definition := to_jsonb(s);
  if p_rule is not null then
    perform private.assert_recurrence_dates(p_rule,p_dates);
    -- Schedule edits never bring back removed slots. Existing rows are mapped
    -- in recurrence order, including tombstones, and retain their real IDs.
    if p_scope='following' and p_dates[1]<=coalesce((select max(recurrence_key) from public.tasks
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key),'-infinity'::date) then
      raise exception 'Future schedule must remain after earlier occurrences'; end if;
    insert into public.task_series(request_key,recurrence_rule,created_by,starts_on,ends_on,parent_series_id)
      values(p_request_key,p_rule,private.current_active_officer_id(),p_dates[1],p_dates[cardinality(p_dates)],s.id) returning id into target_series;
    select max(recurrence_key) into previous_day from public.tasks
      where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
    if p_scope='following' and previous_day is not null then
      update public.task_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
        ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day,revision=revision+1 where id=s.id;
    else
      update public.task_series set retired=true,revision=revision+1 where id=s.id;
    end if;
  end if;
  foreach occurrence_id in array ids loop
    i := i+1;
    select * into r from public.tasks where id=occurrence_id;
    if not private.can_manage_branches(array[r.branch_id]) then raise exception 'Task outside branch scope'; end if;
    if p_operation='remove' or (p_rule is not null and i>cardinality(p_dates)) then
      if (p_operation='remove' and p_scope<>'occurrence') or
          (p_rule is not null and i>cardinality(p_dates)) then
        if r.removed_at is null and (
            exists(select 1 from public.task_officer_assignments a
              where a.task_id=r.id and a.completed_at is not null) or
            exists(select 1 from public.point_transactions p
              where p.task_id=r.id and p.award_type='task')) then
          raise exception 'Completed or awarded Tasks must be deleted individually';
        end if;
      end if;
      perform private.remove_task(r.id);

    elsif r.removed_at is null then

      if r.removed_at is not null then raise exception 'Task has been removed'; end if;
      if p_patch ? 'branch_id' and not private.can_manage_branches(array[(p_patch->>'branch_id')::bigint]) then
        raise exception 'Task outside branch scope'; end if;
      day := case when p_scope='occurrence' then coalesce((p_patch->>'due_date')::date,r.due_date) else r.due_date end;
      if p_rule is not null then day := p_dates[i]; end if;
      update public.tasks set title=coalesce(p_patch->>'title',r.title),description=coalesce(p_patch->>'description',r.description),
        task_type=coalesce(p_patch->>'task_type',r.task_type),branch_id=coalesce((p_patch->>'branch_id')::bigint,r.branch_id),
        due_date=day,points=coalesce((p_patch->>'points')::numeric,r.points),
        approval_required=coalesce((p_patch->>'approval_required')::boolean,r.approval_required) where id=r.id;
      perform private.write_audit_log('task.updated','task',r.id::text,
        jsonb_build_object('before',to_jsonb(r),'after',(select to_jsonb(t) from public.tasks t where id=r.id)));

    end if;
    if p_rule is not null and i<=cardinality(p_dates) then
      update public.tasks set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=r.id;
    end if;
  end loop;

  if p_rule is not null and cardinality(p_dates)>cardinality(ids) then
    for i in cardinality(ids)+1..cardinality(p_dates) loop
      if exists(with recursive ancestors as (
        select id,parent_series_id from public.task_series where id=s.id
        union all select a.id,a.parent_series_id from public.task_series a join ancestors b on a.id=b.parent_series_id
      ) select 1 from public.tasks t join ancestors a on a.id=t.recurrence_series_id
        where t.removed_at is not null and t.recurrence_key=p_dates[i]) then
        raise exception 'Schedule would recreate a removed occurrence'; end if;
      occurrence_id := private.save_task(coalesce(p_patch->>'title',selected.title),coalesce(p_patch->>'description',selected.description),
        coalesce(p_patch->>'task_type',selected.task_type),coalesce((p_patch->>'branch_id')::bigint,selected.branch_id),p_dates[i],
        coalesce((p_patch->>'points')::numeric,selected.points),coalesce((p_patch->>'approval_required')::boolean,selected.approval_required));
      update public.tasks set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=occurrence_id;
      ids := array_append(ids,occurrence_id);
    end loop;
  end if;
  if p_rule is null then
    if p_operation='remove' and p_scope<>'occurrence' then
      select max(recurrence_key) into previous_day from public.tasks
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
      if p_scope='following' and previous_day is not null then
        update public.task_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
          ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day where id=s.id;
      else update public.task_series set retired=true where id=s.id; end if;
    end if;
    update public.task_series set revision=revision+1 where id=s.id;
    target_series := s.id;
  end if;
  select to_jsonb(definition) into after_definition from public.task_series definition where id=target_series;
  perform private.write_audit_log('task.series_'||p_operation,'task_series',s.id::text,
    jsonb_build_object('selected_occurrence_id',selected.id,'boundary',selected.recurrence_key,'scope',p_scope,
      'operation',p_operation,'before',before_definition,'after',after_definition,'result_series_id',target_series,
      'original_series_after',(select to_jsonb(definition) from public.task_series definition where id=s.id),
      'affected_occurrence_ids',ids,
      'preserved_removed_occurrence_ids',preserved_removed_ids,
      'patch',p_patch,'request_key',p_request_key));
  insert into private.recurrence_mutations values(p_request_key,actor,payload,selected.id);
  return selected.id;
end;
$$;
