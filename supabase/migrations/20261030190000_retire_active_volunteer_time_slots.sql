-- Keep Volunteer Time Slot rows readable for historical Events, but remove
-- their active create, edit, and self-signup RPCs. Historical roster
-- corrections remain available only after an Event has ended.

revoke all on function private.change_event_time_slot_signup(bigint,bigint,bigint[],text),
  public.change_event_time_slot_signup(bigint,bigint,bigint[],text)
  from public,anon,authenticated;

revoke all on function private.save_event_with_capacity_and_time_slots(
    text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,bigint,text,text,jsonb),
  public.save_event_with_capacity_and_time_slots(
    text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,bigint,text,text,jsonb),
  private.create_recurring_event_with_capacity_and_time_slots(
    text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb),
  public.create_recurring_event_with_capacity_and_time_slots(
    text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb),
  private.mutate_recurring_event_with_capacity_and_time_slots(
    bigint,text,text,uuid,bigint,integer,jsonb,text,date[],boolean,integer),
  public.mutate_recurring_event_with_capacity_and_time_slots(
    bigint,text,text,uuid,bigint,integer,jsonb,text,date[],boolean,integer)
  from public,anon,authenticated;

-- This is the existing #329 roster-correction path for a completed slotted
-- Event. Check the caller and Event scope before checking whether the Event has
-- ended; the underlying trusted mutation still validates every row and slot.
create or replace function public.bulk_add_event_officers_to_slots(
  p_event_id bigint,p_officer_ids bigint[],p_slot_ids bigint[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype;
begin
  if private.current_active_officer_id() is null then
    raise exception 'Unauthorized';
  end if;
  if not private.can_manage_event(p_event_id) then
    raise exception 'Event outside branch scope';
  end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  if event_row.ends_at > pg_catalog.now() then
    raise exception 'Time Slot roster corrections are only available after the Event ends';
  end if;
  return private.bulk_add_event_officers_to_slots(p_event_id,p_officer_ids,p_slot_ids);
end;
$$;

revoke all on function public.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[])
  from public,anon,authenticated;
revoke all on function private.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[])
  from public,anon,authenticated;
grant execute on function public.bulk_add_event_officers_to_slots(bigint,bigint[],bigint[])
  to authenticated;
