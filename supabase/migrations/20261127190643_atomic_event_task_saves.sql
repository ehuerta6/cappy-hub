-- New save endpoints keep the previous RPCs available during rollout.
create table private.atomic_save_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  request_key uuid not null,
  payload jsonb not null,
  result_id bigint not null,
  calendar_event_ids bigint[],
  primary key (actor_id, operation, request_key)
);
revoke all on private.atomic_save_receipts from public, anon, authenticated;

create function private.atomic_save_result(p_operation text, p_key uuid, p_payload jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare receipt private.atomic_save_receipts;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_key is null then raise exception 'Missing save request key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text || ':' || p_operation || ':' || p_key::text, 0)
  );
  select * into receipt from private.atomic_save_receipts
    where actor_id = auth.uid() and operation = p_operation and request_key = p_key;
  if not found then return null; end if;
  if receipt.payload is distinct from p_payload then
    raise exception 'Save request was already used with different details';
  end if;
  return receipt.result_id;
end;
$$;
revoke all on function private.atomic_save_result(text, uuid, jsonb) from public, anon, authenticated;

create function private.saved_recurrence_occurrences(p_action text, p_key uuid, p_exclude_preserved_removed boolean default false)
returns bigint[] language plpgsql set search_path = '' as $$
declare ids bigint[];
begin
  -- The core mutation records the stable IDs, including any new materialized rows.
  select array_agg(item.value::bigint order by item.ordinality) into ids
  from public.audit_logs log
  cross join lateral jsonb_array_elements_text(log.details->'affected_occurrence_ids')
    with ordinality as item(value, ordinality)
  where log.actor_id = auth.uid() and log.action = p_action
    and log.details->>'request_key' = p_key::text
    and (not p_exclude_preserved_removed or not exists (
      select 1 from jsonb_array_elements_text(
        coalesce(log.details->'preserved_removed_occurrence_ids', '[]'::jsonb)
      ) removed(id) where removed.id = item.value
    ));
  if ids is null then raise exception 'Recurring save scope not found'; end if;
  return ids;
end;
$$;
revoke all on function private.saved_recurrence_occurrences(text, uuid, boolean) from public, anon, authenticated;

create function private.apply_event_save_settings(p_ids bigint[], p_settings jsonb)
returns void language plpgsql set search_path = '' as $$
declare target public.events; ids bigint[] := '{}';
  audience record;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
      or p_settings - array['audience', 'reminder_offsets'] <> '{}'::jsonb then
    raise exception 'Invalid Event settings';
  end if;
  if p_settings = '{}'::jsonb then return; end if;
  for target in select * from public.events
    where id = any(p_ids) and deleted_at is null order by id for update
  loop
    if not private.can_edit_event(target.id) then raise exception 'Event outside branch scope'; end if;
    perform private.assert_event_period_writable(target.event_date);
    ids := array_append(ids, target.id);
  end loop;
  if p_settings ? 'audience' then
    select * into audience from jsonb_to_record(p_settings->'audience')
      as a(all_active boolean, branch_ids bigint[], position_ids bigint[]);
    if audience.all_active is null or audience.branch_ids is null or audience.position_ids is null then
      raise exception 'Invalid Event audience';
    end if;
    delete from public.event_notification_targets where event_id = any(ids);
    insert into public.event_notification_targets(event_id, all_active)
      select id, true from unnest(ids) id where audience.all_active;
    insert into public.event_notification_targets(event_id, branch_id)
      select id, branch from unnest(ids) id cross join unnest(audience.branch_ids) branch;
    insert into public.event_notification_targets(event_id, position_id)
      select id, position from unnest(ids) id cross join unnest(audience.position_ids) position;
  end if;
  if p_settings ? 'reminder_offsets' then
    delete from public.event_reminder_offsets where event_id = any(ids);
    insert into public.event_reminder_offsets(event_id, minutes_before)
      select id, minutes::integer from unnest(ids) id
      cross join jsonb_array_elements_text(p_settings->'reminder_offsets') minutes
      on conflict do nothing;
  end if;
end;
$$;
revoke all on function private.apply_event_save_settings(bigint[], jsonb) from public, anon, authenticated;

