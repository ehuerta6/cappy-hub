create function private.restore_event(p_event_id bigint) returns void
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
  if current_event.deleted_at is not null or current_event.status <> 'cancelled' then
    raise exception 'This event cannot be restored';
  end if;

  -- Derive the existing lifecycle status from the unchanged schedule so a
  -- cancelled Event that has ended is restored as past, never upcoming.
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
revoke all on function private.restore_event(bigint) from public, anon, authenticated;
grant execute on function private.restore_event(bigint) to authenticated;

create function public.restore_event(p_event_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_event(p_event_id)
$$;
revoke all on function public.restore_event(bigint) from public, anon, authenticated;
grant execute on function public.restore_event(bigint) to authenticated;
