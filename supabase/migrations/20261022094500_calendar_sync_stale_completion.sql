-- A slow successful Google write can finish after a newer generation completed.
-- Requeue current canonical state so late creates/updates cannot leave stale data.
create or replace function private.complete_event_google_calendar_sync(
  p_event_id bigint,p_calendar_id text,p_generation bigint,p_lease_token uuid,
  p_sync_state text,p_google_event_id text,p_google_etag text,p_google_html_link text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_sync_state not in ('synced','removed') or p_google_event_id is null or
    (pg_catalog.length(p_google_event_id) not between 5 and 1024 or
      p_google_event_id !~ '^[a-v0-9]+$') then
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

  -- A stale but successful remote write may have landed after a newer worker's
  -- final API read. Advance the desired generation and reconcile canonical data.
  update private.event_google_calendar_sync q set
    generation=q.generation+1,sync_state='pending',attempt_count=0,
    next_attempt_at=pg_catalog.clock_timestamp(),lease_token=null,lease_until=null,
    last_error_code=null,last_error_at=null,updated_at=pg_catalog.clock_timestamp()
  where q.event_id=p_event_id and q.calendar_id=p_calendar_id
    and q.generation>p_generation;
  return false;
end;
$$;