create function private.apply_task_save_settings(p_ids bigint[], p_settings jsonb)
returns void language plpgsql set search_path = '' as $$
declare target public.tasks; ids bigint[] := '{}';
  audience record;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
      or p_settings - array['audience', 'reminder_offsets', 'due_time'] <> '{}'::jsonb then
    raise exception 'Invalid Task settings';
  end if;
  if p_settings = '{}'::jsonb then return; end if;
  for target in select * from public.tasks
    where id = any(p_ids) and removed_at is null order by id for update
  loop
    if not private.can_manage_branches(array[target.branch_id]) then raise exception 'Task outside branch scope'; end if;
    ids := array_append(ids, target.id);
  end loop;
  if p_settings ? 'audience' then
    select * into audience from jsonb_to_record(p_settings->'audience')
      as a(all_active boolean, branch_ids bigint[], position_ids bigint[]);
    if audience.all_active is null or audience.branch_ids is null or audience.position_ids is null then
      raise exception 'Invalid Task audience';
    end if;
    delete from public.task_notification_targets where task_id = any(ids);
    insert into public.task_notification_targets(task_id, all_active)
      select id, true from unnest(ids) id where audience.all_active;
    insert into public.task_notification_targets(task_id, branch_id)
      select id, branch from unnest(ids) id cross join unnest(audience.branch_ids) branch;
    insert into public.task_notification_targets(task_id, position_id)
      select id, position from unnest(ids) id cross join unnest(audience.position_ids) position;
  end if;
  if p_settings ? 'reminder_offsets' then
    delete from public.task_reminder_offsets where task_id = any(ids);
    insert into public.task_reminder_offsets(task_id, minutes_before)
      select id, minutes::integer from unnest(ids) id
      cross join jsonb_array_elements_text(p_settings->'reminder_offsets') minutes
      on conflict do nothing;
  end if;
  if p_settings ? 'due_time' then
    update public.tasks set due_time = (p_settings->>'due_time')::time where id = any(ids);
  end if;
end;
$$;
revoke all on function private.apply_task_save_settings(bigint[], jsonb) from public, anon, authenticated;

