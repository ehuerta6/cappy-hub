-- cappy-hub: approve-destructive-migration
-- reason: Phase 1 PR #298 revision e4d0b226 deployed successfully; its application only consumes confirmed_count from the shared signup count RPC and no longer reads Waitlist state. Archive pending entries before dropping the operational contracts.

-- Preserve each outstanding queue entry in the established System Log before
-- removing the operational table. Match the Waitlist ID so a prior retirement
-- record is not duplicated.
do $$
declare pending_entry record;
begin
  for pending_entry in
    select id,event_id,officer_id,joined_at
    from public.event_waitlist
    order by id
  loop
    if not exists (
      select 1 from public.audit_logs a
      where a.action='event.waitlist_retired'
        and a.entity_id=pending_entry.event_id::text
        and a.details->>'waitlist_id'=pending_entry.id::text
    ) then
      perform private.write_audit_log(
        'event.waitlist_retired','event',pending_entry.event_id::text,
        pg_catalog.jsonb_build_object(
          'event_id',pending_entry.event_id,
          'officer_id',pending_entry.officer_id,
          'waitlist_id',pending_entry.id,
          'joined_at',pending_entry.joined_at
        )
      );
    end if;
  end loop;
end;
$$;

-- Keep the concurrent capacity guard for confirmed signups. Queue-specific
-- overlap checks are no longer part of this trigger.
create or replace function private.prevent_event_signup_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare capacity integer; confirmed_count bigint;
begin
  if tg_op='UPDATE' and new.event_id=old.event_id and new.officer_id=old.officer_id then
    return new;
  end if;
  select max_volunteers into capacity
  from public.events where id=new.event_id for update;
  if not found then raise exception 'Event not found'; end if;
  confirmed_count := (
    select count(*) from public.event_officers eo where eo.event_id=new.event_id
  );
  if capacity is not null and confirmed_count>=capacity then
    raise exception 'Event capacity has been reached';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_event_signup_overlap() from public,anon,authenticated;
drop trigger event_officers_no_waitlist_overlap on public.event_officers;
create trigger event_officers_capacity_guard
  before insert or update of event_id,officer_id on public.event_officers
  for each row execute function private.prevent_event_signup_overlap();

-- Signup changes continue to serialize on the Event row and preserve the
-- existing authorization, capacity response, and audit behavior.
create or replace function private.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype;
  actor_id bigint := private.current_active_officer_id();
  changed_rows integer; confirmed_count bigint;
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
    insert into public.event_officers(event_id,officer_id)
      values(p_event_id,p_officer_id) on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
  end if;
  if changed_rows>0 then
    perform private.write_audit_log(
      case when p_remove and p_officer_id=actor_id then 'event.signout'
        when p_remove then 'event.officer_removed'
        when p_officer_id=actor_id then 'event.signup'
        else 'event.officer_assigned' end,
      'event',p_event_id::text,
      pg_catalog.jsonb_build_object(
        'officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove
      )
    );
  end if;
end;
$$;

-- Manager bulk additions retain the capacity check, audit trail, and existing
-- Point behavior for already confirmed Officers. Pending queue rows are never
-- made into signups and are never included in Point awards.
create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; actor_id bigint := private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_targets bigint[];
  awarded_ids bigint[] := '{}'::bigint[]; target_id bigint; current_rate numeric;
  award_points numeric; scheduled_hours numeric; award_id bigint; snapshot_created boolean := false;
  confirmed_count bigint; new_count bigint;
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

-- Remove obsolete client and helper RPCs, and all storage/policies/indexes and
-- triggers owned by the operational queue table.
drop function public.leave_event_waitlist(bigint,bigint);
drop function private.leave_event_waitlist(bigint,bigint);
drop function private.promote_event_waitlist(bigint);
drop function public.event_signup_counts();
drop table public.event_waitlist;

-- The existing application uses this shared count RPC for confirmed capacity.
-- Keep that compatible contract while removing its Waitlist-only field.
create function public.event_signup_counts()
returns table(event_id bigint,confirmed_count bigint)
language sql security definer set search_path = '' as $$
  select e.id,(select count(*) from public.event_officers eo where eo.event_id=e.id)
  from public.events e
  where private.current_active_officer_id() is not null
$$;
revoke all on function public.event_signup_counts() from public,anon,authenticated;
grant execute on function public.event_signup_counts() to authenticated;

notify pgrst, 'reload schema';
