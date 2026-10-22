create table private.google_calendar_event_sync (
  event_id bigint primary key,
  revision bigint not null default 1,
  synced_revision bigint not null default 0,
  needs_sync boolean not null default true,
  attempts integer not null default 0,
  available_at timestamptz not null default pg_catalog.now(),
  lease_until timestamptz,
  last_error text
);

create function private.enqueue_google_calendar_event_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_event_id bigint;
begin
  target_event_id := case when tg_op='DELETE' then old.id else new.id end;
  insert into private.google_calendar_event_sync(event_id)
    values(target_event_id)
    on conflict on constraint google_calendar_event_sync_pkey do update set
      revision=private.google_calendar_event_sync.revision+1,
      needs_sync=true,
      attempts=0,
      available_at=case when private.google_calendar_event_sync.lease_until is null
        then pg_catalog.now() else private.google_calendar_event_sync.available_at end,
      last_error=null;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.enqueue_google_calendar_event_sync()
  from public,anon,authenticated;

create trigger events_enqueue_google_calendar_sync
  after insert or delete or update of name,description,location,starts_at,ends_at,status,deleted_at
  on public.events for each row
  execute function private.enqueue_google_calendar_event_sync();

-- A one-time activation backfill. Signups, roster changes, and unrelated Event
-- fields never enqueue calendar work.
insert into private.google_calendar_event_sync(event_id)
select id from public.events
where deleted_at is null and status<>'past' and ends_at>pg_catalog.now()
on conflict(event_id) do nothing;

create function public.claim_google_calendar_event_sync(p_limit integer default 25)
returns table(event_id bigint,revision bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'Invalid Google Calendar sync batch size';
  end if;
  return query
    with candidates as (
      select q.event_id from private.google_calendar_event_sync q
      where q.needs_sync and q.available_at<=pg_catalog.now()
        and (q.lease_until is null or q.lease_until<=pg_catalog.now())
      order by q.available_at,q.event_id
      for update skip locked
      limit p_limit
    )
    update private.google_calendar_event_sync q
      set lease_until=pg_catalog.now()+interval '5 minutes'
      from candidates c where q.event_id=c.event_id
      returning q.event_id,q.revision;
end;
$$;
revoke all on function public.claim_google_calendar_event_sync(integer)
  from public,anon,authenticated;
grant execute on function public.claim_google_calendar_event_sync(integer) to service_role;

create function public.finish_google_calendar_event_sync(
  p_event_id bigint,p_revision bigint,p_error text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare current_job private.google_calendar_event_sync%rowtype;
begin
  select * into current_job from private.google_calendar_event_sync
    where event_id=p_event_id for update;
  if not found then return false; end if;
  if current_job.revision<>p_revision then
    update private.google_calendar_event_sync
      set needs_sync=true,lease_until=null,available_at=pg_catalog.now()
      where event_id=p_event_id;
    return false;
  end if;
  if p_error is null then
    update private.google_calendar_event_sync
      set synced_revision=p_revision,needs_sync=false,lease_until=null,last_error=null
      where event_id=p_event_id;
    return true;
  end if;
  update private.google_calendar_event_sync
    set attempts=attempts+1,
        available_at=pg_catalog.now()+
          (least(60,pg_catalog.power(2,least(attempts+1,6)))::integer * interval '1 minute'),
        lease_until=null,needs_sync=true,
        last_error=pg_catalog.left(p_error,200)
    where event_id=p_event_id;
  return false;
end;
$$;
revoke all on function public.finish_google_calendar_event_sync(bigint,bigint,text)
  from public,anon,authenticated;
grant execute on function public.finish_google_calendar_event_sync(bigint,bigint,text)
  to service_role;
