-- Event editors can recover the Calendar mirror for non-deleted occurrences.
-- Archived and deleted occurrences retain the existing Event-manager scope.
create function private.can_recover_event_calendar_sync(p_event_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        private.can_manage_event(e.id)
        or (e.deleted_at is null and e.status <> 'archived' and private.can_edit_event(e.id))
      )
      and not exists (
        select 1 from public.academic_periods p
        where e.event_date between p.starts_on and p.ends_on
          and p.ends_on < (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date
      )
  )
$$;

revoke all on function private.can_recover_event_calendar_sync(bigint)
  from public, anon, authenticated;
grant execute on function private.can_recover_event_calendar_sync(bigint)
  to authenticated;

alter policy "Event managers read Calendar sync failures"
  on public.event_calendar_sync_failures
  using (private.can_recover_event_calendar_sync(event_id));

-- Return the authorized snapshot in one query. A missing or inaccessible
-- occurrence must not cause a Google Calendar deletion.
create function public.get_google_calendar_sync_event(p_event_id bigint)
returns table (
  id bigint, name text, description text, location text, starts_at timestamptz,
  ends_at timestamptz, status text, deleted_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.name, e.description, e.location, e.starts_at,
    e.ends_at, e.status, e.deleted_at
  from public.events e
  where e.id = p_event_id
    and private.can_recover_event_calendar_sync(e.id)
$$;

revoke all on function public.get_google_calendar_sync_event(bigint)
  from public, anon, authenticated;
grant execute on function public.get_google_calendar_sync_event(bigint)
  to authenticated;

create function private.apply_google_calendar_sync_results(
  p_event_ids bigint[], p_failed_event_ids bigint[], p_expected_states jsonb
) returns bigint[] language plpgsql security definer set search_path = '' as $$
declare
  target_event_id bigint;
  expected_state jsonb;
  event_row public.events%rowtype;
  matching_event_ids bigint[] := array[]::bigint[];
begin
  if private.current_active_officer_id() is null then
    raise exception 'Unauthorized';
  end if;
  if p_event_ids is null or cardinality(p_event_ids) = 0 or
     p_failed_event_ids is null or
     p_expected_states is null or jsonb_typeof(p_expected_states) <> 'object' or
     exists (select 1 from unnest(p_event_ids) id where id is null) or
     exists (select 1 from unnest(p_failed_event_ids) id where id is null) or
     cardinality(p_event_ids) <> (select count(distinct id) from unnest(p_event_ids) id) or
     cardinality(p_failed_event_ids) <> (select count(distinct id) from unnest(p_failed_event_ids) id) or
     exists (select 1 from unnest(p_failed_event_ids) id where not (id = any(p_event_ids))) then
    raise exception 'Invalid Google Calendar sync results';
  end if;

  -- Lock in stable order. Report exactly which snapshots still matched while
  -- locked so a skipped result cannot be reported as a successful sync.
  for target_event_id in select unnest(p_event_ids) order by 1 loop
    select * into event_row from public.events e where e.id = target_event_id for update;
    if not found or not private.can_recover_event_calendar_sync(target_event_id) then
      raise exception 'Event outside branch scope or writable period';
    end if;
    expected_state := p_expected_states->target_event_id::text;
    if expected_state is null or jsonb_typeof(expected_state) <> 'object' then
      raise exception 'Invalid Google Calendar sync results';
    end if;
    if expected_state ?& array[
      'id','name','description','location','starts_at','ends_at','status','deleted_at'
    ] and
      (expected_state->>'id')::bigint = event_row.id and
      expected_state->>'name' = event_row.name and
      expected_state->>'description' = event_row.description and
      expected_state->>'location' is not distinct from event_row.location and
      (expected_state->>'starts_at')::timestamptz = event_row.starts_at and
      (expected_state->>'ends_at')::timestamptz = event_row.ends_at and
      expected_state->>'status' = event_row.status and
      (expected_state->>'deleted_at')::timestamptz is not distinct from event_row.deleted_at then
      matching_event_ids := array_append(matching_event_ids, target_event_id);
    end if;
  end loop;

  insert into public.event_calendar_sync_failures(event_id)
    select id from unnest(p_failed_event_ids) as failed(id)
    where id = any(matching_event_ids)
    on conflict (event_id) do update set failed_at = pg_catalog.clock_timestamp();

  delete from public.event_calendar_sync_failures as failures
    where failures.event_id = any(matching_event_ids)
      and not (failures.event_id = any(p_failed_event_ids));

  return matching_event_ids;
end;
$$;

revoke all on function private.apply_google_calendar_sync_results(bigint[], bigint[], jsonb)
  from public, anon, authenticated;

-- Preserve the existing RPC signatures for clients during rollout.
create or replace function private.record_google_calendar_sync_results(
  p_event_ids bigint[], p_failed_event_ids bigint[], p_expected_states jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.apply_google_calendar_sync_results(
    p_event_ids, p_failed_event_ids, p_expected_states
  );
end;
$$;

create function public.apply_google_calendar_sync_results(
  p_event_ids bigint[], p_failed_event_ids bigint[], p_expected_states jsonb
) returns bigint[] language sql security definer set search_path = '' as $$
  select private.apply_google_calendar_sync_results(
    p_event_ids, p_failed_event_ids, p_expected_states
  )
$$;

revoke all on function public.apply_google_calendar_sync_results(bigint[], bigint[], jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_google_calendar_sync_results(bigint[], bigint[], jsonb)
  to authenticated;