create function public.save_event_with_resources_atomic(
  p_save_settings jsonb, p_name text, p_description text, p_event_type_id bigint, p_location text,
  p_event_date date, p_starts_at timestamptz, p_ends_at timestamptz, p_branch_ids bigint[], p_request_key
  uuid, p_signup_sheet_url text default NULL::text, p_max_volunteers integer default 0, p_event_id bigint
  default NULL::bigint, p_slides_url text default NULL::text, p_meeting_notes_url text default
  NULL::text, p_time_slots jsonb default NULL::jsonb, p_resource_links jsonb default NULL::jsonb,
  p_officer_signups jsonb default null, p_roster_scope text default 'occurrence'
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb;
begin
  if p_event_id is null then
    payload := jsonb_build_array(
      'standalone', p_save_settings, p_name, p_description, p_event_type_id, p_location, p_event_date, p_starts_at,
      p_ends_at, p_branch_ids, p_signup_sheet_url, p_max_volunteers, p_event_id, p_slides_url,
      p_meeting_notes_url, p_time_slots, p_resource_links, p_officer_signups, p_roster_scope
    );
    saved_id := private.atomic_save_result('event.create', p_request_key, payload);
    if saved_id is not null then return saved_id; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 73));
    if exists (select 1 from public.event_series where request_key = p_request_key) then
      raise exception 'Save request was already used';
    end if;
  end if;
  if p_officer_signups is not null then
    if p_event_id is not null then raise exception 'Initial roster is only for Event creation'; end if;
    saved_id := private.save_event_with_resources_and_officers(
      p_name, p_description, p_event_type_id, p_location, p_event_date, p_starts_at, p_ends_at,
      p_branch_ids, p_signup_sheet_url, p_max_volunteers, p_slides_url, p_meeting_notes_url,
      p_time_slots, p_resource_links, p_officer_signups, p_roster_scope
    );
  else
    saved_id := private.save_event_with_resources(
      p_name, p_description, p_event_type_id, p_location, p_event_date, p_starts_at, p_ends_at,
      p_branch_ids, p_signup_sheet_url, p_max_volunteers, p_event_id, p_slides_url, p_meeting_notes_url,
      p_time_slots, p_resource_links
    );
  end if;
  perform private.apply_event_save_settings(array[saved_id], p_save_settings);
  if p_event_id is null then perform private.notify_event_created(saved_id); end if;
  if p_event_id is null then
    insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id)
      values (auth.uid(), 'event.create', p_request_key, payload, saved_id);
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_event_with_resources_atomic(
  jsonb, text, text, bigint, text, date, timestamptz, timestamptz, bigint[], uuid, text, integer, bigint,
  text, text, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_event_with_resources_atomic(
  jsonb, text, text, bigint, text, date, timestamptz, timestamptz, bigint[], uuid, text, integer, bigint,
  text, text, jsonb, jsonb, jsonb, text
) to authenticated;

create function public.create_recurring_event_with_resources_atomic(
  p_save_settings jsonb, p_name text, p_description text, p_event_type_id bigint, p_location text,
  p_branch_ids bigint[], p_slides_url text, p_meeting_notes_url text, p_signup_sheet_url text,
  p_max_volunteers integer, p_request_key uuid, p_recurrence_rule text, p_event_dates date[], p_starts_at
  timestamptz[], p_ends_at timestamptz[], p_time_slots jsonb, p_resource_links jsonb, p_officer_signups
  jsonb default null, p_roster_scope text default 'occurrence'
) returns table(event_id bigint, calendar_event_ids bigint[]) language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb; affected_ids bigint[];
begin
  payload := jsonb_build_array(
      'series', p_save_settings, p_name, p_description, p_event_type_id, p_location, p_branch_ids, p_slides_url,
      p_meeting_notes_url, p_signup_sheet_url, p_max_volunteers, p_recurrence_rule, p_event_dates,
      p_starts_at, p_ends_at, p_time_slots, p_resource_links, p_officer_signups, p_roster_scope
    );
  saved_id := private.atomic_save_result('event.create', p_request_key, payload);
  if saved_id is not null then
    return query select receipt.result_id, receipt.calendar_event_ids
      from private.atomic_save_receipts receipt
      where receipt.actor_id = auth.uid()
        and receipt.operation = 'event.create'
        and receipt.request_key = p_request_key;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 73));
  if exists (select 1 from public.event_series where request_key = p_request_key) then
    raise exception 'Save request was already used';
  end if;
  if p_officer_signups is not null then
    saved_id := private.create_recurring_event_with_resources_and_officers(
      p_name, p_description, p_event_type_id, p_location, p_branch_ids, p_slides_url,
      p_meeting_notes_url, p_signup_sheet_url, p_max_volunteers, p_request_key, p_recurrence_rule,
      p_event_dates, p_starts_at, p_ends_at, p_time_slots, p_resource_links, p_officer_signups,
      p_roster_scope
    );
  else
    saved_id := private.create_recurring_event_with_resources(
      p_name, p_description, p_event_type_id, p_location, p_branch_ids, p_slides_url,
      p_meeting_notes_url, p_signup_sheet_url, p_max_volunteers, p_request_key, p_recurrence_rule,
      p_event_dates, p_starts_at, p_ends_at, p_time_slots, p_resource_links
    );
  end if;
  select array_agg(sibling.id order by sibling.id) into affected_ids
  from public.events first_row join public.events sibling
    on sibling.recurrence_series_id = first_row.recurrence_series_id
  where first_row.id = saved_id and sibling.deleted_at is null;
  perform private.apply_event_save_settings(affected_ids, p_save_settings);
  perform private.notify_event_created(saved_id);
  insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id, calendar_event_ids)
    values (auth.uid(), 'event.create', p_request_key, payload, saved_id, affected_ids);
  return query select saved_id, affected_ids;
end;
$$;
revoke all on function public.create_recurring_event_with_resources_atomic(
  jsonb, text, text, bigint, text, bigint[], text, text, text, integer, uuid, text, date[],
  timestamptz[], timestamptz[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_recurring_event_with_resources_atomic(
  jsonb, text, text, bigint, text, bigint[], text, text, text, integer, uuid, text, date[],
  timestamptz[], timestamptz[], jsonb, jsonb, jsonb, text
) to authenticated;

create function public.mutate_recurring_event_with_resources_atomic(
  p_save_settings jsonb, p_selected_id bigint, p_scope text, p_operation text, p_request_key uuid,
  p_series_id bigint, p_revision integer, p_patch jsonb default '{}'::jsonb, p_rule text default
  NULL::text, p_dates date[] default NULL::date[], p_capacity_changed boolean default false,
  p_max_volunteers integer default NULL::integer, p_resource_links jsonb default NULL::jsonb
) returns table(event_id bigint, calendar_event_ids bigint[]) language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb; affected_ids bigint[];
begin
  if p_operation is distinct from 'edit' then raise exception 'Invalid save operation'; end if;
  payload := jsonb_build_array(
      p_save_settings, p_selected_id, p_scope, p_operation, p_series_id, p_revision, p_patch, p_rule,
      p_dates, p_capacity_changed, p_max_volunteers, p_resource_links
    );
  saved_id := private.atomic_save_result('mutate_recurring_event_with_resources_atomic', p_request_key, payload);
  if saved_id is not null then
    return query select receipt.result_id, receipt.calendar_event_ids
      from private.atomic_save_receipts receipt
      where receipt.actor_id = auth.uid()
        and receipt.operation = 'mutate_recurring_event_with_resources_atomic'
        and receipt.request_key = p_request_key;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 68));
  if exists (select 1 from private.recurrence_mutations where request_key = p_request_key) then
    raise exception 'Save request was already used';
  end if;
  saved_id := private.mutate_recurring_event_with_resources(
    p_selected_id, p_scope, p_operation, p_request_key, p_series_id, p_revision, p_patch, p_rule,
    p_dates, p_capacity_changed, p_max_volunteers, p_resource_links
  );
  affected_ids := private.saved_recurrence_occurrences('event.series_edit', p_request_key, true);
  perform private.apply_event_save_settings(affected_ids, p_save_settings);
  insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id, calendar_event_ids)
    values (auth.uid(), 'mutate_recurring_event_with_resources_atomic', p_request_key, payload, saved_id, affected_ids);
  return query select saved_id, affected_ids;
