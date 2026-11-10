create function private.set_notification_read_status(
  p_notification_id bigint,
  p_is_read boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set read_at = case when p_is_read then coalesce(read_at, pg_catalog.now()) else null end
  where id = p_notification_id
    and recipient_officer_id = private.current_active_officer_id();
  if not found then raise exception 'Notification not found'; end if;
end;
$$;
revoke all on function private.set_notification_read_status(bigint,boolean)
  from public, anon, authenticated;
create function public.set_notification_read_status(
  p_notification_id bigint,
  p_is_read boolean
)
returns void language sql security definer set search_path = '' as $$
  select private.set_notification_read_status($1, $2)
$$;
revoke all on function public.set_notification_read_status(bigint,boolean)
  from public, anon, authenticated;
grant execute on function public.set_notification_read_status(bigint,boolean)
  to authenticated;
