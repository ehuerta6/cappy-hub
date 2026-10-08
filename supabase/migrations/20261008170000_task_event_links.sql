create table public.task_events (
  task_id bigint not null references public.tasks(id) on delete restrict,
  event_id bigint not null references public.events(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (task_id, event_id)
);

create index task_events_event_id_task_id_idx on public.task_events(event_id, task_id);

alter table public.task_events enable row level security;
revoke all on public.task_events from public, anon, authenticated;
grant select on public.task_events to authenticated;
create policy "Approved officers read Task Event links" on public.task_events
  for select to authenticated
  using ((select private.current_active_officer_id()) is not null);

create function private.set_task_event_links(p_task_ids bigint[], p_event_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id bigint := private.current_active_officer_id();
  ordered_task_ids bigint[];
  current_task_id bigint;
  task_row public.tasks%rowtype;
  added_events jsonb;
  removed_events jsonb;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_task_ids is null or cardinality(p_task_ids) < 1 or cardinality(p_task_ids) > 500 or
    exists(select 1 from unnest(p_task_ids) ids(id) where id is null) or
    cardinality(p_task_ids) <> (select count(distinct id) from unnest(p_task_ids) ids(id)) or
    p_event_ids is null or cardinality(p_event_ids) > 500 or
    exists(select 1 from unnest(p_event_ids) ids(id) where id is null) or
    cardinality(p_event_ids) <> (select count(distinct id) from unnest(p_event_ids) ids(id)) then
    raise exception 'Invalid Task Event links';
  end if;
  if exists(select 1 from unnest(p_event_ids) ids(id) left join public.events e on e.id=ids.id where e.id is null) then
    raise exception 'Event not found';
  end if;
  select array_agg(id order by id) into ordered_task_ids from unnest(p_task_ids) ids(id);

  foreach current_task_id in array ordered_task_ids loop
    select * into task_row from public.tasks where id=current_task_id for update;
    if not found then raise exception 'Task not found'; end if;
    if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
    if not private.can_manage_branches(array[task_row.branch_id]) then raise exception 'Task outside branch scope'; end if;

    if exists(select 1 from unnest(p_event_ids) ids(id) join public.events e on e.id=ids.id
      where not exists(select 1 from public.task_events te where te.task_id=current_task_id and te.event_id=e.id)
        and (e.deleted_at is not null or e.status='cancelled')) then
      raise exception 'Archived or cancelled Events cannot be newly linked';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name,e.id),'[]'::jsonb)
      into added_events from public.events e join unnest(p_event_ids) ids(id) on ids.id=e.id
      where not exists(select 1 from public.task_events te where te.task_id=current_task_id and te.event_id=e.id);
    select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name,e.id),'[]'::jsonb)
      into removed_events from public.events e join public.task_events te on te.event_id=e.id
      where te.task_id=current_task_id and not (e.id=any(p_event_ids));

    if added_events <> '[]'::jsonb or removed_events <> '[]'::jsonb then
      delete from public.task_events where task_events.task_id=current_task_id and not (event_id=any(p_event_ids));
      insert into public.task_events(task_id,event_id)
        select current_task_id,ids.id from unnest(p_event_ids) ids(id)
        on conflict(task_id,event_id) do nothing;
      perform private.write_audit_log('task.event_links_updated','task',current_task_id::text,
        jsonb_build_object('added_events',added_events,'removed_events',removed_events));
      update public.audit_logs set details=details ||
        jsonb_build_object('added_events',added_events,'removed_events',removed_events)
      where id=(select l.id from public.audit_logs l
        where l.entity_type='task' and l.entity_id=current_task_id::text
          and l.actor_id=auth.uid() and l.action in ('task.created','task.updated')
        order by l.created_at desc,l.id desc limit 1);
    end if;
  end loop;
end;
$$;

create function public.set_task_event_links(p_task_ids bigint[], p_event_ids bigint[])
returns void language sql security invoker set search_path = '' as $$
  select private.set_task_event_links(p_task_ids,p_event_ids)
$$;

revoke all on function private.set_task_event_links(bigint[],bigint[]),
  public.set_task_event_links(bigint[],bigint[]) from public,anon,authenticated;
grant execute on function public.set_task_event_links(bigint[],bigint[]) to authenticated;
grant execute on function private.set_task_event_links(bigint[],bigint[]) to authenticated;

