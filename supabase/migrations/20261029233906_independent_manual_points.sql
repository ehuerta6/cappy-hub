-- Independent signed manual credit must not suppress or replace participation.
-- Preserve every existing transaction, processing marker, rate and audit row.
-- Automatic ordinary/slot identity indexes (including removed awards) stay intact.
drop index public.one_active_primary_event_award_per_officer;

create or replace function private.prevent_event_primary_award_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conflict_exists boolean;
begin
  if new.event_id is null or new.removed_at is not null or new.award_type <> 'participation' then
    return new;
  end if;
  -- Serialize ordinary/slot participation on the Event row. Manual and
  -- correction transactions are independent of this automatic-only invariant.
  perform 1 from public.events where id=new.event_id for update;
  select exists(select 1 from public.point_transactions p where p.event_id=new.event_id
    and p.officer_id=new.officer_id and p.removed_at is null
    and p.award_type='participation' and p.id is distinct from new.id
    and ((new.event_time_slot_id is null and p.event_time_slot_id is not null) or
         (new.event_time_slot_id is not null and p.event_time_slot_id is null))) into conflict_exists;
  if conflict_exists then
    raise unique_violation using message='This Officer already has an active award for this Event.';
  end if;
  return new;
end;
$$;

-- Retain the helper signature for existing slot callers. Its conflict mode
-- now protects only ordinary-versus-slot participation, never manual credit.
create or replace function private.award_selected_event_time_slots(p_event_id bigint,p_officer_ids bigint[] default null,
  p_manual_conflict text default 'skip') returns bigint[]
language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; target record; award_id bigint; award_points numeric;
  awarded bigint[]:='{}'::bigint[]; existing public.point_transactions%rowtype;
  changed boolean; prior_points numeric;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or e.participation_points_per_hour_at_end is null then return awarded; end if;
  for target in select x.officer_id,x.slot_id,s.starts_at,s.ends_at
    from public.event_time_slot_officers x join public.event_time_slots s
      on s.id=x.slot_id and s.event_id=x.event_id
    where x.event_id=p_event_id and (p_officer_ids is null or x.officer_id=any(p_officer_ids))
    order by x.officer_id,x.slot_id
  loop
    changed:=false;
    if exists(select 1 from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=target.officer_id and p.award_type='participation'
        and p.event_time_slot_id is null and p.removed_at is null) then
      if p_manual_conflict='raise' then raise exception 'This Officer already has an active award for this Event.'; end if;
      continue;
    end if;
    award_points:=private.event_participation_points(target.starts_at,target.ends_at,
      e.participation_points_per_hour_at_end);
    select * into existing from public.point_transactions p where p.officer_id=target.officer_id
      and p.event_time_slot_id=target.slot_id and p.award_type='participation' for update;
    if found then
      if existing.removed_at is not null and not existing.slot_selection_removed then continue; end if;
      if existing.removed_at is not null then
        update public.point_transactions set removed_at=null,removed_by=null,slot_selection_removed=false
          where id=existing.id returning id into award_id;
        changed:=true;
      else award_id:=existing.id; end if;
      if existing.points is distinct from award_points and existing.updated_by is null then
        prior_points:=existing.points;
        update public.point_transactions set points=award_points where id=award_id;
        changed:=true;
        perform private.write_audit_log('points.transaction_updated','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
            'officer_id',target.officer_id,'time_slot_id',target.slot_id,
            'before_points',prior_points,'after_points',award_points,'updated_by',auth.uid(),
            'update_source','slot_reconciliation'));
      end if;
    else
      insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type,created_by)
        values(target.officer_id,p_event_id,target.slot_id,award_points,'Event time slot participation','participation',null)
        returning id into award_id;
      changed:=true;
    end if;
    if changed then
      perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
        pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
          'officer_id',target.officer_id,'time_slot_id',target.slot_id,
          'scheduled_hours',extract(epoch from (target.ends_at-target.starts_at))::numeric/3600,
          'rate',e.participation_points_per_hour_at_end,'points',award_points,
          'reactivated',existing.removed_at is not null));
      awarded:=array_append(awarded,award_id);
    end if;
  end loop;
  return awarded;
end;
$$;

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare finished_event public.events%rowtype; signup record; current_rate numeric;
  award_points numeric; scheduled_hours numeric; award_id bigint; award_count integer;
  event_count integer:=0; slot_awards bigint[];
begin
  for finished_event in select * from public.events
    where status<>'cancelled' and deleted_at is null and ends_at<=pg_catalog.now()
      and participation_points_per_hour_at_end is null
    order by id for update skip locked
  loop
    select participation_points_per_hour into current_rate from public.application_config where id=1 for share;
    if not found then raise exception 'Participation configuration not found'; end if;
    scheduled_hours:=extract(epoch from (finished_event.ends_at-finished_event.starts_at))::numeric/3600;
    award_points:=private.event_participation_points(finished_event.starts_at,finished_event.ends_at,current_rate);
    update public.events set participation_points_per_hour_at_end=current_rate where id=finished_event.id;
    award_count:=0;
    if exists(select 1 from public.event_time_slots where event_id=finished_event.id) then
      slot_awards:=private.award_selected_event_time_slots(finished_event.id,null,'skip');
      award_count:=cardinality(slot_awards);
    else
      for signup in select officer_id from public.event_officers where event_id=finished_event.id order by officer_id loop
        award_id:=null;
        insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
          values(signup.officer_id,finished_event.id,award_points,'Event participation','participation',null)
          on conflict do nothing returning id into award_id;
        if award_id is not null then
          award_count:=award_count+1;
          perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
            pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',finished_event.id,
              'officer_id',signup.officer_id,'scheduled_hours',scheduled_hours,'rate',current_rate,'points',award_points));
        end if;
      end loop;
    end if;
    perform private.write_audit_log('event.participation_processed','event',finished_event.id::text,
      pg_catalog.jsonb_build_object('rate',current_rate,'scheduled_hours',scheduled_hours,
        'awards_created',award_count,'event_kind',case when exists(select 1 from public.event_time_slots where event_id=finished_event.id)
          then 'slotted' else 'timed' end));
    event_count:=event_count+1;
  end loop;
  return event_count;
end;
$$;

create or replace function private.bulk_add_event_officers_compatible(p_event_id bigint,p_officer_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select Time Slots when adding Officers to this Event';
  end if;
  return private.bulk_add_event_officers(p_event_id,p_officer_ids);
end;
$$;

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

-- CREATE OR REPLACE retains existing execution privileges and guarded
-- public RPC contracts; no RLS policies or client table privileges change.

-- Match the form requirement for a nonblank reason, including whitespace-only
-- direct RPC submissions. Keep signed values, recipient guards and attribution.
create or replace function private.add_manual_transaction(
  p_officer_id bigint,p_event_id bigint,p_points numeric,p_reason text,p_award_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare saved_transaction_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if not exists (select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active';
  end if;
  if p_award_type not in ('manual','correction') or p_award_type is null then
    raise exception 'Invalid award type'; end if;
  if p_points is null or p_points=0 or
    p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Invalid point value'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'Reason required'; end if;
  insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
    values(p_officer_id,p_event_id,p_points,trim(p_reason),p_award_type,auth.uid())
    returning id into saved_transaction_id;
  perform private.write_audit_log(
    case when p_award_type='correction' then 'points.correction_created'
      else 'points.manual_created' end,
    'point_transaction',saved_transaction_id::text,
    pg_catalog.jsonb_build_object('officer_id',p_officer_id,'event_id',p_event_id,
      'points',p_points,'award_type',p_award_type,'reason',trim(p_reason)));
end;
$$;
