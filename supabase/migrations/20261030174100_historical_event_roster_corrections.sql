-- Roster edits reconcile only selected Officers. Keep the existing full-Event
-- reconciler signature intact for schedule corrections and processing.
alter table public.event_officers add column removed_at timestamptz;

create function private.release_presenter_slots_on_signup_removal()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior_reason text:=pg_catalog.current_setting('cappy.presentation_release_reason',true);
begin
  if old.removed_at is null and new.removed_at is not null then
    perform pg_catalog.set_config('cappy.presentation_release_reason','signup_removed',true);
    update public.presentation_slots set officer_id=null
      where event_id=old.event_id and officer_id=old.officer_id;
    perform pg_catalog.set_config('cappy.presentation_release_reason',coalesce(prior_reason,''),true);
  end if;
  return new;
end;
$$;
revoke all on function private.release_presenter_slots_on_signup_removal() from public,anon,authenticated;
create trigger event_officers_release_presenter_slots_on_removal
  before update of removed_at on public.event_officers
  for each row execute function private.release_presenter_slots_on_signup_removal();

create function private.reconcile_event_participation_for_roster(
  p_event_id bigint,
  p_source_changed boolean,
  p_officer_ids bigint[]
) returns bigint[] language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
 basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
 changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean;
 basis_missing boolean;
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
 update public.events set participation_points_per_hour_at_end=coalesce(participation_points_per_hour_at_end,1)
  where id=e.id and participation_points_per_hour_at_end is null;
 for target in
  select eo.officer_id,null::bigint slot_id,e.starts_at starts_at,e.ends_at ends_at
   from public.event_officers eo where eo.event_id=e.id
   and eo.removed_at is null
   and (p_officer_ids is null or eo.officer_id=any(p_officer_ids))
   and not exists(select 1 from public.event_time_slots s where s.event_id=e.id)
  union all
  select x.officer_id,s.id,s.starts_at,s.ends_at from public.event_time_slot_officers x
   join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=e.id
   and exists(select 1 from public.event_officers eo where eo.event_id=x.event_id
     and eo.officer_id=x.officer_id and eo.removed_at is null)
   and (p_officer_ids is null or x.officer_id=any(p_officer_ids))
  order by officer_id,slot_id nulls first
 loop
  amount:=private.event_participation_points(target.starts_at,target.ends_at,1);
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
     'rate',1,'points',amount,'supersedes_transaction_id',(select max(p.id) from public.point_transactions p
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
       'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,'rate',1,'reactivated',was_removed));
     changed:=array_append(changed,award.id);
    end if;
   end if;
  end if;
 end loop;
 return changed;
end;
$$;

create or replace function private.award_selected_event_time_slots(p_event_id bigint,
  p_officer_ids bigint[] default null,p_manual_conflict text default 'skip') returns bigint[]
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award_id bigint; award_points numeric;
  awarded bigint[]:='{}'::bigint[]; existing public.point_transactions%rowtype;
  changed boolean; prior_points numeric;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or e.ends_at>pg_catalog.now() or e.participation_points_per_hour_at_end is null then return awarded; end if;
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
    award_points:=private.event_participation_points(target.starts_at,target.ends_at,1);
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
          'rate',1,'points',award_points,'reactivated',existing.removed_at is not null));
      awarded:=array_append(awarded,award_id);
    end if;
  end loop;
  return awarded;
end;
$$;

create or replace function private.guard_event_time_slot_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; s public.event_time_slots%rowtype; existing_count bigint;
begin
  if tg_op='UPDATE' and new.event_id=old.event_id and new.slot_id=old.slot_id
      and new.officer_id=old.officer_id then return new; end if;
  select * into e from public.events where id=new.event_id for update;
  if not found then raise exception 'Event not found'; end if;
  select * into s from public.event_time_slots where id=new.slot_id and event_id=new.event_id for update;
  if not found then raise exception 'Time Slot does not belong to this Event'; end if;
  perform private.assert_event_time_slots(e.id);
  existing_count:=(select count(*) from public.event_time_slot_officers x
    join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
      and eo.removed_at is null
    where x.slot_id=new.slot_id and (tg_op<>'UPDATE' or x.officer_id<>old.officer_id));
  if s.capacity is not null and existing_count>=s.capacity then raise exception 'This Time Slot is full'; end if;
  return new;