create function private.save_task_with_events(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,
  p_points numeric,p_approval_required boolean,p_event_ids bigint[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare task_id bigint;
begin
  task_id := private.save_task(p_title,p_description,p_task_type,p_branch_id,p_due_date,p_points,p_approval_required);
  perform private.set_task_event_links(array[task_id],p_event_ids);
  return task_id;
end;
$$;
create function public.save_task_with_events(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,
  p_points numeric,p_approval_required boolean,p_event_ids bigint[]
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_task_with_events(p_title,p_description,p_task_type,p_branch_id,p_due_date,p_points,p_approval_required,p_event_ids)
$$;

create function private.create_recurring_task_with_events(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[],p_event_ids bigint[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare first_task_id bigint; series_id bigint; task_ids bigint[];
begin
  first_task_id := private.create_recurring_task(p_title,p_description,p_task_type,p_branch_id,p_points,
    p_approval_required,p_request_key,p_recurrence_rule,p_due_dates);
  select recurrence_series_id into series_id from public.tasks where id=first_task_id;
  select array_agg(id order by recurrence_key) into task_ids from public.tasks
    where recurrence_series_id=series_id and removed_at is null;
  perform private.set_task_event_links(task_ids,p_event_ids);
  return first_task_id;
end;
$$;
create function public.create_recurring_task_with_events(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[],p_event_ids bigint[]
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_recurring_task_with_events(p_title,p_description,p_task_type,p_branch_id,p_points,
    p_approval_required,p_request_key,p_recurrence_rule,p_due_dates,p_event_ids)
$$;

create function private.update_task_details_with_events(
  p_task_id bigint,p_title text,p_description text,p_task_type text,p_branch_id bigint,
  p_due_date date,p_points numeric,p_event_ids bigint[]
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.update_task_details(p_task_id,p_title,p_description,p_task_type,p_branch_id,p_due_date,p_points);
  perform private.set_task_event_links(array[p_task_id],p_event_ids);
end;
$$;
create function public.update_task_details_with_events(
  p_task_id bigint,p_title text,p_description text,p_task_type text,p_branch_id bigint,
  p_due_date date,p_points numeric,p_event_ids bigint[]
) returns void language sql security invoker set search_path = '' as $$
  select private.update_task_details_with_events(p_task_id,p_title,p_description,p_task_type,p_branch_id,p_due_date,p_points,p_event_ids)
$$;

create function private.mutate_recurring_task_with_events(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,p_series_id bigint,
  p_revision integer,p_patch jsonb default '{}'::jsonb,p_rule text default null,
  p_dates date[] default null,p_event_ids bigint[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.tasks%rowtype; series_row public.task_series%rowtype; task_ids bigint[]; result_id bigint;
  target_series_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into series_row from public.task_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  perform 1 from public.tasks where recurrence_series_id=p_series_id order by id for update;
  select * into selected from public.tasks where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from p_series_id then
    raise exception 'Occurrence does not belong to this series';
  end if;
  select coalesce(array_agg(id order by recurrence_key),'{}'::bigint[]) into task_ids
  from public.tasks where recurrence_series_id=p_series_id and removed_at is null
    and recurrence_key<=series_row.ends_on
    and (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key)
      or (p_scope='occurrence' and id=p_selected_id));
  result_id := private.mutate_recurring_task(p_selected_id,p_scope,p_operation,p_request_key,
    p_series_id,p_revision,p_patch,p_rule,p_dates);
  if p_rule is not null and p_scope<>'occurrence' then
    select recurrence_series_id into target_series_id from public.tasks where id=p_selected_id;
    select coalesce(array_agg(id order by recurrence_key),'{}'::bigint[]) into task_ids
      from public.tasks where recurrence_series_id=target_series_id and removed_at is null;
  end if;
  if p_event_ids is not null then
    perform private.set_task_event_links(task_ids,p_event_ids);
  end if;
  return result_id;
end;
$$;
create function public.mutate_recurring_task_with_events(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,p_series_id bigint,
  p_revision integer,p_patch jsonb default '{}'::jsonb,p_rule text default null,
  p_dates date[] default null,p_event_ids bigint[] default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_task_with_events(p_selected_id,p_scope,p_operation,p_request_key,
    p_series_id,p_revision,p_patch,p_rule,p_dates,p_event_ids)
$$;

revoke all on function private.save_task_with_events(text,text,text,bigint,date,numeric,boolean,bigint[]),
  public.save_task_with_events(text,text,text,bigint,date,numeric,boolean,bigint[]),
  private.create_recurring_task_with_events(text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[]),
  public.create_recurring_task_with_events(text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[]),
  private.update_task_details_with_events(bigint,text,text,text,bigint,date,numeric,bigint[]),
  public.update_task_details_with_events(bigint,text,text,text,bigint,date,numeric,bigint[]),
  private.mutate_recurring_task_with_events(bigint,text,text,uuid,bigint,integer,jsonb,text,date[],bigint[]),
  public.mutate_recurring_task_with_events(bigint,text,text,uuid,bigint,integer,jsonb,text,date[],bigint[])
  from public,anon,authenticated;
grant execute on function public.save_task_with_events(text,text,text,bigint,date,numeric,boolean,bigint[]),
  public.create_recurring_task_with_events(text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[]),
  public.update_task_details_with_events(bigint,text,text,text,bigint,date,numeric,bigint[]),
  public.mutate_recurring_task_with_events(bigint,text,text,uuid,bigint,integer,jsonb,text,date[],bigint[])
  to authenticated;
grant execute on function private.save_task_with_events(text,text,text,bigint,date,numeric,boolean,bigint[]),
  private.create_recurring_task_with_events(text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[]),
  private.update_task_details_with_events(bigint,text,text,text,bigint,date,numeric,bigint[]),
  private.mutate_recurring_task_with_events(bigint,text,text,uuid,bigint,integer,jsonb,text,date[],bigint[])
  to authenticated;
