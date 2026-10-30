-- Retire active Presenter Slot workflows while retaining historical rows and audit evidence.
-- Volunteer Time Slots remain available for their existing eligible non-Session Events.

drop trigger if exists events_keep_presenter_slots_session_only on public.events;
drop trigger if exists event_types_keep_session_identity on public.event_types;
drop trigger if exists event_officers_release_presenter_slots on public.event_officers;
drop trigger if exists event_officers_release_presenter_slots_on_removal on public.event_officers;
drop trigger if exists officers_release_presenter_slots on public.officers;

drop function if exists private.prevent_event_type_change_with_presenter_slots();
drop function if exists private.prevent_session_type_rename_with_slots();
drop function if exists private.release_presenter_slots_on_signup_delete();
drop function if exists private.release_inactive_officer_presenter_slots();
drop function if exists private.release_presenter_slots_on_signup_removal();

revoke all on function private.add_presenter_slot(bigint),
  private.reorder_presenter_slots(bigint,bigint[]),
  private.remove_presenter_slot(bigint),
  private.change_presenter_slot(bigint,bigint,boolean),
  private.update_presenter_slot_details(bigint,text,text,text,text),
  public.add_presenter_slot(bigint),
  public.reorder_presenter_slots(bigint,bigint[]),
  public.remove_presenter_slot(bigint),
  public.change_presenter_slot(bigint,bigint,boolean),
  public.update_presenter_slot_details(bigint,text,text,text,text)
from public,anon,authenticated;

create or replace function private.assert_event_time_slots(p_event_id bigint,p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,p_event_type_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; starts_value timestamptz; ends_value timestamptz; type_value bigint;
begin
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  starts_value:=coalesce(p_starts_at,e.starts_at);
  ends_value:=coalesce(p_ends_at,e.ends_at);
  type_value:=coalesce(p_event_type_id,e.event_type_id);
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    if private.is_session_event_type(type_value) then
      raise exception 'Time Slots are unavailable for Session Events';
    end if;
    if exists(select 1 from public.event_time_slots s where s.event_id=p_event_id
        and (s.starts_at<starts_value or s.ends_at>ends_value)) then
      raise exception 'Time Slots must stay within the Event start and end times';
    end if;
    if exists(select 1 from public.event_time_slots s1 join public.event_time_slots s2
        on s2.event_id=s1.event_id and (s2.starts_at,s2.id)>(s1.starts_at,s1.id)
        and s2.starts_at<s1.ends_at where s1.event_id=p_event_id) then
      raise exception 'Time Slots cannot overlap';
    end if;
  end if;
end;
$$;
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
