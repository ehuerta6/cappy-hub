-- Enforce closed historical academic periods inside every Event detail
-- mutation transaction. Gap-date Events opened with ?period=none remain
-- writable while no historical period covers their event_date, but a
-- retroactively created historical period immediately blocks stale forms.

-- Scoped Delete and Restore already call the single-Event functions inside
-- their transaction. Check the dates there, after the scope and Delete batch
-- determine which occurrences will actually change.
create or replace function private.delete_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events%rowtype;
  point_row public.point_transactions%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(event_row.event_date);
  if event_row.deleted_at is not null then return false; end if;

  update public.events set deleted_at=pg_catalog.clock_timestamp(),deleted_by=auth.uid(),
    delete_points_suspended=true where id=p_event_id;

  for point_row in
    select * from public.point_transactions
    where event_id=p_event_id and removed_at is null order by id for update
  loop
    update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
      removed_by=auth.uid(),removed_by_officer_id=actor_id,event_delete_suspended=true
      where id=point_row.id;
    perform private.write_audit_log('points.event_delete_suspended','point_transaction',point_row.id::text,
      pg_catalog.jsonb_build_object('transaction_id',point_row.id,'event_id',p_event_id,
        'officer_id',point_row.officer_id,'before',pg_catalog.to_jsonb(point_row),
        'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=point_row.id)));
  end loop;

  perform private.write_audit_log('event.deleted','event',p_event_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(event_row),
      'after',(select pg_catalog.to_jsonb(e) from public.events e where id=p_event_id),
      'signup_count',(select count(*) from public.event_officers where event_id=p_event_id),
      'time_slot_count',(select count(*) from public.event_time_slots where event_id=p_event_id),
      'point_count',(select count(*) from public.point_transactions where event_id=p_event_id),
      'suspended_point_count',(select count(*) from public.point_transactions
        where event_id=p_event_id and event_delete_suspended)));
  return true;
end;
$$;

create or replace function private.restore_deleted_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events%rowtype;
  point_row public.point_transactions%rowtype;
  actor_id bigint := private.current_active_officer_id();
  suspended_point_count integer := 0;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(event_row.event_date);
  if event_row.deleted_at is null then return; end if;

  update public.events set deleted_at=null,deleted_by=null,delete_points_suspended=false
    where id=p_event_id;

  if event_row.delete_points_suspended then
    for point_row in
      select * from public.point_transactions
      where event_id=p_event_id and event_delete_suspended order by id for update
    loop
      update public.point_transactions set removed_at=null,removed_by=null,
        removed_by_officer_id=null,event_delete_suspended=false where id=point_row.id;
      suspended_point_count:=suspended_point_count+1;
      perform private.write_audit_log('points.event_delete_restored','point_transaction',point_row.id::text,
        pg_catalog.jsonb_build_object('transaction_id',point_row.id,'event_id',p_event_id,
          'officer_id',point_row.officer_id,'before',pg_catalog.to_jsonb(point_row),
          'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=point_row.id)));
    end loop;

    if event_row.status<>'cancelled' then
      perform private.reconcile_event_participation(p_event_id);
    end if;
  end if;

  perform private.write_audit_log('event.restored','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',event_row.name,'event_date',event_row.event_date,
      'status',event_row.status,'recurrence_series_id',event_row.recurrence_series_id,
      'recurrence_key',event_row.recurrence_key,'deleted_at',event_row.deleted_at,
      'deleted_by',event_row.deleted_by,'suspended_point_count',suspended_point_count,
      'legacy_archive',not event_row.delete_points_suspended));
end;
$$;

create or replace function private.restore_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_event public.events%rowtype;
  restored_status text;
begin
  if private.current_active_officer_id() is null then
    raise exception 'Unauthorized';
  end if;

  select * into current_event
    from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then
    raise exception 'Event outside branch scope';
  end if;
  perform private.assert_event_period_writable(current_event.event_date);
  if current_event.deleted_at is not null or current_event.status <> 'cancelled' then
    raise exception 'This event cannot be restored';
  end if;

  restored_status := case
    when current_event.ends_at <= pg_catalog.now() then 'past'
    when current_event.starts_at <= pg_catalog.now() then 'happening'
    else 'upcoming'
  end;

  update public.events set status = restored_status where id = p_event_id;
  perform private.write_audit_log('event.restored', 'event', p_event_id::text,
    pg_catalog.jsonb_build_object(
      'name', current_event.name,
      'previous_status', current_event.status,
      'new_status', restored_status,
      'event_date', current_event.event_date,
      'starts_at', current_event.starts_at,
      'ends_at', current_event.ends_at));
end;
$$;

create or replace function private.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean,p_participation_type text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  manager boolean; changed_rows integer; award public.point_transactions%rowtype;
  slot_ids bigint[]; slot_selections jsonb; affected_awards bigint[]:='{}'::bigint[];
  removed_participation_type text;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_participation_type not in ('volunteer','attendee') then raise exception 'Select Volunteer or Attend'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  perform private.assert_event_period_writable(current_event.event_date);
  manager:=private.can_manage_event(p_event_id) or (current_event.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id));
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'Signups are closed for this event'; end if;
  if p_officer_id is distinct from actor_id and not manager then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if (current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=pg_catalog.now())
      and not manager then raise exception 'Signups are closed for this event'; end if;
  if not p_remove and exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    if p_participation_type='attendee' then raise exception 'Time Slot signups are for Volunteers'; end if;
    if coalesce(pg_catalog.current_setting('cappy.time_slot_signup',true),'off')<>'on' then
      raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  end if;
  if not p_remove then
    perform 1 from public.officers where id=p_officer_id and status='active' for share;
    if not found then raise exception 'Target officer is not active'; end if;
  end if;
  if p_remove then
    select eo.participation_type into removed_participation_type
      from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=p_officer_id
        and eo.removed_at is null for update;
    if found then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]),
        coalesce(jsonb_agg(to_jsonb(so) order by slot_id),'[]'::jsonb)
        into slot_ids,slot_selections
        from public.event_time_slot_officers so where event_id=p_event_id and officer_id=p_officer_id;
      for award in select p.* from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=p_officer_id and p.award_type='participation'
        and (p.removed_at is null or p.participation_schedule_suspended)
        and p.participation_superseded_at is null order by p.id for update
      loop
        update private.event_participation_basis set schedule_suspended=false where transaction_id=award.id;
        update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid(),
          removed_by_officer_id=actor_id,participation_schedule_suspended=false,
          participation_superseded_at=pg_catalog.clock_timestamp() where id=award.id;
        affected_awards:=pg_catalog.array_append(affected_awards,award.id);
        perform private.write_audit_log('points.participation_removed','point_transaction',award.id::text,
          pg_catalog.jsonb_build_object('transaction_id',award.id,'officer_id',p_officer_id,'event_id',p_event_id,
            'before',pg_catalog.to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
      update public.event_officers set removed_at=pg_catalog.clock_timestamp()
        where event_id=p_event_id and officer_id=p_officer_id and removed_at is null;
      get diagnostics changed_rows=row_count;
    else
      changed_rows:=0;
    end if;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id
      and removed_at is null and participation_type is distinct from p_participation_type) then
    update public.event_officers set participation_type=p_participation_type
      where event_id=p_event_id and officer_id=p_officer_id and removed_at is null
        and participation_type is distinct from p_participation_type;
    get diagnostics changed_rows=row_count;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
    update public.event_officers set removed_at=null,participation_type=p_participation_type
      where event_id=p_event_id and officer_id=p_officer_id and removed_at is not null;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if exists(select 1 from public.event_time_slot_officers x join public.event_time_slots s
          on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=p_event_id
          and x.officer_id=p_officer_id and s.capacity is not null
          and (select count(*) from public.event_time_slot_officers active_x
            join public.event_officers active_eo on active_eo.event_id=active_x.event_id
              and active_eo.officer_id=active_x.officer_id and active_eo.removed_at is null
            where active_x.slot_id=x.slot_id and active_x.officer_id<>p_officer_id)>=s.capacity) then
        raise exception 'A selected Time Slot is full'; end if;
      if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
        perform private.reconcile_event_participation(p_event_id,false);
      else
        perform private.reconcile_event_participation_for_roster(p_event_id,false,array[p_officer_id]);
      end if;
    end if;
  else
    insert into public.event_officers(event_id,officer_id,participation_type)
      values(p_event_id,p_officer_id,p_participation_type) on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
        perform private.reconcile_event_participation(p_event_id,false);
      else
        perform private.reconcile_event_participation_for_roster(p_event_id,false,array[p_officer_id]);
      end if;
    end if;
  end if;
  if changed_rows>0 then
    perform private.write_audit_log(case when p_remove and p_officer_id=actor_id then 'event.signout'
      when p_remove then 'event.officer_removed' when p_officer_id=actor_id then 'event.signup'
      else 'event.officer_assigned' end,'event',p_event_id::text,
      pg_catalog.jsonb_build_object('officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove,
        'participation_type',case when p_remove then removed_participation_type else p_participation_type end,
        'time_slot_ids',case when p_remove then slot_ids else null end,
        'removed_slot_selections',case when p_remove then slot_selections else null end,
        'participation_transaction_ids',case when p_remove then affected_awards else null end));
  end if;
  return not p_remove and changed_rows>0;
end;
$$;

create or replace function private.change_event_time_slot_signup(
  p_event_id bigint,p_officer_id bigint,p_slot_ids bigint[],p_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; actor_id bigint:=private.current_active_officer_id(); target_id bigint;
  slot_ids bigint[]; existing_signup boolean; added_slots bigint[]:='{}'::bigint[];
  removed_slots bigint[]:='{}'::bigint[]; new_signup boolean:=false; award_ids bigint[]:='{}'::bigint[];
  current_count bigint; selected_count bigint; preserve_slot_history boolean:=false; manager boolean;
  award public.point_transactions%rowtype; affected_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_mode not in ('join_selected','join_all','leave_selected','leave_all') then raise exception 'Invalid Time Slot signup mode'; end if;
  target_id:=coalesce(p_officer_id,actor_id);
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  perform private.assert_event_period_writable(e.event_date);
  manager:=private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id));
  if target_id<>actor_id and not manager then
    raise exception 'Cannot manage another Officer signup for this Event'; end if;
  preserve_slot_history:=p_mode='leave_all' and private.can_manage_event(p_event_id)
    and (e.ends_at<=pg_catalog.now() or e.participation_points_per_hour_at_end is not null);
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept Time Slot signups'; end if;
  if not exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'This Event has no volunteer Time Slots'; end if;
  if target_id=actor_id and not private.can_manage_event(p_event_id) and
    (e.participation_points_per_hour_at_end is not null or e.ends_at<=pg_catalog.now()) then
    raise exception 'Signups are closed for this Event'; end if;
  if not preserve_slot_history then
    perform 1 from public.officers where id=target_id and status='active' for share;
    if not found then raise exception 'Target Officer is not active'; end if;
  end if;
  existing_signup:=exists(select 1 from public.event_officers where event_id=p_event_id
    and officer_id=target_id and removed_at is null);
  if p_mode in ('join_all','join_selected') then
    if p_mode='join_all' then
      select array_agg(id order by starts_at,id) into slot_ids from public.event_time_slots where event_id=p_event_id;
    else
      if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
        raise exception 'Select at least one Time Slot'; end if;
      select array_agg(id order by id) into slot_ids from (select distinct unnest(p_slot_ids) id) q;
      if exists(select 1 from unnest(slot_ids) x left join public.event_time_slots s
          on s.id=x and s.event_id=p_event_id where s.id is null) then
        raise exception 'One or more Time Slots do not belong to this Event'; end if;
    end if;
    if not existing_signup then
      if exists(select 1 from public.event_officers inactive where inactive.event_id=p_event_id
          and inactive.officer_id=target_id and inactive.removed_at is not null
          and exists(select 1 from public.event_time_slot_officers prior
            where prior.event_id=p_event_id and prior.officer_id=target_id)) then
        raise exception 'This removed Time Slot signup cannot be restored'; end if;
      if e.max_volunteers is not null and (select count(*) from public.event_officers
          where event_id=p_event_id and removed_at is null)>=e.max_volunteers then
        raise exception 'Event capacity has been reached'; end if;
      if exists(select 1 from public.event_time_slot_officers prior
          join public.event_time_slots prior_slot on prior_slot.id=prior.slot_id and prior_slot.event_id=prior.event_id
          where prior.event_id=p_event_id and prior.officer_id=target_id and prior_slot.capacity is not null
            and (select count(*) from public.event_time_slot_officers active
              join public.event_officers active_signup on active_signup.event_id=active.event_id
                and active_signup.officer_id=active.officer_id and active_signup.removed_at is null
              where active.slot_id=prior.slot_id and active.officer_id<>target_id)>=prior_slot.capacity) then
        raise exception 'A selected Time Slot is full'; end if;
      if exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=target_id) then
        update public.event_officers set removed_at=null where event_id=p_event_id and officer_id=target_id;
      else
        insert into public.event_officers(event_id,officer_id) values(p_event_id,target_id);
      end if;
      new_signup:=true;
    end if;
    for current_count in select unnest(slot_ids) loop
      if not exists(select 1 from public.event_time_slot_officers where event_id=p_event_id
          and slot_id=current_count and officer_id=target_id) then
        select capacity into selected_count from public.event_time_slots where id=current_count and event_id=p_event_id for update;
        if selected_count is not null and (select count(*) from public.event_time_slot_officers x
            join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
              and eo.removed_at is null where x.slot_id=current_count)>=selected_count then
          raise exception 'A selected Time Slot is full; no Time Slot selections were added'; end if;
        insert into public.event_time_slot_officers(event_id,slot_id,officer_id,created_by)
          values(p_event_id,current_count,target_id,auth.uid()) on conflict(slot_id,officer_id) do nothing;
        added_slots:=array_append(added_slots,current_count);
      end if;
    end loop;
    if e.ends_at<=pg_catalog.now() then
      if e.participation_points_per_hour_at_end is null then
        update public.events set participation_points_per_hour_at_end=2,
          participation_rate_version='volunteer_attendee' where id=p_event_id;
      end if;
      award_ids:=private.award_selected_event_time_slots(p_event_id,array[target_id],'raise');
    end if;
  else
    if p_mode='leave_all' then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]) into slot_ids
        from public.event_time_slot_officers where event_id=p_event_id and officer_id=target_id;
    else
      if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
        raise exception 'Select at least one Time Slot'; end if;
      select array_agg(id order by id) into slot_ids from (select distinct unnest(p_slot_ids) id) q;
      if exists(select 1 from unnest(slot_ids) x left join public.event_time_slots s
          on s.id=x and s.event_id=p_event_id where s.id is null) then
        raise exception 'One or more Time Slots do not belong to this Event'; end if;
    end if;
    if not preserve_slot_history then
      delete from public.event_time_slot_officers where event_id=p_event_id
        and officer_id=target_id and slot_id=any(slot_ids);
      get diagnostics selected_count=row_count;
    else
      selected_count:=cardinality(slot_ids);
    end if;
    removed_slots:=slot_ids;
    if preserve_slot_history or not exists(select 1 from public.event_time_slot_officers
        where event_id=p_event_id and officer_id=target_id) then
      update public.event_officers set removed_at=pg_catalog.clock_timestamp()
        where event_id=p_event_id and officer_id=target_id and removed_at is null;
    end if;
    if preserve_slot_history then
      for award in select p.* from public.point_transactions p
        where p.event_id=p_event_id and p.officer_id=target_id and p.award_type='participation'
          and p.event_time_slot_id=any(slot_ids)
          and (p.removed_at is null or p.participation_schedule_suspended)
          and p.participation_superseded_at is null order by p.id for update
      loop
        update private.event_participation_basis set schedule_suspended=false
          where transaction_id=award.id;
        update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid(),
          removed_by_officer_id=actor_id,participation_schedule_suspended=false,
          participation_superseded_at=pg_catalog.clock_timestamp() where id=award.id;
        affected_awards:=array_append(affected_awards,award.id);
        perform private.write_audit_log('points.participation_removed','point_transaction',award.id::text,
          pg_catalog.jsonb_build_object('transaction_id',award.id,'officer_id',target_id,'event_id',p_event_id,
            'before',to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
    end if;
  end if;
  if new_signup or cardinality(added_slots)>0 or cardinality(removed_slots)>0 then
    perform private.write_audit_log('event.time_slot_signup_changed','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',target_id,'actor_id',actor_id,
        'mode',p_mode,'added_slot_ids',added_slots,'removed_slot_ids',removed_slots,
        'canonical_signup_created',new_signup,'participation_transaction_ids',affected_awards));
  end if;
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',target_id,'mode',p_mode,
    'added_slot_ids',added_slots,'removed_slot_ids',removed_slots,'award_transaction_ids',award_ids);