end;
$$;
drop trigger event_time_slot_officers_capacity_guard on public.event_time_slot_officers;
create trigger event_time_slot_officers_capacity_guard before insert or update
  on public.event_time_slot_officers for each row execute function private.guard_event_time_slot_assignment();

create or replace function private.replace_event_time_slots(p_event_id bigint,p_time_slots jsonb,
  p_starts_at timestamptz default null,p_ends_at timestamptz default null,p_event_date date default null,
  p_event_type_id bigint default null,p_recurrence_copy boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; item jsonb; ord integer:=0; v_slot_id bigint;
  slot_start timestamptz; slot_end timestamptz; slot_capacity integer; slot_count integer;
  existing public.event_time_slots%rowtype; keep_ids bigint[]:='{}'::bigint[];
  new_starts timestamptz; new_ends timestamptz; new_type bigint; target_date date;
  before_slots jsonb; after_slots jsonb; existing_ids bigint[];
begin
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  new_starts:=coalesce(p_starts_at,e.starts_at); new_ends:=coalesce(p_ends_at,e.ends_at);
  new_type:=coalesce(p_event_type_id,e.event_type_id);
  target_date:=coalesce(p_event_date,(new_starts at time zone 'America/Denver')::date);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,
    'ends_at',ends_at,'capacity',capacity) order by starts_at,id),'[]'::jsonb)
    into before_slots from public.event_time_slots where event_id=p_event_id;
  select coalesce(array_agg(id order by starts_at,id),'{}'::bigint[]) into existing_ids
    from public.event_time_slots where event_id=p_event_id;
  if p_time_slots is not null and jsonb_typeof(p_time_slots)<>'array' then raise exception 'Time Slots must be an array'; end if;
  if p_time_slots is not null and jsonb_array_length(p_time_slots)>100 then raise exception 'An Event cannot have more than 100 Time Slots'; end if;
  slot_count:=coalesce(jsonb_array_length(p_time_slots),0);
  if slot_count>0 then
    if private.is_session_event_type(new_type) then raise exception 'Time Slots are unavailable for Session Events'; end if;
    if exists(select 1 from public.presentation_slots where event_id=p_event_id) then
      raise exception 'This Event has Presenter Slots and cannot use volunteer Time Slots'; end if;
    if not exists(select 1 from public.event_time_slots where event_id=p_event_id)
      and exists(select 1 from public.event_officers where event_id=p_event_id) then
      raise exception 'Time Slots cannot be enabled after Officers have signed up for this Event'; end if;
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_time_slots,'[]'::jsonb)) with ordinality as a(value,ordinality)
    order by ordinality
  loop
    ord:=ord+1;
    if jsonb_typeof(item)<>'object' or not (item ? 'start_time') or not (item ? 'end_time') or
      exists(select 1 from jsonb_object_keys(item) k where k not in ('id','start_time','end_time','capacity')) then
      raise exception 'Invalid Time Slot definition'; end if;
    if jsonb_typeof(item->'start_time')<>'string' or jsonb_typeof(item->'end_time')<>'string' or
      (item->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
      (item->>'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Time Slot times must use HH:MM'; end if;
    if item ? 'capacity' and item->'capacity'<>'null'::jsonb and
      (jsonb_typeof(item->'capacity')<>'number' or (item->>'capacity') !~ '^[1-9][0-9]*$') then
      raise exception 'Time Slot capacity must be a positive whole number or null'; end if;
    slot_capacity:=case when item->'capacity' is null or item->'capacity'='null'::jsonb then null
      else (item->>'capacity')::integer end;
    slot_start:=((target_date+(item->>'start_time')::time) at time zone 'America/Denver');
    slot_end:=((target_date+(item->>'end_time')::time) at time zone 'America/Denver');
    if slot_start<new_starts or slot_end>new_ends or slot_end<=slot_start then
      raise exception 'Each Time Slot must fit within the Event schedule'; end if;
    if item ? 'id' and item->'id'<>'null'::jsonb then
      if jsonb_typeof(item->'id')<>'number' or (item->>'id') !~ '^[1-9][0-9]*$' then raise exception 'Invalid Time Slot id'; end if;
      v_slot_id:=(item->>'id')::bigint;
    else v_slot_id:=null; end if;
    if p_recurrence_copy and v_slot_id is not null and not exists(
      select 1 from public.event_time_slots where id=v_slot_id and event_id=p_event_id) then v_slot_id:=null; end if;
    if v_slot_id is null then v_slot_id:=existing_ids[ord]; end if;
    if v_slot_id is not null then
      if v_slot_id=any(keep_ids) then raise exception 'Time Slot IDs cannot be duplicated'; end if;
      select * into existing from public.event_time_slots where id=v_slot_id and event_id=p_event_id for update;
      if not found then raise exception 'Time Slot does not belong to this Event'; end if;
      if (existing.starts_at is distinct from slot_start or existing.ends_at is distinct from slot_end)
          and exists(select 1 from public.point_transactions where event_time_slot_id=v_slot_id) then
        raise exception 'A Time Slot with Point history cannot be rescheduled'; end if;
      if slot_capacity is not null and (select count(*) from public.event_time_slot_officers x
          join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
            and eo.removed_at is null where x.slot_id=v_slot_id)>slot_capacity then
        raise exception 'Time Slot capacity cannot be lower than its registered Officer count'; end if;
      update public.event_time_slots set starts_at=slot_start,ends_at=slot_end,capacity=slot_capacity where id=v_slot_id;
      keep_ids:=array_append(keep_ids,v_slot_id);
    else
      insert into public.event_time_slots(event_id,starts_at,ends_at,capacity,created_by)
        values(p_event_id,slot_start,slot_end,slot_capacity,auth.uid()) returning id into v_slot_id;
      keep_ids:=array_append(keep_ids,v_slot_id);
    end if;
  end loop;
  if exists(select 1 from (
    select starts_at,ends_at,lag(ends_at) over(order by starts_at,id) previous_end
    from public.event_time_slots where event_id=p_event_id and id=any(keep_ids)
  ) ordered where starts_at<previous_end) then raise exception 'Custom Time Slots cannot overlap'; end if;
  if exists(select 1 from public.event_time_slots old where old.event_id=p_event_id and not(old.id=any(keep_ids))
      and (exists(select 1 from public.event_time_slot_officers x where x.slot_id=old.id)
        or exists(select 1 from public.point_transactions p where p.event_time_slot_id=old.id))) then
    raise exception 'A Time Slot with registrations or Point history cannot be removed'; end if;
  delete from public.event_time_slots old where old.event_id=p_event_id and not(old.id=any(keep_ids));
  perform private.assert_event_time_slots(p_event_id,new_starts,new_ends,new_type);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,
    'ends_at',ends_at,'capacity',capacity) order by starts_at,id),'[]'::jsonb)
    into after_slots from public.event_time_slots where event_id=p_event_id;
  if before_slots is distinct from after_slots then
    perform private.write_audit_log('event.time_slots_updated','event',p_event_id::text,
      jsonb_build_object('event_id',p_event_id,'actor_id',private.current_active_officer_id(),
        'before',before_slots,'after',after_slots));
  end if;
