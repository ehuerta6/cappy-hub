-- Durable one-way projection state. Each real Event row is one occurrence and
-- recurrence maintenance preserves that row ID, so the queue key is stable.
create table private.event_google_calendar_sync (
  event_id bigint primary key references public.events(id) on delete restrict,
  calendar_id text,
  google_event_id text,
  sync_state text not null default 'pending'
    check (sync_state in ('pending','synced','removed','failed')),
  generation bigint not null default 1 check (generation > 0),
  completed_generation bigint not null default 0
    check (completed_generation >= 0 and completed_generation <= generation),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  google_etag text,
  google_html_link text,
  last_error_code text,
  last_error_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint event_google_calendar_sync_lease_pair
    check ((lease_token is null) = (lease_until is null)),
  constraint event_google_calendar_sync_calendar_id_nonblank
    check (calendar_id is null or pg_catalog.btrim(calendar_id) <> ''),
  constraint event_google_calendar_sync_google_id_format
    check (google_event_id is null or google_event_id ~ '^[a-v0-9]{5,1024}$'),
  constraint event_google_calendar_sync_error_code_format
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_.-]{1,80}$')
);

create unique index event_google_calendar_sync_remote_identity
  on private.event_google_calendar_sync(calendar_id,google_event_id)
  where calendar_id is not null and google_event_id is not null;
create index event_google_calendar_sync_pending_idx
  on private.event_google_calendar_sync(next_attempt_at,event_id)
  where sync_state='pending';

alter table private.event_google_calendar_sync enable row level security;
revoke all on private.event_google_calendar_sync from public,anon,authenticated;

create function private.enqueue_event_google_calendar_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and
    old.name is not distinct from new.name and
    old.starts_at is not distinct from new.starts_at and
    old.ends_at is not distinct from new.ends_at and
    old.status is not distinct from new.status and
    old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;

  if exists(select 1 from private.event_google_calendar_sync q where q.event_id=new.id)
    or (new.deleted_at is null and new.ends_at>=pg_catalog.clock_timestamp()) then
    insert into private.event_google_calendar_sync(event_id)
    values(new.id)
    on conflict(event_id) do update set
      generation=private.event_google_calendar_sync.generation+1,
      sync_state='pending',attempt_count=0,
      next_attempt_at=pg_catalog.clock_timestamp(),
      last_error_code=null,last_error_at=null,
      updated_at=pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_event_google_calendar_sync()
  from public,anon,authenticated;

create trigger events_google_calendar_sync_enqueue
  after insert or update of name,starts_at,ends_at,status,deleted_at on public.events
  for each row execute function private.enqueue_event_google_calendar_sync();

-- Initial import includes all non-archived occurrences that have not ended.
-- Cancelled occurrences remain eligible and are projected as transparent.
insert into private.event_google_calendar_sync(event_id)
select e.id from public.events e
where e.deleted_at is null and e.ends_at>=pg_catalog.clock_timestamp()
on conflict(event_id) do nothing;

create function private.claim_event_google_calendar_sync_batch(
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
    returning q.event_id,q.generation,q.lease_token,q.sync_state,q.google_event_id,
      q.google_etag,q.google_html_link
  )
  select l.event_id,l.generation,l.lease_token,e.name,e.starts_at,e.ends_at,e.status,
    e.deleted_at,(l.sync_state='synced'),l.google_event_id,l.google_etag,l.google_html_link
  from leased l join public.events e on e.id=l.event_id
  order by l.event_id;
end;
$$;