end;
$$;

create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[],p_participation_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_targets bigint[];
  target record; award_id bigint; awarded_ids bigint[]:='{}'::bigint[];
  rate numeric; award_points numeric; scheduled_hours numeric;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_participation_type not in ('volunteer','attendee') then raise exception 'Select Volunteer or Attend'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select Time Slots when adding Officers to this Event';
  end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid officer';
  end if;
  select pg_catalog.array_agg(id order by id) into requested_ids
    from (select distinct unnest(p_officer_ids) id) submitted;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not (private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id))) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(e.event_date);
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept signups'; end if;
  if e.participation_points_per_hour_at_end is not null and e.ends_at>pg_catalog.now() then
    raise exception 'Signups are closed for this Event';
  end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active' order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active';
  end if;
  if e.max_volunteers is not null and
    (select count(*) from public.event_officers eo where eo.event_id=p_event_id and eo.removed_at is null)
      +(select count(*) from unnest(requested_ids) id where not exists(
        select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=id and eo.removed_at is null))
      >e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity';
  end if;
  with reactivated as (
    update public.event_officers set participation_type=p_participation_type,removed_at=null
      where event_id=p_event_id and officer_id=any(requested_ids) and removed_at is not null
      returning officer_id
  ), inserted as (
    insert into public.event_officers(event_id,officer_id,participation_type)
    select p_event_id,id,p_participation_type from unnest(requested_ids) submitted(id)
    where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=submitted.id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(pg_catalog.array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids
    from (select officer_id from reactivated union all select officer_id from inserted) changed;
  if e.ends_at<=pg_catalog.now() then
    if e.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=2,
        participation_rate_version='volunteer_attendee' where id=p_event_id;
      select coalesce(pg_catalog.array_agg(officer_id order by officer_id),'{}'::bigint[])
        into award_targets from public.event_officers where event_id=p_event_id and removed_at is null;
    else
      award_targets:=requested_ids;
    end if;
    scheduled_hours:=extract(epoch from (e.ends_at-e.starts_at))::numeric/3600;
    for target in select eo.officer_id,eo.participation_type from public.event_officers eo
      where eo.event_id=p_event_id and eo.officer_id=any(award_targets) and eo.removed_at is null
      order by eo.officer_id
    loop
      rate:=private.event_participation_rate(case when e.participation_points_per_hour_at_end is null
        then 'volunteer_attendee' else e.participation_rate_version end,target.participation_type);
      award_points:=private.event_participation_points(e.starts_at,e.ends_at,rate);
      award_id:=null;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
        values(target.officer_id,p_event_id,award_points,'Event participation','participation',null)
        on conflict do nothing returning id into award_id;
      if award_id is not null then
        awarded_ids:=pg_catalog.array_append(awarded_ids,award_id);
        perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
            'officer_id',target.officer_id,'participation_type',target.participation_type,
            'scheduled_hours',scheduled_hours,'rate',rate,'points',award_points));
      end if;
    end loop;
  end if;
  perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
    pg_catalog.jsonb_build_object('event_id',p_event_id,'actor_officer_id',actor_id,
      'officer_ids',added_ids,'participation_type',p_participation_type,
      'participation_awards_created',awarded_ids));
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_point_ids',awarded_ids,'participation_type',p_participation_type);
end;
$$;