end;
$$;
revoke all on function public.mutate_recurring_event_with_resources_atomic(
  jsonb, bigint, text, text, uuid, bigint, integer, jsonb, text, date[], boolean, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_recurring_event_with_resources_atomic(
  jsonb, bigint, text, text, uuid, bigint, integer, jsonb, text, date[], boolean, integer, jsonb
) to authenticated;

create function public.save_task_with_resources_atomic(
  p_save_settings jsonb, p_title text, p_description text, p_task_type text, p_branch_id bigint,
  p_due_date date, p_points numeric, p_approval_required boolean, p_event_ids bigint[], p_resource_links
  jsonb, p_request_key uuid, p_officer_ids bigint[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb;
begin
  payload := jsonb_build_array(
      'standalone', p_save_settings, p_title, p_description, p_task_type, p_branch_id, p_due_date, p_points,
      p_approval_required, p_event_ids, p_resource_links, p_officer_ids
    );
  saved_id := private.atomic_save_result('task.create', p_request_key, payload);
  if saved_id is not null then return saved_id; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 74));
  if exists (select 1 from public.task_series where request_key = p_request_key) then
    raise exception 'Save request was already used';
  end if;
  if p_officer_ids is not null then
    saved_id := private.save_task_with_resources_and_officers(
      p_title, p_description, p_task_type, p_branch_id, p_due_date, p_points, p_approval_required,
      p_event_ids, p_resource_links, p_officer_ids
    );
  else
    saved_id := private.save_task_with_resources(
      p_title, p_description, p_task_type, p_branch_id, p_due_date, p_points, p_approval_required,
      p_event_ids, p_resource_links
    );
  end if;
  perform private.apply_task_save_settings(array[saved_id], p_save_settings);
  insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id)
    values (auth.uid(), 'task.create', p_request_key, payload, saved_id);
  return saved_id;
end;
$$;
revoke all on function public.save_task_with_resources_atomic(
  jsonb, text, text, text, bigint, date, numeric, boolean, bigint[], jsonb, uuid, bigint[]
) from public, anon, authenticated;
grant execute on function public.save_task_with_resources_atomic(
  jsonb, text, text, text, bigint, date, numeric, boolean, bigint[], jsonb, uuid, bigint[]
) to authenticated;