end;
$$;
revoke all on function private.replace_event_time_slots(bigint,jsonb,timestamptz,timestamptz,date,bigint,boolean)
  from public,anon,authenticated;

create or replace function private.change_event_time_slot_signup(
  p_event_id bigint,p_officer_id bigint,p_slot_ids bigint[],p_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; actor_id bigint:=private.current_active_officer_id(); target_id bigint;
  slot_ids bigint[]; existing_signup boolean; added_slots bigint[]:='{}'::bigint[];
  removed_slots bigint[]:='{}'::bigint[]; new_signup boolean:=false; award_ids bigint[]:='{}'::bigint[];
  current_count bigint; selected_count bigint; preserve_slot_history boolean:=false;
  award public.point_transactions%rowtype; affected_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_mode not in ('join_selected','join_all','leave_selected','leave_all') then raise exception 'Invalid Time Slot signup mode'; end if;
  target_id:=coalesce(p_officer_id,actor_id);
  if target_id<>actor_id and not private.can_manage_event(p_event_id) then
    raise exception 'Cannot manage another Officer signup for this Event'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
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
        update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
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
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
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
    current_rate:=1;
    if e.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
      snapshot_created:=true;
    end if;
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
revoke all on function private.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[])
  from public,anon,authenticated;
grant execute on function private.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[])
  to authenticated;
