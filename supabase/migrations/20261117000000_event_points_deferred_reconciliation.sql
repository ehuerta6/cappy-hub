-- Issue #442: keep Event participation Points consistent across every path.
--
-- 1. Moving an already-awarded Event into the future suspends its automatic
--    participation Points but keeps the Event's processing snapshot, and the
--    scheduled processor only selected Events without a snapshot. Suspended
--    awards (and premature-removal replacements confirmed before the corrected
--    end) therefore never returned without another edit. The processor now
--    also reconciles ended, processed Events that still have such pending
--    eligible participation.
-- 2. The roster and selected-slot helpers, and the slot signup paths that
--    create the processing snapshot, still used one Point per hour and
--    stamped new Events as legacy. Bulk add used the new rates even on legacy
--    Events. Every path now selects the rate from the Event's stored rate
--    version and the signup's participation type, matching
--    private.reconcile_event_participation.
--
-- Legacy Events keep their stored version; nothing reprices existing awards,
-- and intentional removals stay excluded.

-- Volunteer/Attendee Events: Volunteers 2/hour, Attendees 1/hour. Legacy
-- Events keep the one/hour correction rate already used by reconciliation.
create function private.event_participation_rate(
  p_rate_version text,p_participation_type text
) returns numeric language sql immutable security invoker set search_path = '' as $$
  select case when p_rate_version='volunteer_attendee'
    then case when p_participation_type='attendee' then 1 else 2 end
    else 1 end::numeric
$$;
revoke all on function private.event_participation_rate(text,text) from public,anon,authenticated;

-- True when an ended, processed Event has eligible participation that
-- reconciliation would restore: a schedule-suspended award, or a confirmed
-- premature removal without a replacement. Eligibility mirrors the targets of
-- private.reconcile_event_participation, so withdrawn signups and deliberate
-- removals never keep an Event pending.
create function private.event_has_deferred_participation(p_event_id bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  with targets as (
    select eo.officer_id,null::bigint slot_id from public.event_officers eo
      where eo.event_id=p_event_id and eo.removed_at is null
        and not exists(select 1 from public.event_time_slots s where s.event_id=p_event_id)
    union all
    select x.officer_id,x.slot_id from public.event_time_slot_officers x
      join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
        and eo.removed_at is null
      where x.event_id=p_event_id
  )
  select exists(select 1 from targets t where
    exists(select 1 from public.point_transactions p where p.event_id=p_event_id
      and p.officer_id=t.officer_id and p.event_time_slot_id is not distinct from t.slot_id
      and p.award_type='participation' and p.participation_superseded_at is null
      and p.removed_at is not null and p.participation_schedule_suspended)
    or (exists(select 1 from public.point_transactions p where p.event_id=p_event_id
          and p.officer_id=t.officer_id and p.event_time_slot_id is not distinct from t.slot_id
          and p.award_type='participation' and p.participation_superseded_at is not null)
        and not exists(select 1 from public.point_transactions p where p.event_id=p_event_id
          and p.officer_id=t.officer_id and p.event_time_slot_id is not distinct from t.slot_id
          and p.award_type='participation' and p.participation_superseded_at is null)))
$$;
revoke all on function private.event_has_deferred_participation(bigint) from public,anon,authenticated;

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  finished_event public.events%rowtype; signup record; award_id bigint;
  award_points numeric; award_count integer; event_count integer:=0;
  slot_awards bigint[];
begin
  for finished_event in select * from public.events
    where status<>'cancelled' and deleted_at is null and ends_at<=pg_catalog.now()
      and participation_points_per_hour_at_end is null
    order by id for update skip locked
  loop
    update public.events set participation_points_per_hour_at_end=2,
      participation_rate_version='volunteer_attendee' where id=finished_event.id;
    award_count:=0;
    if exists(select 1 from public.event_time_slots where event_id=finished_event.id) then
      slot_awards:=private.award_new_finished_event_time_slots(finished_event.id);
      award_count:=cardinality(slot_awards);
    else
      for signup in select officer_id,participation_type from public.event_officers
        where event_id=finished_event.id and removed_at is null order by officer_id
      loop
        award_points:=private.event_participation_points(finished_event.starts_at,finished_event.ends_at,
          case signup.participation_type when 'volunteer' then 2 else 1 end);
        award_id:=null;
        insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
          values(signup.officer_id,finished_event.id,award_points,'Event participation','participation',null)
          on conflict do nothing returning id into award_id;
        if award_id is not null then
          award_count:=award_count+1;
          perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
            pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',finished_event.id,
              'officer_id',signup.officer_id,'participation_type',signup.participation_type,
              'scheduled_hours',extract(epoch from (finished_event.ends_at-finished_event.starts_at))::numeric/3600,
              'rate',case signup.participation_type when 'volunteer' then 2 else 1 end,
              'points',award_points));
        end if;
      end loop;
    end if;
    perform private.write_audit_log('event.participation_processed','event',finished_event.id::text,
      pg_catalog.jsonb_build_object('awards_created',award_count,'participation_rate','volunteer:2,attendee:1'));
    event_count:=event_count+1;
  end loop;
  -- Deferred pass: Events already processed before a future-date correction
  -- reconcile once their corrected end passes, without another user edit.
  for finished_event in select * from public.events
    where status<>'cancelled' and deleted_at is null and ends_at<=pg_catalog.now()
      and participation_points_per_hour_at_end is not null
      and exists(select 1 from public.point_transactions p where p.event_id=events.id
        and p.award_type='participation'
        and ((p.removed_at is not null and p.participation_schedule_suspended)
          or p.participation_superseded_at is not null))
      and private.event_has_deferred_participation(events.id)
    order by id for update skip locked
  loop
    perform private.reconcile_event_participation(finished_event.id,false);
    event_count:=event_count+1;
  end loop;
  return event_count;
