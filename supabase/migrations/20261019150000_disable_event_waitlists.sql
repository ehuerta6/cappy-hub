-- Keep the existing table, RPC signatures, and signup-count return shape in
-- place so the currently deployed application remains compatible until the
-- new application has been deployed. A follow-up contract migration will
-- drop these legacy objects after that rollout is verified.

-- Keep callers of the old promotion helper valid while preventing queue
-- entries from being promoted into confirmed participation.
create or replace function private.promote_event_waitlist(p_event_id bigint)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  return 0;
end;
$$;
revoke all on function private.promote_event_waitlist(bigint) from public, anon, authenticated;

create or replace function private.set_event_capacity(
  p_event_id bigint, p_max_volunteers integer
) returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype; confirmed_count bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_max_volunteers is not null and p_max_volunteers <= 0 then
    raise exception 'Max volunteers must be a positive whole number';
  end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  confirmed_count := (select count(*) from public.event_officers where event_id=p_event_id);
  if p_max_volunteers is not null and p_max_volunteers < confirmed_count then
    raise exception 'Max volunteers cannot be lower than the confirmed signup count';
  end if;
  if event_row.max_volunteers is distinct from p_max_volunteers then
    update public.events set max_volunteers=p_max_volunteers where id=p_event_id;
    perform private.write_audit_log('event.capacity_changed','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'before',
        pg_catalog.jsonb_build_object('max_volunteers',event_row.max_volunteers),
        'after',pg_catalog.jsonb_build_object('max_volunteers',p_max_volunteers)));
  end if;
end;
$$;
revoke all on function private.set_event_capacity(bigint,integer) from public, anon, authenticated;

create or replace function private.change_event_signup(
  p_event_id bigint, p_officer_id bigint, p_remove boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype;
  actor_id bigint := private.current_active_officer_id();
  changed_rows integer; confirmed_count bigint; old_entry public.event_waitlist%rowtype;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' or
    current_event.participation_points_per_hour_at_end is not null or
    current_event.ends_at<=pg_catalog.now() then
    raise exception 'Signups are closed for this event';
  end if;
  if p_officer_id is distinct from actor_id and not private.can_manage_event(p_event_id) then
    raise exception 'Cannot manage another officer signup for this event';
  end if;
  perform 1 from public.officers where id=p_officer_id and status='active' for share;
  if not found then raise exception 'Target officer is not active'; end if;
  if p_remove then
    delete from public.event_officers where event_id=p_event_id and officer_id=p_officer_id;
    get diagnostics changed_rows=row_count;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
    changed_rows := 0;
  else
    confirmed_count := (select count(*) from public.event_officers where event_id=p_event_id);
    if current_event.max_volunteers is not null and confirmed_count>=current_event.max_volunteers then
      raise exception 'Event capacity has been reached';
    end if;
    select * into old_entry from public.event_waitlist
      where event_id=p_event_id and officer_id=p_officer_id for update;
    if found then
      perform private.write_audit_log('event.waitlist_retired','event',p_event_id::text,
        pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',p_officer_id,
          'waitlist_id',old_entry.id,'joined_at',old_entry.joined_at));
      delete from public.event_waitlist where id=old_entry.id;
    end if;
    insert into public.event_officers(event_id,officer_id) values(p_event_id,p_officer_id)
      on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
  end if;
  if changed_rows>0 then
    perform private.write_audit_log(case when p_remove and p_officer_id=actor_id then 'event.signout'
      when p_remove then 'event.officer_removed' when p_officer_id=actor_id then 'event.signup'
      else 'event.officer_assigned' end,'event',p_event_id::text,
      pg_catalog.jsonb_build_object('officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove));
  end if;
end;
$$;

create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; actor_id bigint := private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_targets bigint[];
  awarded_ids bigint[] := '{}'::bigint[]; target_id bigint; current_rate numeric;
  award_points numeric; scheduled_hours numeric; award_id bigint; snapshot_created boolean := false;
  confirmed_count bigint; new_count bigint; old_entry public.event_waitlist%rowtype;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid officer'; end if;
  select array_agg(id order by id) into requested_ids from
    (select distinct unnest(p_officer_ids) as id) submitted;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'This event cannot accept attendees'; end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active'
    order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active'; end if;
  confirmed_count := (select count(*) from public.event_officers where event_id=p_event_id);
  new_count := (select count(*) from unnest(requested_ids) id where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=id));
  if current_event.max_volunteers is not null and confirmed_count+new_count>current_event.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  for old_entry in select * from public.event_waitlist
    where event_id=p_event_id and officer_id=any(requested_ids) order by id for update
  loop
    perform private.write_audit_log('event.waitlist_retired','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',old_entry.officer_id,
        'waitlist_id',old_entry.id,'joined_at',old_entry.joined_at,'actor_id',actor_id));
    delete from public.event_waitlist where id=old_entry.id;
  end loop;
  with inserted as (
    insert into public.event_officers(event_id,officer_id)
    select p_event_id,id from unnest(requested_ids) submitted(id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids from inserted;
  if current_event.ends_at<=pg_catalog.now() then
    current_rate := current_event.participation_points_per_hour_at_end;
    if current_rate is null then
      select participation_points_per_hour into current_rate from public.application_config where id=1 for share;
      if not found then raise exception 'Participation configuration not found'; end if;
      update public.events set participation_points_per_hour_at_end=current_rate where id=p_event_id;
      snapshot_created := true;
    end if;
    scheduled_hours := extract(epoch from (current_event.ends_at-current_event.starts_at))::numeric/3600;
    award_points := private.event_participation_points(current_event.starts_at,current_event.ends_at,current_rate);
    if snapshot_created then
      select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into award_targets
        from public.event_officers where event_id=p_event_id;
    else award_targets := requested_ids; end if;
    foreach target_id in array award_targets loop
      award_id := null;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
      values(target_id,p_event_id,award_points,'Event participation','participation',null)
      on conflict do nothing returning id into award_id;
      if award_id is not null then
        awarded_ids := pg_catalog.array_append(awarded_ids,target_id);
        perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,'officer_id',target_id,
            'scheduled_hours',scheduled_hours,'rate',current_rate,'points',award_points));
      elsif exists(select 1 from public.point_transactions where officer_id=target_id and event_id=p_event_id
        and award_type='manual' and removed_at is null) then
        raise exception 'This Officer already has an active award for this Event.';
      end if;
    end loop;
  end if;
  if cardinality(added_ids)>0 or cardinality(awarded_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'participation_awards_created',awarded_ids,'participation_rate',current_rate,
        'points_per_officer',award_points,'scheduled_hours',scheduled_hours));
  end if;
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_officer_ids',awarded_ids,'rate',current_rate,'points_per_officer',award_points);
end;
$$;
