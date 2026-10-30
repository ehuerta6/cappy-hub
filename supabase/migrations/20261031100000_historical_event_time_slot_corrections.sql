create function private.correct_historical_event_time_slots(
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
revoke all on function private.correct_historical_event_time_slots(bigint,bigint,bigint[])
  from public,anon,authenticated;

create function public.correct_historical_event_time_slots(
  p_event_id bigint,
  p_officer_id bigint,
  p_slot_ids bigint[]
) returns jsonb language sql security definer set search_path='' as $$
  select private.correct_historical_event_time_slots(p_event_id,p_officer_id,p_slot_ids)
$$;
revoke all on function public.correct_historical_event_time_slots(bigint,bigint,bigint[])
  from public,anon;
grant execute on function public.correct_historical_event_time_slots(bigint,bigint,bigint[])
  to authenticated;