end;
$$;
revoke all on function private.process_finished_events() from public,anon,authenticated;

create or replace function private.reconcile_event_participation_for_roster(
  p_event_id bigint,
  p_source_changed boolean,
  p_officer_ids bigint[]
) returns bigint[] language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
 basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
 changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean;
 basis_missing boolean; rate numeric;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.deleted_at is not null or e.status='cancelled' then return changed; end if;
 if e.ends_at>pg_catalog.now() then
  for award in select p.* from public.point_transactions p where p.event_id=p_event_id
   and (p_officer_ids is null or p.officer_id=any(p_officer_ids))
   and p.award_type='participation' and p.removed_at is null and p.participation_superseded_at is null
   order by p.id for update
  loop
   select * into basis from private.event_participation_basis where transaction_id=award.id;
   basis_missing:=not found;
   insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
    values(award.id,e.starts_at,e.ends_at,true)
    on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=true;
   update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=null,
    removed_by_officer_id=null,participation_schedule_suspended=true where id=award.id;
   perform private.write_audit_log('points.participation_suspended','point_transaction',award.id::text,
    jsonb_build_object('transaction_id',award.id,'event_id',e.id,'before',to_jsonb(award),
     'previous_basis_known',not basis_missing,
     'previous_basis',case when basis_missing then null else to_jsonb(basis) end,
     'corrected_starts_at',e.starts_at,'corrected_ends_at',e.ends_at,'suspension_source','schedule_correction'));
  end loop;
  return changed;
 end if;
 update public.events set participation_points_per_hour_at_end=coalesce(participation_points_per_hour_at_end,2),
  participation_rate_version=case when participation_points_per_hour_at_end is null
   then 'volunteer_attendee' else participation_rate_version end
  where id=e.id and participation_points_per_hour_at_end is null;
 if e.participation_points_per_hour_at_end is null then e.participation_rate_version:='volunteer_attendee'; end if;
 for target in
  select eo.officer_id,null::bigint slot_id,e.starts_at starts_at,e.ends_at ends_at,eo.participation_type
   from public.event_officers eo where eo.event_id=e.id
   and eo.removed_at is null
   and (p_officer_ids is null or eo.officer_id=any(p_officer_ids))
   and not exists(select 1 from public.event_time_slots s where s.event_id=e.id)
  union all
  select x.officer_id,s.id,s.starts_at,s.ends_at,'volunteer'::text from public.event_time_slot_officers x
   join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=e.id
   and exists(select 1 from public.event_officers eo where eo.event_id=x.event_id
     and eo.officer_id=x.officer_id and eo.removed_at is null)
   and (p_officer_ids is null or x.officer_id=any(p_officer_ids))
  order by officer_id,slot_id nulls first
 loop
  rate:=private.event_participation_rate(e.participation_rate_version,target.participation_type);
  amount:=private.event_participation_points(target.starts_at,target.ends_at,rate);
  select * into award from public.point_transactions p where p.event_id=e.id and p.officer_id=target.officer_id
   and p.award_type='participation' and p.event_time_slot_id is not distinct from target.slot_id
   and p.participation_superseded_at is null for update;
  if not found then
   insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type)
    values(target.officer_id,e.id,target.slot_id,amount,
      case when target.slot_id is null then 'Event participation' else 'Event time slot participation' end,'participation')
    returning id into award_id;
   perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
    jsonb_build_object('transaction_id',award_id,'event_id',e.id,'officer_id',target.officer_id,
     'time_slot_id',target.slot_id,'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,
     'scheduled_hours',extract(epoch from(target.ends_at-target.starts_at))::numeric/3600,
     'rate',rate,'participation_type',target.participation_type,'points',amount,'supersedes_transaction_id',(select max(p.id) from public.point_transactions p
       where p.event_id=e.id and p.officer_id=target.officer_id and p.event_time_slot_id is not distinct from target.slot_id
       and p.participation_superseded_at is not null)));
   changed:=array_append(changed,award_id);
  else
   select * into basis from private.event_participation_basis where transaction_id=award.id;
   basis_missing:=not found;
   if award.removed_at is not null and not coalesce(basis.schedule_suspended,false)
      and not award.slot_selection_removed then continue; end if;
   if p_source_changed or coalesce(basis.schedule_suspended,false) or award.slot_selection_removed then
    prior_points:=award.points; was_removed:=award.removed_at is not null;
    update public.point_transactions set points=amount,removed_at=null,removed_by=null,removed_by_officer_id=null,
     participation_schedule_suspended=false,slot_selection_removed=false
     where id=award.id;
    insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
     values(award.id,target.starts_at,target.ends_at,false)
     on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=false;
    if prior_points is distinct from amount or was_removed or basis_missing then
     perform private.write_audit_log('points.participation_reconciled','point_transaction',award.id::text,
      jsonb_build_object('transaction_id',award.id,'event_id',e.id,'officer_id',award.officer_id,
       'before_points',prior_points,'after_points',amount,
       'previous_basis_known',not basis_missing,
       'previous_basis',case when basis_missing then null else to_jsonb(basis) end,
       'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,'rate',rate,'participation_type',target.participation_type,'reactivated',was_removed));
     changed:=array_append(changed,award.id);
    end if;
   end if;
  end if;
 end loop;
 return changed;
end;
$$;
revoke all on function private.reconcile_event_participation_for_roster(bigint,boolean,bigint[]) from public,anon,authenticated;

create or replace function private.award_selected_event_time_slots(p_event_id bigint,
  p_officer_ids bigint[] default null,p_manual_conflict text default 'skip') returns bigint[]
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award_id bigint; award_points numeric;
  awarded bigint[]:='{}'::bigint[]; existing public.point_transactions%rowtype;
  changed boolean; prior_points numeric; award_rate numeric;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or e.ends_at>pg_catalog.now() or e.participation_points_per_hour_at_end is null then return awarded; end if;
  award_rate:=private.event_participation_rate(e.participation_rate_version,'volunteer');
  for target in select x.officer_id,x.slot_id,s.starts_at,s.ends_at
    from public.event_time_slot_officers x join public.event_time_slots s
      on s.id=x.slot_id and s.event_id=x.event_id
    join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
      and eo.removed_at is null
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
    award_points:=private.event_participation_points(target.starts_at,target.ends_at,award_rate);
    select * into existing from public.point_transactions p where p.officer_id=target.officer_id
      and p.event_time_slot_id=target.slot_id and p.award_type='participation'
      and p.participation_superseded_at is null for update;
    if found then
      if existing.removed_at is not null and not existing.slot_selection_removed then continue; end if;
      if existing.removed_at is not null then
        update public.point_transactions set removed_at=null,removed_by=null,removed_by_officer_id=null,
          participation_schedule_suspended=false,slot_selection_removed=false
          where id=existing.id returning id into award_id;
        changed:=true;
      else award_id:=existing.id; end if;
      if existing.points is distinct from award_points and existing.updated_by is null
          and exists(select 1 from private.event_participation_basis b where b.transaction_id=existing.id
            and (b.starts_at is distinct from target.starts_at or b.ends_at is distinct from target.ends_at)) then
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
          'rate',award_rate,'participation_type','volunteer','points',award_points,'reactivated',existing.removed_at is not null));
      awarded:=array_append(awarded,award_id);
    end if;
  end loop;
  return awarded;
end;
$$;
revoke all on function private.award_selected_event_time_slots(bigint,bigint[],text) from public,anon,authenticated;

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
revoke all on function private.change_event_time_slot_signup(bigint,bigint,bigint[],text) from public,anon,authenticated;
grant execute on function private.change_event_time_slot_signup(bigint,bigint,bigint[],text) to authenticated;

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
revoke all on function private.bulk_add_event_officers(bigint,bigint[],text) from public,anon,authenticated;
grant execute on function private.bulk_add_event_officers(bigint,bigint[],text) to authenticated;

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
revoke all on function private.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[]) from public,anon,authenticated;
grant execute on function private.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[]) to authenticated;
