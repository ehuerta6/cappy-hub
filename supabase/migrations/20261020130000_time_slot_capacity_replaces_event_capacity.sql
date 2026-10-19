-- A slotted Event is sized by each slot's own limit. Keep the Event-wide
-- Max volunteers value reserved for Events that do not use Time Slots.
do $$
declare slotted_event record;
begin
  for slotted_event in
    select e.id, e.max_volunteers
    from public.events e
    where e.max_volunteers is not null
      and exists(select 1 from public.event_time_slots s where s.event_id=e.id)
  loop
    perform private.write_audit_log(
      'event.capacity_cleared_for_time_slots',
      'event',
      slotted_event.id::text,
      pg_catalog.jsonb_build_object(
        'event_id',slotted_event.id,
        'previous_max_volunteers',slotted_event.max_volunteers,
        'source','migration_backfill'
      )
    );
  end loop;
end;
$$;

update public.events e
set max_volunteers=null
where e.max_volunteers is not null
  and exists(select 1 from public.event_time_slots s where s.event_id=e.id);

create function private.clear_event_capacity_when_time_slots_are_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_capacity integer;
begin
  select max_volunteers into previous_capacity from public.events
    where id=new.event_id for update;
  if previous_capacity is not null then
    update public.events set max_volunteers=null where id=new.event_id;
    perform private.write_audit_log('event.capacity_cleared_for_time_slots','event',new.event_id::text,
      pg_catalog.jsonb_build_object('event_id',new.event_id,
        'previous_max_volunteers',previous_capacity,'source','time_slot_configuration'));
  end if;
  return new;
end;
$$;
revoke all on function private.clear_event_capacity_when_time_slots_are_added()
  from public,anon,authenticated;
create trigger event_time_slots_clear_event_capacity
  after insert or update of event_id on public.event_time_slots
  for each row execute function private.clear_event_capacity_when_time_slots_are_added();

create function private.prevent_event_capacity_when_time_slots_exist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.max_volunteers is not null and exists(
    select 1 from public.event_time_slots s where s.event_id=new.id
  ) then
    new.max_volunteers:=null;
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_event_capacity_when_time_slots_exist()
  from public,anon,authenticated;
create trigger events_use_slot_capacity_when_slotted
  before insert or update of max_volunteers on public.events
  for each row execute function private.prevent_event_capacity_when_time_slots_exist();
