-- Share the scheduled-hours calculation between the automatic processor and
-- event-manager bulk attendance so historical awards cannot drift.
create function private.event_participation_points(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_rate numeric
) returns numeric
language sql immutable security invoker set search_path = '' as $$
  select extract(epoch from (p_ends_at - p_starts_at))::numeric / 3600 * p_rate
$$;
revoke all on function private.event_participation_points(timestamptz,timestamptz,numeric)
  from public, anon, authenticated;

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  finished_event public.events%rowtype;
  signup record;
  current_rate numeric;
  award_points numeric;
  scheduled_hours numeric;
  award_id bigint;
  award_count integer;
  event_count integer := 0;
begin
  for finished_event in
    select * from public.events
    where status <> 'cancelled' and deleted_at is null and
      ends_at <= pg_catalog.now() and participation_points_per_hour_at_end is null
    order by id for update skip locked
  loop
    select participation_points_per_hour into current_rate
      from public.application_config where id = 1 for share;
    if not found then raise exception 'Participation configuration not found'; end if;
    scheduled_hours := extract(epoch from
      (finished_event.ends_at - finished_event.starts_at))::numeric / 3600;
    award_points := private.event_participation_points(
      finished_event.starts_at, finished_event.ends_at, current_rate);
    update public.events set participation_points_per_hour_at_end = current_rate
      where id = finished_event.id;
    award_count := 0;
    for signup in select officer_id from public.event_officers
      where event_id = finished_event.id order by officer_id
    loop
      award_id := null;
      insert into public.point_transactions
        (officer_id,event_id,points,reason,award_type,created_by)
      values (signup.officer_id,finished_event.id,award_points,
        'Event participation','participation',null)
      on conflict (officer_id,event_id) where award_type = 'participation'
        do nothing returning id into award_id;
      if award_id is not null then
        award_count := award_count + 1;
        perform private.write_audit_log('points.participation_created',
          'point_transaction',award_id::text,pg_catalog.jsonb_build_object(
            'transaction_id',award_id,'event_id',finished_event.id,
            'officer_id',signup.officer_id,'scheduled_hours',scheduled_hours,
            'rate',current_rate,'points',award_points,'event_kind','timed'));
      end if;
    end loop;
    perform private.write_audit_log('event.participation_processed',
      'event',finished_event.id::text,pg_catalog.jsonb_build_object(
        'rate',current_rate,'scheduled_hours',scheduled_hours,
        'awards_created',award_count,'event_kind','timed'));
    event_count := event_count + 1;
  end loop;
  return event_count;
end;
$$;

create function private.bulk_add_event_officers(
  p_event_id bigint,
  p_officer_ids bigint[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_event public.events%rowtype;
  actor_id bigint := private.current_active_officer_id();
  requested_ids bigint[];
  added_ids bigint[];
  award_targets bigint[];
  awarded_ids bigint[] := '{}'::bigint[];
  target_id bigint;
  current_rate numeric;
  award_points numeric;
  scheduled_hours numeric;
  award_id bigint;
  snapshot_created boolean := false;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids) = 0 or
    array_position(p_officer_ids, null) is not null then
    raise exception 'Select at least one valid officer';
  end if;
  select array_agg(id order by id) into requested_ids
    from (select distinct unnest(p_officer_ids) as id) submitted;

  select * into current_event from public.events
    where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then
    raise exception 'Event outside branch scope';
  end if;
  if current_event.deleted_at is not null or current_event.status = 'cancelled' then
    raise exception 'This event cannot accept attendees';
  end if;

  -- Hold officer row locks while validating eligibility and inserting signups.
  perform o.id from public.officers o
    where o.id = any(requested_ids) and o.status = 'active'
    order by o.id for share;
  if (select count(*) from public.officers o
      where o.id = any(requested_ids) and o.status = 'active') <> cardinality(requested_ids) then
    raise exception 'All target officers must be active';
  end if;

  with inserted as (
    insert into public.event_officers(event_id,officer_id)
    select p_event_id, id from unnest(requested_ids) submitted(id)
    on conflict (event_id,officer_id) do nothing
    returning officer_id
  )
  select coalesce(array_agg(officer_id order by officer_id), '{}'::bigint[])
    into added_ids from inserted;

  if current_event.ends_at <= pg_catalog.now() then
    current_rate := current_event.participation_points_per_hour_at_end;
    if current_rate is null then
      select participation_points_per_hour into current_rate
        from public.application_config where id = 1 for share;
      if not found then raise exception 'Participation configuration not found'; end if;
      update public.events set participation_points_per_hour_at_end = current_rate
        where id = p_event_id;
      snapshot_created := true;
    end if;
    scheduled_hours := extract(epoch from
      (current_event.ends_at - current_event.starts_at))::numeric / 3600;
    award_points := private.event_participation_points(
      current_event.starts_at, current_event.ends_at, current_rate);
    if snapshot_created then
      -- Completing the first processing pass must include attendees who were
      -- signed up before this bulk request, just like the automatic processor.
      select coalesce(array_agg(officer_id order by officer_id), '{}'::bigint[])
        into award_targets from public.event_officers where event_id = p_event_id;
    else
      -- A processed event only needs awards for the selected attendees.
      award_targets := requested_ids;
    end if;

    foreach target_id in array award_targets loop
      award_id := null;
      insert into public.point_transactions
        (officer_id,event_id,points,reason,award_type,created_by)
      values (target_id,p_event_id,award_points,'Event participation','participation',null)
      on conflict (officer_id,event_id) where award_type = 'participation'
        do nothing returning id into award_id;
      if award_id is not null then
        awarded_ids := pg_catalog.array_append(awarded_ids,target_id);
        perform private.write_audit_log('points.participation_created',
          'point_transaction',award_id::text,pg_catalog.jsonb_build_object(
            'transaction_id',award_id,'event_id',p_event_id,'officer_id',target_id,
            'scheduled_hours',scheduled_hours,'rate',current_rate,'points',award_points));
      end if;
    end loop;
  end if;

  if cardinality(added_ids) > 0 or cardinality(awarded_ids) > 0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,
        'officer_ids',added_ids,'participation_awards_created',awarded_ids,
        'participation_rate',current_rate,'points_per_officer',award_points,
        'scheduled_hours',scheduled_hours));
  end if;
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_officer_ids',awarded_ids,'rate',current_rate,'points_per_officer',award_points);
end;
$$;
revoke all on function private.bulk_add_event_officers(bigint,bigint[])
  from public, anon, authenticated;
grant execute on function private.bulk_add_event_officers(bigint,bigint[])
  to authenticated;

create function public.bulk_add_event_officers(p_event_id bigint,p_officer_ids bigint[])
returns jsonb language sql security invoker set search_path = '' as $$
  select private.bulk_add_event_officers(p_event_id,p_officer_ids)
$$;
revoke all on function public.bulk_add_event_officers(bigint,bigint[])
  from public, anon, authenticated;
grant execute on function public.bulk_add_event_officers(bigint,bigint[])
  to authenticated;