revoke all on function private.reconcile_event_participation_for_roster(bigint,boolean,bigint[]) from public,anon,authenticated;

-- Keep existing callers on the original full-Event signature while applying
-- the canonical active-roster filter to scheduled and historical processing.
create or replace function private.reconcile_event_participation(
  p_event_id bigint,p_source_changed boolean default false
) returns bigint[] language sql security definer set search_path='' as $$
  select private.reconcile_event_participation_for_roster(p_event_id,p_source_changed,null)
$$;
revoke all on function private.reconcile_event_participation(bigint,boolean) from public,anon,authenticated;

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path='' as $$
declare e public.events%rowtype; processed integer:=0; awards bigint[];
begin
  for e in select * from public.events candidate where candidate.status<>'cancelled'
    and candidate.deleted_at is null and candidate.ends_at<=pg_catalog.now()
    and (candidate.participation_points_per_hour_at_end is null
      or exists(select 1 from public.point_transactions p join private.event_participation_basis b
          on b.transaction_id=p.id
        where p.event_id=candidate.id and b.schedule_suspended
          and exists(select 1 from public.event_officers eo where eo.event_id=candidate.id
            and eo.officer_id=p.officer_id and eo.removed_at is null)
          and (p.event_time_slot_id is null or exists(select 1 from public.event_time_slot_officers x
            join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
              and eo.removed_at is null
            where x.event_id=candidate.id and x.officer_id=p.officer_id and x.slot_id=p.event_time_slot_id)))
      or exists(select 1 from public.point_transactions p where p.event_id=candidate.id
        and p.participation_superseded_at is not null
        and exists(select 1 from public.event_officers eo where eo.event_id=candidate.id
          and eo.officer_id=p.officer_id and eo.removed_at is null)
        and (p.event_time_slot_id is null or exists(select 1 from public.event_time_slot_officers x
          join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
            and eo.removed_at is null
          where x.event_id=candidate.id and x.officer_id=p.officer_id and x.slot_id=p.event_time_slot_id))
        and not exists(select 1 from public.point_transactions n where n.event_id=candidate.id
          and n.officer_id=p.officer_id and n.event_time_slot_id is not distinct from p.event_time_slot_id
          and n.award_type='participation' and n.participation_superseded_at is null)))
    order by candidate.id for update skip locked
  loop
    awards:=private.reconcile_event_participation(e.id);
    perform private.write_audit_log('event.participation_processed','event',e.id::text,
      jsonb_build_object('rate',1,'scheduled_hours',extract(epoch from(e.ends_at-e.starts_at))::numeric/3600,
        'awards_created',cardinality(awards),'event_kind',case when exists(
          select 1 from public.event_time_slots where event_id=e.id) then 'slotted' else 'timed' end));
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;

create or replace function private.prevent_event_signup_overlap()
returns trigger language plpgsql security definer set search_path='' as $$
declare capacity integer; confirmed_count bigint;
begin
  if tg_op='UPDATE' and new.event_id=old.event_id and new.officer_id=old.officer_id
      and (old.removed_at is null or new.removed_at is not null) then return new; end if;
  if new.removed_at is not null then return new; end if;
  select max_volunteers into capacity from public.events where id=new.event_id for update;
  if not found then raise exception 'Event not found'; end if;
  confirmed_count:=(select count(*) from public.event_officers eo
    where eo.event_id=new.event_id and eo.removed_at is null);
  if capacity is not null and confirmed_count>=capacity then
    raise exception 'Event capacity has been reached'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_event_signup_overlap() from public,anon,authenticated;
