create table public.event_calendar_sync_failures (
  event_id bigint primary key references public.events(id) on delete cascade,
  failed_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index event_calendar_sync_failures_failed_at_idx
  on public.event_calendar_sync_failures (failed_at, event_id);

alter table public.event_calendar_sync_failures enable row level security;
revoke all on public.event_calendar_sync_failures from public, anon, authenticated;
grant select on public.event_calendar_sync_failures to authenticated;
create policy "Event managers read Calendar sync failures"
  on public.event_calendar_sync_failures for select to authenticated
  using (private.can_manage_event(event_id));

create function private.record_google_calendar_sync_results(
  p_event_ids bigint[], p_failed_event_ids bigint[], p_expected_states jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target_event_id bigint;
  expected_state jsonb;
  event_row public.events%rowtype;
  event_found boolean;
  matching_event_ids bigint[] := array[]::bigint[];
begin
  if private.current_active_officer_id() is null then
    raise exception 'Unauthorized';
  end if;
  if p_event_ids is null or cardinality(p_event_ids) = 0 or
     p_failed_event_ids is null or
     p_expected_states is null or jsonb_typeof(p_expected_states)<>'object' or
     exists (select 1 from unnest(p_event_ids) id where id is null) or
     exists (select 1 from unnest(p_failed_event_ids) id where id is null) or
     cardinality(p_event_ids) <> (select count(distinct id) from unnest(p_event_ids) id) or
     cardinality(p_failed_event_ids) <> (select count(distinct id) from unnest(p_failed_event_ids) id) or
     exists (select 1 from unnest(p_failed_event_ids) id where not (id = any(p_event_ids))) then
    raise exception 'Invalid Google Calendar sync results';
  end if;

  -- Lock in stable order. A late result may update status only while the
  -- Event still has the canonical state that was actually synchronized.
  for target_event_id in select unnest(p_event_ids) order by 1 loop
    select * into event_row from public.events e where e.id=target_event_id for update;
    event_found := found;
    if not private.can_manage_event(target_event_id) then
      raise exception 'Event outside branch scope';
    end if;
    expected_state := p_expected_states->target_event_id::text;
    if expected_state is null or jsonb_typeof(expected_state)<>'object' then
      raise exception 'Invalid Google Calendar sync results';
    end if;
    if event_found and expected_state ?& array[
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
      matching_event_ids := array_append(matching_event_ids,target_event_id);
    end if;
  end loop;

  insert into public.event_calendar_sync_failures(event_id)
    select id from unnest(p_failed_event_ids) as failed(id)
    where id=any(matching_event_ids)
    on conflict (event_id) do update set failed_at=pg_catalog.clock_timestamp();

  delete from public.event_calendar_sync_failures as failures
    where failures.event_id = any(matching_event_ids)
      and not (failures.event_id = any(p_failed_event_ids));
end;
$$;

revoke all on function private.record_google_calendar_sync_results(bigint[], bigint[],jsonb)
  from public, anon, authenticated;

create function public.record_google_calendar_sync_results(
  p_event_ids bigint[], p_failed_event_ids bigint[], p_expected_states jsonb
) returns void language sql security definer set search_path = '' as $$
  select private.record_google_calendar_sync_results(p_event_ids, p_failed_event_ids,p_expected_states)
$$;

revoke all on function public.record_google_calendar_sync_results(bigint[], bigint[],jsonb)
  from public, anon;
grant execute on function public.record_google_calendar_sync_results(bigint[], bigint[],jsonb)
  to authenticated;