-- Match the new wrapper's request lock on the legacy create path during rollout.
create or replace function private.create_recurring_task(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id bigint := private.current_active_officer_id(); series_id bigint;
  first_task_id bigint; task_id bigint; i integer; day date;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_recurrence_rule is null or p_recurrence_rule !~
    '^RRULE:FREQ=(DAILY|WEEKLY);INTERVAL=[1-9][0-9]*(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?;(COUNT=[1-9][0-9]*|UNTIL=[0-9]{8})$' then
    raise exception 'Invalid recurrence definition';
  end if;
  if (substring(p_recurrence_rule from 'INTERVAL=([0-9]+)'))::integer>52 or
    (p_recurrence_rule like 'RRULE:FREQ=WEEKLY%' and p_recurrence_rule not like '%;BYDAY=%') or
    (p_recurrence_rule like 'RRULE:FREQ=DAILY%' and p_recurrence_rule like '%;BYDAY=%') then
    raise exception 'Invalid recurrence definition'; end if;
  if p_due_dates is null or cardinality(p_due_dates)<2 or cardinality(p_due_dates)>500 or
    cardinality(p_due_dates)<>(select count(distinct d) from unnest(p_due_dates) d) or
    p_due_dates[1]<>(select min(d) from unnest(p_due_dates) d) then
    raise exception 'Invalid recurring Task dates'; end if;
  if p_recurrence_rule like '%;COUNT=%' and
    ((substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer<2 or
      (substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer>500 or
      cardinality(p_due_dates)<>(substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer) then
    raise exception 'Recurrence count does not match generated Tasks'; end if;
  if p_recurrence_rule like '%;UNTIL=%' and
    p_due_dates[cardinality(p_due_dates)]>(to_date(substring(p_recurrence_rule from ';UNTIL=([0-9]{8})$'),'YYYYMMDD')) then
    raise exception 'Task exceeds recurrence end date'; end if;
  perform private.assert_recurrence_dates(p_recurrence_rule,p_due_dates);
  if not private.can_manage_branches(array[p_branch_id]) then
    raise exception 'Task outside branch scope'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 74));
  insert into public.task_series(request_key,recurrence_rule,created_by)
    values(p_request_key,p_recurrence_rule,actor_id)
    on conflict(request_key) do nothing returning id into series_id;
  if series_id is null then
    select id into series_id from public.task_series where request_key=p_request_key;
    if (select recurrence_rule from public.task_series where id=series_id) is distinct from p_recurrence_rule or
      (select count(*) from public.tasks where recurrence_series_id=series_id)<>cardinality(p_due_dates) or
      exists(select 1 from unnest(p_due_dates) d where not exists(
        select 1 from public.tasks t where t.recurrence_series_id=series_id and t.recurrence_key=d)) then
      raise exception 'Idempotency key already used'; end if;
    select id into first_task_id from public.tasks
      where recurrence_series_id=series_id and recurrence_key=p_due_dates[1];
    return first_task_id;
  end if;
  update public.task_series set starts_on=p_due_dates[1],ends_on=p_due_dates[cardinality(p_due_dates)] where id=series_id;
  for i in 1..cardinality(p_due_dates) loop
    day := p_due_dates[i];
    if day is null or (i>1 and day<=p_due_dates[i-1]) then
      raise exception 'Recurring Task dates must be ordered'; end if;
    task_id := private.save_task(p_title,p_description,p_task_type,p_branch_id,day,
      p_points,p_approval_required);
    update public.tasks set recurrence_series_id=series_id,recurrence_key=day where id=task_id;
    if first_task_id is null then first_task_id := task_id; end if;
  end loop;
  perform private.write_audit_log('task.series_created','task_series',series_id::text,
    pg_catalog.jsonb_build_object('recurrence_rule',p_recurrence_rule,
      'occurrence_count',cardinality(p_due_dates),'first_task_id',first_task_id));
  return first_task_id;
end;
$$;

create function public.create_recurring_task_with_resources_atomic(
  p_save_settings jsonb, p_title text, p_description text, p_task_type text, p_branch_id bigint, p_points
  numeric, p_approval_required boolean, p_request_key uuid, p_recurrence_rule text, p_due_dates date[],
  p_event_ids bigint[], p_resource_links jsonb, p_officer_ids bigint[] default null, p_roster_scope text
  default 'occurrence'
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb;
begin
  payload := jsonb_build_array(
      'series', p_save_settings, p_title, p_description, p_task_type, p_branch_id, p_points, p_approval_required,
      p_recurrence_rule, p_due_dates, p_event_ids, p_resource_links, p_officer_ids, p_roster_scope
    );
  saved_id := private.atomic_save_result('task.create', p_request_key, payload);
  if saved_id is not null then return saved_id; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 74));
  if exists (select 1 from public.task_series where request_key = p_request_key) then
    raise exception 'Save request was already used';
  end if;
  if p_officer_ids is not null then
    saved_id := private.create_recurring_task_with_resources_and_officers(
      p_title, p_description, p_task_type, p_branch_id, p_points, p_approval_required, p_request_key,
      p_recurrence_rule, p_due_dates, p_event_ids, p_resource_links, p_officer_ids, p_roster_scope
    );
  else
    saved_id := private.create_recurring_task_with_resources(
      p_title, p_description, p_task_type, p_branch_id, p_points, p_approval_required, p_request_key,
      p_recurrence_rule, p_due_dates, p_event_ids, p_resource_links
    );
  end if;
  perform private.apply_task_save_settings(
    array(select sibling.id from public.tasks first_row join public.tasks sibling
      on sibling.recurrence_series_id = first_row.recurrence_series_id
      where first_row.id = saved_id order by sibling.id), p_save_settings
  );
  insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id)
    values (auth.uid(), 'task.create', p_request_key, payload, saved_id);
  return saved_id;