create or replace function private.bulk_add_event_officers_to_slots(
  p_event_id bigint,p_officer_ids bigint[],p_slot_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  target_ids bigint[]; selected_slots bigint[]; added_ids bigint[]; award_ids bigint[]:='{}'::bigint[];
  confirmed_count bigint; new_count bigint; slot record; new_for_slot bigint;
  current_rate numeric; snapshot_created boolean:=false;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid Officer'; end if;
  if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
    raise exception 'Select at least one Time Slot'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not (private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id))) then
    raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(e.event_date);
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept attendees'; end if;
  if not exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'This Event has no volunteer Time Slots'; end if;
  select array_agg(id order by id) into target_ids from (select distinct unnest(p_officer_ids) id) q;
  select array_agg(id order by id) into selected_slots from (select distinct unnest(p_slot_ids) id) q;
  if exists(select 1 from unnest(target_ids) x left join public.officers o on o.id=x
      where o.id is null or o.status<>'active') then raise exception 'All target Officers must be active'; end if;
  if exists(select 1 from unnest(selected_slots) x left join public.event_time_slots s
      on s.id=x and s.event_id=p_event_id where s.id is null) then
    raise exception 'One or more Time Slots do not belong to this Event'; end if;
  if exists(select 1 from public.event_officers inactive
      where inactive.event_id=p_event_id and inactive.officer_id=any(target_ids)
        and inactive.removed_at is not null
        and exists(select 1 from public.event_time_slot_officers prior
          where prior.event_id=p_event_id and prior.officer_id=inactive.officer_id)) then
    raise exception 'This removed Time Slot signup cannot be restored'; end if;
  perform 1 from public.officers where id=any(target_ids) order by id for share;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id and removed_at is null);
  new_count:=(select count(*) from unnest(target_ids) x where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=x and eo.removed_at is null));
  if e.max_volunteers is not null and confirmed_count+new_count>e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  for slot in select id,capacity from public.event_time_slots where id=any(selected_slots) order by id for update loop
    new_for_slot:=(select count(*) from unnest(target_ids) x where not exists(
      select 1 from public.event_time_slot_officers so join public.event_officers eo
        on eo.event_id=so.event_id and eo.officer_id=so.officer_id and eo.removed_at is null
      where so.slot_id=slot.id and so.officer_id=x));
    if slot.capacity is not null and (select count(*) from public.event_time_slot_officers so
        join public.event_officers eo on eo.event_id=so.event_id and eo.officer_id=so.officer_id
          and eo.removed_at is null where so.slot_id=slot.id)+new_for_slot>slot.capacity then
      raise exception 'The selected Officers exceed a Time Slot capacity'; end if;
  end loop;
  if exists(select 1 from public.event_time_slot_officers prior
      join public.event_time_slots prior_slot on prior_slot.id=prior.slot_id and prior_slot.event_id=prior.event_id
      where prior.event_id=p_event_id and prior.officer_id=any(target_ids) and prior_slot.capacity is not null
        and exists(select 1 from public.event_officers inactive
          where inactive.event_id=p_event_id and inactive.officer_id=prior.officer_id and inactive.removed_at is not null)
        and (select count(*) from public.event_time_slot_officers active
          join public.event_officers active_signup on active_signup.event_id=active.event_id
            and active_signup.officer_id=active.officer_id and active_signup.removed_at is null
          where active.slot_id=prior.slot_id and active.officer_id<>prior.officer_id)>=prior_slot.capacity) then
    raise exception 'A previously selected Time Slot is full'; end if;
  with reactivated as (
    update public.event_officers set removed_at=null where event_id=p_event_id
      and officer_id=any(target_ids) and removed_at is not null returning officer_id
  ), inserted as (
    insert into public.event_officers(event_id,officer_id)
      select p_event_id,x from unnest(target_ids) x
      where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=x)
      on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids
    from (select officer_id from reactivated union all select officer_id from inserted) changed;
  insert into public.event_time_slot_officers(event_id,slot_id,officer_id,created_by)
    select p_event_id,sid,oid,auth.uid() from unnest(selected_slots) sid cross join unnest(target_ids) oid
    on conflict(slot_id,officer_id) do nothing;
  if e.ends_at<=pg_catalog.now() then
    if e.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=2,
        participation_rate_version='volunteer_attendee' where id=p_event_id;
      snapshot_created:=true;
    end if;
    current_rate:=private.event_participation_rate(case when snapshot_created
      then 'volunteer_attendee' else e.participation_rate_version end,'volunteer');
    if snapshot_created then award_ids:=private.award_selected_event_time_slots(p_event_id,null,'raise');
    else award_ids:=private.award_selected_event_time_slots(p_event_id,target_ids,'raise'); end if;
  end if;
  if cardinality(added_ids)>0 or cardinality(award_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'time_slot_ids',selected_slots,'participation_transaction_ids',award_ids,
        'participation_rate',current_rate,'snapshot_created',snapshot_created));
  end if;
  return jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'time_slot_ids',selected_slots,'award_transaction_ids',award_ids,'rate',current_rate);
