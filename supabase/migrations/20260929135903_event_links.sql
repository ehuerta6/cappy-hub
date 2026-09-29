-- Save optional Drive links in the same transaction as the event. The existing
-- event RPC still owns scope, schedule, and history checks.
create function private.save_event_with_links(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_fixed_points numeric,
  p_branch_ids bigint[],p_event_id bigint,p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; old_links jsonb; new_links jsonb;
begin
  if nullif(pg_catalog.btrim(p_slides_url),'') is not null and
     pg_catalog.btrim(p_slides_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Slides link must be an HTTP(S) URL';
  end if;
  if nullif(pg_catalog.btrim(p_meeting_notes_url),'') is not null and
     pg_catalog.btrim(p_meeting_notes_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Meeting notes link must be an HTTP(S) URL';
  end if;
  saved_id := private.save_event_v2(p_name,p_description,p_event_type_id,p_location,
    p_event_date,p_starts_at,p_ends_at,p_fixed_points,p_branch_ids,p_event_id);
  select pg_catalog.jsonb_build_object('slides_url',slides_url,
    'meeting_notes_url',meeting_notes_url) into old_links
    from public.events where id=saved_id;
  update public.events set slides_url=nullif(pg_catalog.btrim(p_slides_url),''),
    meeting_notes_url=nullif(pg_catalog.btrim(p_meeting_notes_url),'')
    where id=saved_id and (slides_url is distinct from nullif(pg_catalog.btrim(p_slides_url),'')
      or meeting_notes_url is distinct from nullif(pg_catalog.btrim(p_meeting_notes_url),''));
  if found then
    select pg_catalog.jsonb_build_object('slides_url',slides_url,
      'meeting_notes_url',meeting_notes_url) into new_links
      from public.events where id=saved_id;
    perform private.write_audit_log('event.links_updated','event',saved_id::text,
      pg_catalog.jsonb_build_object('before',old_links,'after',new_links));
  end if;
  return saved_id;
end;
$$;

create function public.save_event_with_links(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_fixed_points numeric,
  p_branch_ids bigint[],p_event_id bigint default null,
  p_slides_url text default null,p_meeting_notes_url text default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event_with_links(p_name,p_description,p_event_type_id,p_location,
    p_event_date,p_starts_at,p_ends_at,p_fixed_points,p_branch_ids,p_event_id,
    p_slides_url,p_meeting_notes_url)
$$;

revoke all on function private.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text),
  public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text)
  from public,anon,authenticated;
grant execute on function private.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text),
  public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text)
  to authenticated;