end;
$$;
revoke all on function public.create_recurring_task_with_resources_atomic(
  jsonb, text, text, text, bigint, numeric, boolean, uuid, text, date[], bigint[], jsonb, bigint[], text
) from public, anon, authenticated;
grant execute on function public.create_recurring_task_with_resources_atomic(
  jsonb, text, text, text, bigint, numeric, boolean, uuid, text, date[], bigint[], jsonb, bigint[], text
) to authenticated;

create function public.update_task_details_with_resources_atomic(
  p_save_settings jsonb, p_task_id bigint, p_title text, p_description text, p_task_type text,
  p_branch_id bigint, p_due_date date, p_points numeric, p_event_ids bigint[], p_resource_links jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.update_task_details_with_resources(
    p_task_id, p_title, p_description, p_task_type, p_branch_id, p_due_date, p_points, p_event_ids,
    p_resource_links
  );
  perform private.apply_task_save_settings(array[p_task_id], p_save_settings);
end;
$$;
revoke all on function public.update_task_details_with_resources_atomic(
  jsonb, bigint, text, text, text, bigint, date, numeric, bigint[], jsonb
) from public, anon, authenticated;
grant execute on function public.update_task_details_with_resources_atomic(
  jsonb, bigint, text, text, text, bigint, date, numeric, bigint[], jsonb
) to authenticated;

-- Align the deployed Task wrapper with the core recurrence lock order.
create or replace function private.mutate_recurring_task_with_events(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,p_series_id bigint,
  p_revision integer,p_patch jsonb default '{}'::jsonb,p_rule text default null,
  p_dates date[] default null,p_event_ids bigint[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.tasks%rowtype; series_row public.task_series%rowtype; task_ids bigint[]; result_id bigint;
  target_series_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 68));
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
    select id into target_series_id from public.task_series where request_key=p_request_key;
    select coalesce(array_agg(id order by recurrence_key),'{}'::bigint[]) into task_ids
      from public.tasks where recurrence_series_id=target_series_id and removed_at is null;
  end if;
  if p_event_ids is not null then
    perform private.set_task_event_links(task_ids,p_event_ids);
  end if;
  return result_id;
end;
$$;

create function public.mutate_recurring_task_with_resources_atomic(
  p_save_settings jsonb, p_selected_id bigint, p_scope text, p_operation text, p_request_key uuid,
  p_series_id bigint, p_revision integer, p_patch jsonb default '{}'::jsonb, p_rule text default
  NULL::text, p_dates date[] default NULL::date[], p_event_ids bigint[] default NULL::bigint[],
  p_resource_links jsonb default NULL::jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; payload jsonb;
begin
  if p_operation is distinct from 'edit' then raise exception 'Invalid save operation'; end if;
  payload := jsonb_build_array(
      p_save_settings, p_selected_id, p_scope, p_operation, p_series_id, p_revision, p_patch, p_rule,
      p_dates, p_event_ids, p_resource_links
    );
  saved_id := private.atomic_save_result('mutate_recurring_task_with_resources_atomic', p_request_key, payload);
  if saved_id is not null then return saved_id; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text, 68));
  if exists (select 1 from private.recurrence_mutations where request_key = p_request_key) then
    raise exception 'Save request was already used';
  end if;
  saved_id := private.mutate_recurring_task_with_resources(
    p_selected_id, p_scope, p_operation, p_request_key, p_series_id, p_revision, p_patch, p_rule,
    p_dates, p_event_ids, p_resource_links
  );
  perform private.apply_task_save_settings(
    private.saved_recurrence_occurrences('task.series_edit', p_request_key), p_save_settings
  );
  insert into private.atomic_save_receipts(actor_id, operation, request_key, payload, result_id)
    values (auth.uid(), 'mutate_recurring_task_with_resources_atomic', p_request_key, payload, saved_id);
  return saved_id;
end;
$$;
revoke all on function public.mutate_recurring_task_with_resources_atomic(
  jsonb, bigint, text, text, uuid, bigint, integer, jsonb, text, date[], bigint[], jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_recurring_task_with_resources_atomic(
  jsonb, bigint, text, text, uuid, bigint, integer, jsonb, text, date[], bigint[], jsonb
) to authenticated;
