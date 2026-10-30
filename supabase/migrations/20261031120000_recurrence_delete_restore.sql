-- Recurrence lifecycle batches retain exact ownership of each deleted
-- occurrence. This lets Restore select an explicit scope without reviving an
-- occurrence that was deleted independently after an earlier batch.
create table private.recurrence_lifecycle_mutations (
  request_key uuid primary key,
  actor_id uuid not null,
  payload jsonb not null,
  domain text not null check (domain in ('event','task')),
  operation text not null check (operation in ('delete','restore')),
  series_id bigint not null,
  selected_id bigint not null,
  affected_ids bigint[] not null
);

create table private.recurrence_lifecycle_occurrences (
  domain text not null check (domain in ('event','task')),
  occurrence_id bigint not null,
  delete_request_key uuid not null references private.recurrence_lifecycle_mutations(request_key)
    deferrable initially deferred,
  primary key (domain, occurrence_id)
);
revoke all on private.recurrence_lifecycle_mutations, private.recurrence_lifecycle_occurrences
  from public, anon, authenticated;

create function private.mutate_recurring_event_lifecycle(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer
) returns bigint[] language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); payload jsonb; saved private.recurrence_lifecycle_mutations;
  standard_receipt private.recurrence_mutations;
  s public.event_series; selected public.events; r public.events; batch_key uuid;
  candidate_ids bigint[]; changed_ids bigint[]:='{}'::bigint[]; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope not in ('occurrence','following','series') or p_operation not in ('delete','restore') or
    p_request_key is null then raise exception 'Invalid recurrence lifecycle request'; end if;
  payload:=jsonb_build_object('domain','event','selected_id',p_selected_id,'scope',p_scope,
    'operation',p_operation,'series_id',p_series_id,'revision',p_revision);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,68));
  select * into saved from private.recurrence_lifecycle_mutations where request_key=p_request_key;
  if found then
    if saved.actor_id is distinct from actor or saved.payload is distinct from payload then
      raise exception 'Idempotency key already used'; end if;
    return saved.affected_ids;
  end if;
  select * into standard_receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then raise exception 'Idempotency key already used'; end if;
  select * into s from public.event_series where id=p_series_id for update;
  if not found or s.revision is distinct from p_revision then
    raise exception 'Series changed; reload and try again'; end if;
  if s.retired and p_operation='delete' then raise exception 'Series is no longer active'; end if;
  perform 1 from public.events where recurrence_series_id=s.id order by id for update;
  select * into selected from public.events where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then
    raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_event(selected.id) then raise exception 'Event outside branch scope'; end if;
  select array_agg(e.id order by e.recurrence_key,e.id) into candidate_ids
    from public.events e where e.recurrence_series_id=s.id
      and (p_scope='occurrence' or e.recurrence_key<=s.ends_on)
      and (p_scope='series' or (p_scope='following' and e.recurrence_key>=selected.recurrence_key)
        or e.id=selected.id);
  if candidate_ids is null then raise exception 'Occurrence outside active schedule'; end if;
  -- Authorize the complete requested scope before any row changes.
  for r in select * from public.events where id=any(candidate_ids) order by id loop
    if not private.can_manage_event(r.id) then raise exception 'Event outside branch scope'; end if;
  end loop;
  if p_operation='delete' then
    if selected.deleted_at is not null then raise exception 'Selected Event is already deleted'; end if;
    foreach occurrence_id in array candidate_ids loop
      select * into r from public.events where id=occurrence_id;
      if r.deleted_at is null then
        perform private.delete_event(r.id);
        insert into private.recurrence_lifecycle_occurrences(domain,occurrence_id,delete_request_key)
          values('event',r.id,p_request_key);
        changed_ids:=array_append(changed_ids,r.id);
      end if;
    end loop;
  else
    select owner.delete_request_key into batch_key
      from private.recurrence_lifecycle_occurrences owner
      join public.events e on e.id=owner.occurrence_id
      where owner.domain='event' and owner.occurrence_id=selected.id and e.deleted_at is not null;
    if batch_key is null and p_scope<>'occurrence' then
      raise exception 'Choose an occurrence from a scoped Delete to restore this range'; end if;
    for r in select e.* from public.events e
      join private.recurrence_lifecycle_occurrences owner
        on owner.domain='event' and owner.occurrence_id=e.id and owner.delete_request_key=batch_key
      where e.id=any(candidate_ids) and e.deleted_at is not null order by e.recurrence_key,e.id
    loop
      if not private.can_manage_event(r.id) then raise exception 'Event outside branch scope'; end if;
      perform private.restore_deleted_event(r.id);
      delete from private.recurrence_lifecycle_occurrences owner
        where owner.domain='event' and owner.occurrence_id=r.id
          and owner.delete_request_key=batch_key;
      changed_ids:=array_append(changed_ids,r.id);
    end loop;
    if cardinality(changed_ids)=0 and batch_key is null then
      -- Compatibility for occurrences deleted before this migration. Such
      -- rows may be restored one at a time, never as an inferred range.
      perform private.restore_deleted_event(selected.id);
      changed_ids:=array[selected.id];
    end if;
  end if;
  update public.event_series set revision=revision+1 where id=s.id;
  perform private.write_audit_log('event.series_'||p_operation,'event_series',s.id::text,
    pg_catalog.jsonb_build_object('selected_occurrence_id',selected.id,'scope',p_scope,
      'operation',p_operation,'affected_occurrence_ids',changed_ids,'request_key',p_request_key,
      'revision_before',s.revision,'revision_after',s.revision+1));
  insert into private.recurrence_lifecycle_mutations values
    (p_request_key,actor,payload,'event',p_operation,s.id,selected.id,changed_ids);
  insert into private.recurrence_mutations(request_key,actor_id,payload,selected_id)
    values(p_request_key,actor,payload,selected.id);
  return changed_ids;