end;
$$;

create or replace function private.correct_historical_event_time_slots(
  p_event_id bigint,
  p_officer_id bigint,
  p_slot_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.events%rowtype;
  actor_id bigint:=private.current_active_officer_id();
  current_slot_ids bigint[];
  selected_slot_ids bigint[];
  before_assignments jsonb;
  after_assignments jsonb;
  changed_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(event_row.event_date);
  if event_row.deleted_at is not null then raise exception 'Deleted Events cannot be corrected'; end if;
  if event_row.status='cancelled' then raise exception 'Cancelled Events cannot be corrected'; end if;
  if event_row.ends_at>pg_catalog.now() then raise exception 'Only historical Events can be corrected'; end if;
  if p_slot_ids is null or array_position(p_slot_ids,null) is not null then
    raise exception 'Select a valid Time Slot set';
  end if;
  if not exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'This Event has no volunteer Time Slots';
  end if;

  perform 1 from public.event_officers
    where event_id=p_event_id and officer_id=p_officer_id and removed_at is null for update;
  if not found then raise exception 'Officer must have a confirmed Event signup'; end if;

  select coalesce(array_agg(distinct id order by id),'{}'::bigint[])
    into selected_slot_ids from unnest(p_slot_ids) as requested(id);
  if exists(select 1 from unnest(selected_slot_ids) requested(id)
      left join public.event_time_slots slot on slot.id=requested.id and slot.event_id=p_event_id
      where slot.id is null) then
    raise exception 'One or more Time Slots do not belong to this Event';
  end if;

  select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]),
      coalesce(jsonb_agg(to_jsonb(assignment) order by slot_id),'[]'::jsonb)
    into current_slot_ids,before_assignments
    from public.event_time_slot_officers assignment
    where assignment.event_id=p_event_id and assignment.officer_id=p_officer_id;

  if current_slot_ids=selected_slot_ids then
    return jsonb_build_object('event_id',p_event_id,'officer_id',p_officer_id,
      'slot_ids',selected_slot_ids,'changed',false,'participation_transaction_ids','[]'::jsonb);
  end if;

  if exists(select 1 from unnest(selected_slot_ids) requested(id)
      where not (requested.id=any(current_slot_ids))) then
    perform 1 from public.officers where id=p_officer_id and status='active' for share;
    if not found then raise exception 'Target Officer must be active for new Time Slot assignments'; end if;
  end if;

  delete from public.event_time_slot_officers
    where event_id=p_event_id and officer_id=p_officer_id
      and not (slot_id=any(selected_slot_ids));

  insert into public.event_time_slot_officers(event_id,slot_id,officer_id,created_by)
    select p_event_id,requested.id,p_officer_id,auth.uid()
    from unnest(selected_slot_ids) requested(id)
    where not (requested.id=any(current_slot_ids));

  changed_awards:=private.reconcile_event_participation_for_roster(
    p_event_id,false,array[p_officer_id]);

  select coalesce(jsonb_agg(to_jsonb(assignment) order by slot_id),'[]'::jsonb)
    into after_assignments from public.event_time_slot_officers assignment
    where assignment.event_id=p_event_id and assignment.officer_id=p_officer_id;

  perform private.write_audit_log('event.time_slot_assignments_corrected','event',p_event_id::text,
    jsonb_build_object('event_id',p_event_id,'officer_id',p_officer_id,'actor_id',actor_id,
      'before',before_assignments,'after',after_assignments,
      'participation_transaction_ids',changed_awards));

  return jsonb_build_object('event_id',p_event_id,'officer_id',p_officer_id,
    'slot_ids',selected_slot_ids,'changed',true,
    'participation_transaction_ids',changed_awards);
