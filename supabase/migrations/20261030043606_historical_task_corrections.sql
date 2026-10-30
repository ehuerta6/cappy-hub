-- Historical Task corrections keep existing assignment and transaction identity.
-- No historical removal intent is inferred or backfilled.
alter table public.task_officer_assignments
  add column removed_at timestamptz,
  add column removed_by bigint references public.officers(id) on delete restrict,
  add constraint task_assignment_removal_actor check ((removed_at is null) = (removed_by is null));
alter table public.point_transactions
  add column task_reconciliation_suspended boolean not null default false,
  add constraint task_suspension_requires_removed_task check
    (not task_reconciliation_suspended or (award_type='task' and removed_at is not null));

-- Existing embedded assignment reads continue to describe the current roster.
-- Removed assignments retain completion/approval history for trusted recovery.
alter policy "Approved officers read Task officer assignments"
  on public.task_officer_assignments
  using (removed_at is null and (select private.current_active_officer_id()) is not null);

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
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.removed_at is not null then return false; end if;
  select * into assignment from public.task_officer_assignments
    where task_id = p_task_id and officer_id = p_officer_id for update;
  if not found then return false; end if;
  eligible := assignment.removed_at is null and assignment.completed_at is not null
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

create or replace function private.self_assign_task(p_task_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint := private.current_active_officer_id();
  inserted_officer bigint;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  if exists(select 1 from public.task_officer_assignments where task_id=p_task_id
      and officer_id=actor_id and removed_at is not null and completed_at is not null) then
    raise exception 'A manager must restore a completed Task assignment';
  end if;
  insert into public.task_officer_assignments(task_id, officer_id, assigned_by)
    values (p_task_id, actor_id, actor_id)
    on conflict (task_id, officer_id) do update set removed_at=null,removed_by=null
      where task_officer_assignments.removed_at is not null
    returning officer_id into inserted_officer;
  if inserted_officer is not null then
    perform private.write_audit_log('task.officer_added', 'task', p_task_id::text,
      pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
        'officer_id', actor_id, 'actor_id', actor_id, 'self_assigned', true));
  end if;
  perform private.reconcile_task_award(p_task_id,actor_id,(pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
end;
$$;

create or replace function private.bulk_assign_task_officers(p_task_id bigint, p_officer_ids bigint[])
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
    on conflict (task_id, officer_id) do update set removed_at=null,removed_by=null
      where task_officer_assignments.removed_at is not null
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
    perform private.reconcile_task_award(p_task_id,target_id,(pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  end loop;
  return pg_catalog.jsonb_build_object(
    'added_officer_ids', added_ids, 'already_assigned_officer_ids', already_ids);
end;
$$;

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

end;
$$;

create or replace function private.remove_task_assignment(p_task_id bigint, p_officer_id bigint)
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
  if assignment.removed_at is not null then return; end if;
  update public.task_officer_assignments set removed_at=pg_catalog.clock_timestamp(),removed_by=actor_id
    where task_id=p_task_id and officer_id=p_officer_id;
  perform private.reconcile_task_award(p_task_id,p_officer_id,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  perform private.write_audit_log('task.officer_removed', 'task', p_task_id::text,
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'task_title', task_row.title,
      'officer_id', p_officer_id, 'actor_id', actor_id,
      'before', pg_catalog.to_jsonb(assignment),
      'after',(select pg_catalog.to_jsonb(a) from public.task_officer_assignments a where task_id=p_task_id and officer_id=p_officer_id)));

end;
$$;

create or replace function private.update_task_details(p_task_id bigint,p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,p_points numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint:=private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) or not private.can_manage_branches(array[p_branch_id]) then raise exception 'Task outside branch scope'; end if;
  if exists(select 1 from public.branches where id=p_branch_id and not is_active and id<>task_row.branch_id) then raise exception 'Invalid or retired branch'; end if;
  if nullif(pg_catalog.btrim(p_title),'') is null or nullif(pg_catalog.btrim(p_description),'') is null or p_task_type not in ('Flyer','LinkedIn','Airtable','Story','Post') or p_due_date is null or p_points is null or p_points<=0 or p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Invalid task fields'; end if;
  update public.tasks set title=pg_catalog.btrim(p_title),description=pg_catalog.btrim(p_description),task_type=p_task_type,branch_id=p_branch_id,due_date=p_due_date,points=p_points where id=p_task_id;
  perform private.write_audit_log('task.updated','task',p_task_id::text,pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(task_row),'after',(select pg_catalog.to_jsonb(t) from public.tasks t where id=p_task_id)));
end;
$$;

-- Replace only the superseded due-date restriction trigger; no rows or public APIs are removed.
drop trigger task_due_date_history_guard on public.tasks;
create or replace function private.reconcile_task_details_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; award public.point_transactions%rowtype;
begin
  if new.due_date is not distinct from old.due_date and new.points is not distinct from old.points then return new; end if;
  -- A deliberate correction of the Task fixed value updates dependent awards.
  -- Routine processing/descriptive edits never overwrite historical direct edits.
  if new.points is distinct from old.points then
    for award in select * from public.point_transactions
      where task_id=new.id and award_type='task'
        and (removed_at is null or task_reconciliation_suspended)
        and points is distinct from new.points order by id for update
    loop
      update public.point_transactions set points=new.points,updated_at=pg_catalog.clock_timestamp(),
        updated_by=auth.uid(),updated_by_officer_id=null where id=award.id;
      perform private.write_audit_log('points.task_updated','point_transaction',award.id::text,
        pg_catalog.jsonb_build_object('task_id',new.id,'task_title',new.title,'officer_id',award.officer_id,
          'before',pg_catalog.to_jsonb(award),
          'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=award.id)));
    end loop;
  end if;
  for a in select officer_id from public.task_officer_assignments where task_id=new.id order by officer_id loop
    perform private.reconcile_task_award(new.id,a.officer_id,
      (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date);
  end loop;
  return new;
end;
$$;
revoke all on function private.reconcile_task_details_change() from public,anon,authenticated;
create trigger task_details_reconcile_awards after update of due_date,points on public.tasks
  for each row execute function private.reconcile_task_details_change();

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
        where a.task_id = tasks.id and a.completed_at is not null and a.removed_at is null)
    order by due_date, id for update skip locked
  loop
    for assignment in
      select officer_id from public.task_officer_assignments
      where task_id = task_row.id and completed_at is not null and removed_at is null
      order by officer_id for update
    loop
      perform private.reconcile_task_award(task_row.id, assignment.officer_id, denver_today);
    end loop;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;

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

-- An explicit Admin removal overrides a prior mechanical suspension. Keeping
-- this intent separate prevents due-date/completion recovery from reviving it.
create or replace function private.remove_point_transaction(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_row public.point_transactions; task_id_to_lock bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select task_id into task_id_to_lock from public.point_transactions where id=p_transaction_id;
  if task_id_to_lock is not null then
    perform 1 from public.tasks where id=task_id_to_lock for update;
  end if;
  select * into old_row from public.point_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if old_row.removed_at is not null and not old_row.task_reconciliation_suspended then return false; end if;
  update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
    removed_by=auth.uid(),task_reconciliation_suspended=false where id=p_transaction_id;
  perform private.write_audit_log('points.transaction_removed','point_transaction',
    p_transaction_id::text,pg_catalog.jsonb_build_object(
      'before',pg_catalog.to_jsonb(old_row),'removed_by',auth.uid()));
  return true;
end;
$$;