end;
$$;

create function public.mutate_recurring_event_lifecycle(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer
) returns bigint[] language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_event_lifecycle(p_selected_id,p_scope,p_operation,p_request_key,p_series_id,p_revision)
$$;

create function private.mutate_recurring_task_lifecycle(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer
) returns bigint[] language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); payload jsonb; saved private.recurrence_lifecycle_mutations;
  standard_receipt private.recurrence_mutations;
  s public.task_series; selected public.tasks; r public.tasks; batch_key uuid;
  candidate_ids bigint[]; changed_ids bigint[]:='{}'::bigint[]; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope not in ('occurrence','following','series') or p_operation not in ('delete','restore') or
    p_request_key is null then raise exception 'Invalid recurrence lifecycle request'; end if;
  payload:=jsonb_build_object('domain','task','selected_id',p_selected_id,'scope',p_scope,
    'operation',p_operation,'series_id',p_series_id,'revision',p_revision);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,68));
  select * into saved from private.recurrence_lifecycle_mutations where request_key=p_request_key;
  if found then
    if saved.actor_id is distinct from actor or saved.payload is distinct from payload then
      raise exception 'Idempotency key already used'; end if;
    return saved.affected_ids;
  end if;
  select * into standard_receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then raise exception 'Idempotency key already used'; end if;
  select * into s from public.task_series where id=p_series_id for update;
  if not found or s.revision is distinct from p_revision then
    raise exception 'Series changed; reload and try again'; end if;
  if s.retired and p_operation='delete' then raise exception 'Series is no longer active'; end if;
  perform 1 from public.tasks where recurrence_series_id=s.id order by id for update;
  select * into selected from public.tasks where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then
    raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_branches(array[selected.branch_id]) then raise exception 'Task outside branch scope'; end if;
  select array_agg(t.id order by t.recurrence_key,t.id) into candidate_ids
    from public.tasks t where t.recurrence_series_id=s.id
      and (p_scope='occurrence' or t.recurrence_key<=s.ends_on)
      and (p_scope='series' or (p_scope='following' and t.recurrence_key>=selected.recurrence_key)
        or t.id=selected.id);
  if candidate_ids is null then raise exception 'Occurrence outside active schedule'; end if;
  for r in select * from public.tasks where id=any(candidate_ids) order by id loop
    if not private.can_manage_branches(array[r.branch_id]) then raise exception 'Task outside branch scope'; end if;
  end loop;
  if p_operation='delete' then
    if selected.removed_at is not null then raise exception 'Selected Task is already deleted'; end if;
    foreach occurrence_id in array candidate_ids loop
      select * into r from public.tasks where id=occurrence_id;
      if r.removed_at is null then
        perform private.remove_task(r.id);
        insert into private.recurrence_lifecycle_occurrences(domain,occurrence_id,delete_request_key)
          values('task',r.id,p_request_key);
        changed_ids:=array_append(changed_ids,r.id);
      end if;
    end loop;
  else
    select owner.delete_request_key into batch_key
      from private.recurrence_lifecycle_occurrences owner
      join public.tasks t on t.id=owner.occurrence_id
      where owner.domain='task' and owner.occurrence_id=selected.id and t.removed_at is not null;
    if batch_key is null and p_scope<>'occurrence' then
      raise exception 'Choose an occurrence from a scoped Delete to restore this range'; end if;
    for r in select t.* from public.tasks t
      join private.recurrence_lifecycle_occurrences owner
        on owner.domain='task' and owner.occurrence_id=t.id and owner.delete_request_key=batch_key
      where t.id=any(candidate_ids) and t.removed_at is not null order by t.recurrence_key,t.id
    loop
      if not private.can_manage_branches(array[r.branch_id]) then raise exception 'Task outside branch scope'; end if;
      perform private.restore_task(r.id);
      delete from private.recurrence_lifecycle_occurrences owner
        where owner.domain='task' and owner.occurrence_id=r.id
          and owner.delete_request_key=batch_key;
      changed_ids:=array_append(changed_ids,r.id);
    end loop;
    if cardinality(changed_ids)=0 and batch_key is null then
      perform private.restore_task(selected.id);
      changed_ids:=array[selected.id];
    end if;
  end if;
  update public.task_series set revision=revision+1 where id=s.id;
  perform private.write_audit_log('task.series_'||p_operation,'task_series',s.id::text,
    pg_catalog.jsonb_build_object('selected_occurrence_id',selected.id,'scope',p_scope,
      'operation',p_operation,'affected_occurrence_ids',changed_ids,'request_key',p_request_key,
      'revision_before',s.revision,'revision_after',s.revision+1));
  insert into private.recurrence_lifecycle_mutations values
    (p_request_key,actor,payload,'task',p_operation,s.id,selected.id,changed_ids);
  insert into private.recurrence_mutations(request_key,actor_id,payload,selected_id)
    values(p_request_key,actor,payload,selected.id);
  return changed_ids;
end;
$$;

create function public.mutate_recurring_task_lifecycle(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer
) returns bigint[] language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_task_lifecycle(p_selected_id,p_scope,p_operation,p_request_key,p_series_id,p_revision)
$$;

revoke all on function private.mutate_recurring_event_lifecycle(bigint,text,text,uuid,bigint,integer),
  public.mutate_recurring_event_lifecycle(bigint,text,text,uuid,bigint,integer),
  private.mutate_recurring_task_lifecycle(bigint,text,text,uuid,bigint,integer),
  public.mutate_recurring_task_lifecycle(bigint,text,text,uuid,bigint,integer)
  from public,anon,authenticated;
grant execute on function private.mutate_recurring_event_lifecycle(bigint,text,text,uuid,bigint,integer),
  public.mutate_recurring_event_lifecycle(bigint,text,text,uuid,bigint,integer),
  private.mutate_recurring_task_lifecycle(bigint,text,text,uuid,bigint,integer),
  public.mutate_recurring_task_lifecycle(bigint,text,text,uuid,bigint,integer)
  to authenticated;