end;
$$;

-- Preserve legacy archive semantics while enforcing the same date guard.
create or replace function private.remove_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare old_event public.events; branch_ids bigint[];
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into old_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(old_event.event_date);
  if old_event.deleted_at is not null then return false; end if;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into branch_ids from public.event_branches where event_id=p_event_id;
  update public.events set deleted_at=pg_catalog.clock_timestamp(),deleted_by=auth.uid()
    where id=p_event_id;
  perform private.write_audit_log('event.archived','event',p_event_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(old_event),
      'branch_ids',branch_ids,'signup_count',
      (select count(*) from public.event_officers where event_id=p_event_id),
      'point_count',(select count(*) from public.point_transactions where event_id=p_event_id),
      'archived_by',auth.uid()));
  return true;
end;
$$;

-- Keep the legacy bulk-roster RPC aligned with the checked overload.
create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_transaction_ids bigint[]:='{}'::bigint[];
  awarded_ids bigint[]:='{}'::bigint[]; point_values numeric[]:='{}'::numeric[];
  snapshot_created boolean:=false; confirmed_count bigint; new_count bigint;
  current_rate numeric; award_points numeric; scheduled_hours numeric;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid officer'; end if;
  select array_agg(id order by id) into requested_ids from
    (select distinct unnest(p_officer_ids) as id) submitted;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  perform private.assert_event_period_writable(current_event.event_date);
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'This event cannot accept attendees'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active'
    order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active'; end if;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id and removed_at is null);
  new_count:=(select count(*) from unnest(requested_ids) as requested(officer_id) where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=requested.officer_id and eo.removed_at is null));
  if current_event.max_volunteers is not null and confirmed_count+new_count>current_event.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  with reactivated as (
    update public.event_officers set removed_at=null where event_id=p_event_id
      and officer_id=any(requested_ids) and removed_at is not null returning officer_id
  ), inserted as (
    insert into public.event_officers(event_id,officer_id)
    select p_event_id,requested.officer_id from unnest(requested_ids) as requested(officer_id)
    where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=requested.officer_id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids
    from (select officer_id from reactivated union all select officer_id from inserted) changed;
  if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
    update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
    snapshot_created:=true;
  end if;
  if current_event.ends_at<=pg_catalog.now() then
    current_rate:=1;
    scheduled_hours:=extract(epoch from(current_event.ends_at-current_event.starts_at))::numeric/3600;
    award_points:=private.event_participation_points(current_event.starts_at,current_event.ends_at,current_rate);
  end if;
  if current_event.ends_at<=pg_catalog.now() then
    award_transaction_ids:=case when snapshot_created
      then private.reconcile_event_participation(p_event_id,false)
      else private.reconcile_event_participation_for_roster(p_event_id,false,requested_ids)
    end;
    select coalesce(array_agg(distinct p.officer_id order by p.officer_id),'{}'::bigint[]),
      coalesce(array_agg(distinct p.points order by p.points),'{}'::numeric[])
      into awarded_ids,point_values from public.point_transactions p
      where p.id=any(award_transaction_ids) and p.award_type='participation';
  end if;
  if cardinality(added_ids)>0 or cardinality(award_transaction_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'participation_transaction_ids',award_transaction_ids,
        'participation_awards_created',awarded_ids,'participation_rate',current_rate,
        'points_per_officer',award_points,'scheduled_hours',scheduled_hours,
        'snapshot_created',snapshot_created));
  end if;
  return jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_officer_ids',awarded_ids,'points_per_officer',point_values[1]);
end;
$$;