create function private.complete_event_google_calendar_sync(
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

create function private.retry_event_google_calendar_sync(
  p_event_id bigint,p_calendar_id text,p_lease_token uuid,p_error_code text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer; normalized_code text;
begin
  normalized_code:=pg_catalog.left(pg_catalog.regexp_replace(
    pg_catalog.lower(coalesce(p_error_code,'unknown')),'[^a-z0-9_.-]','','g'),80);
  if normalized_code='' then normalized_code:='unknown'; end if;
  update private.event_google_calendar_sync q set
    sync_state=case when q.attempt_count>=12 then 'failed' else 'pending' end,
    next_attempt_at=pg_catalog.clock_timestamp()+
      (least(60::numeric*pg_catalog.power(2::numeric,least(q.attempt_count-1,6)),3600)::text||' seconds')::interval,
    lease_token=null,lease_until=null,last_error_code=normalized_code,
    last_error_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
  where q.event_id=p_event_id and q.calendar_id=p_calendar_id
    and q.lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed>0;
end;
$$;

create function private.requeue_failed_event_google_calendar_sync(
  p_calendar_id text,p_event_id bigint default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update private.event_google_calendar_sync q set
    sync_state='pending',attempt_count=0,next_attempt_at=pg_catalog.clock_timestamp(),
    last_error_code=null,last_error_at=null,updated_at=pg_catalog.clock_timestamp()
  where q.calendar_id=p_calendar_id and q.sync_state='failed'
    and (p_event_id is null or q.event_id=p_event_id);
  get diagnostics changed=row_count;
  return changed;
end;
$$;

revoke all on function private.claim_event_google_calendar_sync_batch(integer,text),
  private.complete_event_google_calendar_sync(bigint,text,bigint,uuid,text,text,text,text),
  private.retry_event_google_calendar_sync(bigint,text,uuid,text),
  private.requeue_failed_event_google_calendar_sync(text,bigint)
  from public,anon,authenticated;
grant execute on function private.claim_event_google_calendar_sync_batch(integer,text),
  private.complete_event_google_calendar_sync(bigint,text,bigint,uuid,text,text,text,text),
  private.retry_event_google_calendar_sync(bigint,text,uuid,text),
  private.requeue_failed_event_google_calendar_sync(text,bigint)
  to service_role;
grant usage on schema private to service_role;

create function public.claim_event_google_calendar_sync_batch(p_limit integer,p_calendar_id text)
returns table(
  event_id bigint,generation bigint,lease_token uuid,event_name text,
  starts_at timestamptz,ends_at timestamptz,event_status text,archived_at timestamptz,
  was_remote_visible boolean,google_event_id text,google_etag text,google_html_link text
)
language sql security invoker set search_path = '' as $$
  select * from private.claim_event_google_calendar_sync_batch(p_limit,p_calendar_id)
$$;

create function public.complete_event_google_calendar_sync(
  p_event_id bigint,p_calendar_id text,p_generation bigint,p_lease_token uuid,
  p_sync_state text,p_google_event_id text,p_google_etag text,p_google_html_link text
) returns boolean language sql security invoker set search_path = '' as $$
  select private.complete_event_google_calendar_sync(p_event_id,p_calendar_id,p_generation,
    p_lease_token,p_sync_state,p_google_event_id,p_google_etag,p_google_html_link)
$$;

create function public.retry_event_google_calendar_sync(
  p_event_id bigint,p_calendar_id text,p_lease_token uuid,p_error_code text
) returns boolean language sql security invoker set search_path = '' as $$
  select private.retry_event_google_calendar_sync(p_event_id,p_calendar_id,p_lease_token,p_error_code)
$$;

create function public.requeue_failed_event_google_calendar_sync(
  p_calendar_id text,p_event_id bigint default null
) returns integer language sql security invoker set search_path = '' as $$
  select private.requeue_failed_event_google_calendar_sync(p_calendar_id,p_event_id)
$$;

revoke all on function public.claim_event_google_calendar_sync_batch(integer,text),
  public.complete_event_google_calendar_sync(bigint,text,bigint,uuid,text,text,text,text),
  public.retry_event_google_calendar_sync(bigint,text,uuid,text),
  public.requeue_failed_event_google_calendar_sync(text,bigint)
  from public,anon,authenticated;
grant execute on function public.claim_event_google_calendar_sync_batch(integer,text),
  public.complete_event_google_calendar_sync(bigint,text,bigint,uuid,text,text,text,text),
  public.retry_event_google_calendar_sync(bigint,text,uuid,text),
  public.requeue_failed_event_google_calendar_sync(text,bigint)
  to service_role;