drop trigger event_officers_capacity_guard on public.event_officers;
create trigger event_officers_capacity_guard before insert or update of event_id,officer_id,removed_at
  on public.event_officers for each row execute function private.prevent_event_signup_overlap();

create or replace function public.event_signup_counts()
returns table(event_id bigint,confirmed_count bigint)
language sql security definer set search_path='' as $$
  select e.id,(select count(*) from public.event_officers eo
    where eo.event_id=e.id and eo.removed_at is null)
  from public.events e where private.current_active_officer_id() is not null
$$;
revoke all on function public.event_signup_counts() from public,anon,authenticated;
grant execute on function public.event_signup_counts() to authenticated;

create or replace function private.set_event_capacity(
  p_event_id bigint,p_max_volunteers integer
) returns void language plpgsql security definer set search_path='' as $$
declare event_row public.events%rowtype; confirmed_count bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_max_volunteers is not null and p_max_volunteers<=0 then
    raise exception 'Max volunteers must be a positive whole number'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id and removed_at is null);
  if p_max_volunteers is not null and p_max_volunteers<confirmed_count then
    raise exception 'Max volunteers cannot be lower than the confirmed signup count'; end if;
  if event_row.max_volunteers is distinct from p_max_volunteers then
    update public.events set max_volunteers=p_max_volunteers where id=p_event_id;
    perform private.write_audit_log('event.capacity_changed','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'before',
        pg_catalog.jsonb_build_object('max_volunteers',event_row.max_volunteers),
        'after',pg_catalog.jsonb_build_object('max_volunteers',p_max_volunteers)));
  end if;
end;
$$;
revoke all on function private.set_event_capacity(bigint,integer) from public,anon,authenticated;

create or replace function private.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean
) returns void language plpgsql security definer set search_path='' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  manager boolean; changed_rows integer; award public.point_transactions%rowtype;
  slot_ids bigint[]; slot_selections jsonb; affected_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  manager:=private.can_manage_event(p_event_id);
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'Signups are closed for this event'; end if;
  if p_officer_id is distinct from actor_id and not manager then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if (current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=pg_catalog.now())
      and not manager then raise exception 'Signups are closed for this event'; end if;
  if not p_remove and exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  if not p_remove then
    perform 1 from public.officers where id=p_officer_id and status='active' for share;
    if not found then raise exception 'Target officer is not active'; end if;
  end if;
  if p_remove then
    if exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id
        and removed_at is null) then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]),
        coalesce(jsonb_agg(to_jsonb(so) order by slot_id),'[]'::jsonb)
        into slot_ids,slot_selections
        from public.event_time_slot_officers so where event_id=p_event_id and officer_id=p_officer_id;
      for award in select p.* from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=p_officer_id and p.award_type='participation'
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
          jsonb_build_object('transaction_id',award.id,'officer_id',p_officer_id,'event_id',p_event_id,
            'before',to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
      update public.event_officers set removed_at=pg_catalog.clock_timestamp()
        where event_id=p_event_id and officer_id=p_officer_id and removed_at is null;
      get diagnostics changed_rows=row_count;
    else
      changed_rows:=0;
    end if;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
    update public.event_officers set removed_at=null
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
      if current_event.ends_at<=pg_catalog.now()
          and current_event.participation_points_per_hour_at_end is null then
        perform private.reconcile_event_participation(p_event_id,false);
      else
        perform private.reconcile_event_participation_for_roster(p_event_id,false,array[p_officer_id]);
      end if;
    end if;
  else
    insert into public.event_officers(event_id,officer_id) values(p_event_id,p_officer_id)
      on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if current_event.ends_at<=pg_catalog.now()
         and current_event.participation_points_per_hour_at_end is null then
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
      jsonb_build_object('officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove,
        'time_slot_ids',case when p_remove then slot_ids else null end,
        'removed_slot_selections',case when p_remove then slot_selections else null end,
        'participation_transaction_ids',case when p_remove then affected_awards else null end));
  end if;
end;
$$;

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
