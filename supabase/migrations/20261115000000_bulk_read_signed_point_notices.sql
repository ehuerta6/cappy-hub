create function private.mark_all_notifications_read()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set read_at = pg_catalog.now()
  where recipient_officer_id = private.current_active_officer_id()
    and read_at is null;
end;
$$;
revoke all on function private.mark_all_notifications_read() from public, anon, authenticated;

create function public.mark_all_notifications_read()
returns void language sql security definer set search_path = '' as $$
  select private.mark_all_notifications_read()
$$;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function private.notify_point_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id bigint; transaction_id bigint; balance_delta numeric; key text;
begin
  if pg_catalog.current_setting('cappy.seed_loading',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  transaction_id := case when tg_op='DELETE' then old.id else new.id end;
  if tg_op='INSERT' then
    target_id := new.officer_id;
    balance_delta := case when new.removed_at is null then new.points else 0 end;
  elsif tg_op='DELETE' then
    target_id := old.officer_id;
    balance_delta := case when old.removed_at is null then -old.points else 0 end;
  else
    target_id := new.officer_id;
    balance_delta := (case when new.removed_at is null then new.points else 0 end)
      - (case when old.removed_at is null then old.points else 0 end);
  end if;
  if balance_delta = 0 then return case when tg_op='DELETE' then old else new end; end if;
  key := 'point.changed:'||transaction_id||':'||pg_catalog.clock_timestamp()::text;
  perform private.create_notification(
    target_id,
    'point.changed',
    case when tg_op='DELETE' or (tg_op='UPDATE' and old.removed_at is null and new.removed_at is not null)
      then 'Points removed' else 'Points updated' end,
    case when balance_delta > 0 then '+' else '−' end
      || pg_catalog.abs(balance_delta)::text || ' Points',
    'point',transaction_id,'/points','important',key||':'||target_id);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
