-- Pending work must retain whether a remote Event was previously published.
alter table private.event_google_calendar_sync
  add column remote_visible boolean not null default false;

create or replace function private.claim_event_google_calendar_sync_batch(
  p_limit integer,p_calendar_id text
) returns table(
  event_id bigint,generation bigint,lease_token uuid,event_name text,
  starts_at timestamptz,ends_at timestamptz,event_status text,archived_at timestamptz,
  was_remote_visible boolean,google_event_id text,google_etag text,google_html_link text
)
language plpgsql security definer set search_path = '' as $$
declare claim_limit integer := least(greatest(coalesce(p_limit,1),1),20);
begin
  if p_calendar_id is null or pg_catalog.btrim(p_calendar_id)='' or p_calendar_id='primary' then
    raise exception 'An explicit testing Calendar ID is required';
  end if;
  if exists(select 1 from private.event_google_calendar_sync q
      where q.calendar_id is not null and q.calendar_id<>p_calendar_id) then
    raise exception 'Calendar target changed; recover against the original target first';
  end if;

  return query
  with picked as materialized (
    select q.event_id
    from private.event_google_calendar_sync q
    where q.sync_state='pending'
      and q.next_attempt_at<=pg_catalog.clock_timestamp()
      and (q.lease_until is null or q.lease_until<=pg_catalog.clock_timestamp())
    order by q.next_attempt_at,q.event_id
    for update skip locked
    limit claim_limit
  ), leased as (
    update private.event_google_calendar_sync q set
      calendar_id=coalesce(q.calendar_id,p_calendar_id),
      lease_token=pg_catalog.gen_random_uuid(),
      lease_until=pg_catalog.clock_timestamp()+interval '2 minutes',
      attempt_count=q.attempt_count+1,
      updated_at=pg_catalog.clock_timestamp()
    from picked p where q.event_id=p.event_id
    returning q.event_id,q.generation,q.lease_token,q.remote_visible,q.google_event_id,
      q.google_etag,q.google_html_link
  )
  select l.event_id,l.generation,l.lease_token,e.name,e.starts_at,e.ends_at,e.status,
    e.deleted_at,l.remote_visible,l.google_event_id,l.google_etag,l.google_html_link
  from leased l join public.events e on e.id=l.event_id
  order by l.event_id;
end;
$$;

create or replace function private.complete_event_google_calendar_sync(
  p_event_id bigint,p_calendar_id text,p_generation bigint,p_lease_token uuid,
  p_sync_state text,p_google_event_id text,p_google_etag text,p_google_html_link text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_sync_state not in ('synced','removed') or p_google_event_id is null or
    p_google_event_id !~ '^[a-v0-9]{5,1024}$' then
    raise exception 'Invalid Google Calendar completion';
  end if;

  update private.event_google_calendar_sync q set
    sync_state=p_sync_state,completed_generation=p_generation,
    remote_visible=(p_sync_state='synced'),
    google_event_id=p_google_event_id,google_etag=p_google_etag,
    google_html_link=coalesce(p_google_html_link,q.google_html_link),
    attempt_count=0,next_attempt_at=pg_catalog.clock_timestamp(),
    lease_token=null,lease_until=null,last_error_code=null,last_error_at=null,
    updated_at=pg_catalog.clock_timestamp()
  where q.event_id=p_event_id and q.calendar_id=p_calendar_id
    and q.generation=p_generation and q.lease_token=p_lease_token;
  get diagnostics changed=row_count;
  if changed>0 then return true; end if;

  update private.event_google_calendar_sync q set
    lease_token=null,lease_until=null,updated_at=pg_catalog.clock_timestamp()
  where q.event_id=p_event_id and q.calendar_id=p_calendar_id
    and q.lease_token=p_lease_token;
  return false;
end;
$$;
