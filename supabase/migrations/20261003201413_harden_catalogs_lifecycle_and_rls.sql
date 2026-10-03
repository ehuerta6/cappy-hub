-- The same active-Officer rule used by other shared catalogs applies here.
drop policy event_locations_read_authenticated on public.event_locations;
create policy event_locations_read_active_officers on public.event_locations
  for select to authenticated
  using ((select private.current_active_officer_id()) is not null);

-- Existing production rows were audited; PostgreSQL rechecks them during deployment.
alter table public.events validate constraint events_local_hours_check;

alter table public.events add constraint events_deleted_pair_check
  check ((deleted_at is null) = (deleted_by is null)) not valid;
alter table public.point_transactions add constraint point_transactions_removed_pair_check
  check ((removed_at is null) = (removed_by is null)) not valid;
alter table public.point_transactions add constraint point_transactions_updated_pair_check
  check ((updated_at is null) = (updated_by is null)) not valid;
alter table public.warning_approvals add constraint warning_approvals_decision_time_check
  check ((decision = 'pending') = (decided_at is null)) not valid;
alter table public.events validate constraint events_deleted_pair_check;
alter table public.point_transactions validate constraint point_transactions_removed_pair_check;
alter table public.point_transactions validate constraint point_transactions_updated_pair_check;
alter table public.warning_approvals validate constraint warning_approvals_decision_time_check;

-- Historical types stay in place for their Event foreign keys. New choices opt in.
alter table public.event_types add column available_for_new_events boolean not null default false;
update public.event_types set available_for_new_events = true
  where name in ('Meeting','Social','Workshop');

-- These indexes only reject collisions. They never rewrite catalog names or IDs.
create unique index branches_normalized_name_key on public.branches
  (pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(name, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    '[[:space:]]+', ' ', 'g')));
create unique index positions_normalized_name_key on public.positions
  (pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(name, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    '[[:space:]]+', ' ', 'g')));

create or replace function private.delete_branch(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name into old_name from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if exists(select 1 from public.officer_branches where branch_id=p_id)
    or exists(select 1 from public.event_branches where branch_id=p_id) then
    raise exception 'This branch cannot be deleted because dependent records are using it';
  end if;
  begin
    delete from public.branches where id=p_id;
  exception when foreign_key_violation then
    raise exception 'This branch cannot be deleted because dependent records are using it';
  end;
  perform private.write_audit_log('branch.deleted','branch',p_id::text,
    pg_catalog.jsonb_build_object('name',old_name));
end;
$$;


create or replace function private.save_event_fields(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,
  p_branch_ids bigint[],p_event_id bigint,p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; before_details jsonb; old_event public.events;
  branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_branches(branches) then raise exception 'Event outside branch scope'; end if;
  if cardinality(branches) <> (select count(distinct id) from unnest(branches) b(id)) then
    raise exception 'Duplicate branches'; end if;
  if nullif(pg_catalog.btrim(p_name),'') is null or nullif(pg_catalog.btrim(p_description),'') is null
    or nullif(pg_catalog.btrim(p_location),'') is null then
    raise exception 'Name, description and location are required'; end if;
  if not exists(select 1 from public.event_types
      where id=p_event_type_id and available_for_new_events)
    and not (p_event_id is not null and exists(
      select 1 from public.events where id=p_event_id and event_type_id=p_event_type_id)) then
    raise exception 'Invalid event type'; end if;
  if p_event_date is null or p_starts_at is null or p_ends_at is null or
    p_ends_at<=p_starts_at or
    (p_starts_at at time zone 'America/Denver')::date<>p_event_date or
    (p_ends_at at time zone 'America/Denver')::date<>p_event_date or
    (p_starts_at at time zone 'America/Denver')::time<time '06:00' or
    (p_ends_at at time zone 'America/Denver')::time>time '23:59' then
    raise exception 'Events need one date and a valid time from 06:00 through 23:59'; end if;
  if nullif(pg_catalog.btrim(p_slides_url),'') is not null and
    pg_catalog.btrim(p_slides_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Slides link must be an HTTP(S) URL'; end if;
  if nullif(pg_catalog.btrim(p_meeting_notes_url),'') is not null and
    pg_catalog.btrim(p_meeting_notes_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Meeting notes link must be an HTTP(S) URL'; end if;
  if p_event_id is null then
    insert into public.events(name,description,event_type_id,location,event_date,starts_at,ends_at,
      slides_url,meeting_notes_url)
    values(pg_catalog.btrim(p_name),pg_catalog.btrim(p_description),p_event_type_id,
      pg_catalog.btrim(p_location),p_event_date,p_starts_at,p_ends_at,
      nullif(pg_catalog.btrim(p_slides_url),''),nullif(pg_catalog.btrim(p_meeting_notes_url),''))
    returning id into saved_id;
  else
    select * into old_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if old_event.deleted_at is not null then
      raise exception 'This event cannot be edited'; end if;
    before_details := pg_catalog.to_jsonb(old_event) || pg_catalog.jsonb_build_object(
      'branch_ids',(select coalesce(array_agg(branch_id order by branch_id),'{}'::bigint[])
        from public.event_branches where event_id=p_event_id));
    update public.events set name=pg_catalog.btrim(p_name),description=pg_catalog.btrim(p_description),
      event_type_id=p_event_type_id,location=pg_catalog.btrim(p_location),event_date=p_event_date,
      starts_at=p_starts_at,ends_at=p_ends_at,slides_url=nullif(pg_catalog.btrim(p_slides_url),''),
      meeting_notes_url=nullif(pg_catalog.btrim(p_meeting_notes_url),'')
    where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id)
    select saved_id,id from unnest(branches) b(id);
  if p_event_id is null or before_details is distinct from
    ((select to_jsonb(e) from public.events e where id=saved_id) ||
      pg_catalog.jsonb_build_object('branch_ids',branches)) then
    perform private.write_audit_log(case when p_event_id is null then 'event.created' else 'event.updated' end,
      'event',saved_id::text,pg_catalog.jsonb_build_object('before',before_details,
        'after',(select to_jsonb(e) from public.events e where id=saved_id) ||
          pg_catalog.jsonb_build_object('branch_ids',branches)));
  end if;
  if p_event_id is not null and (old_event.slides_url is distinct from nullif(pg_catalog.btrim(p_slides_url),'')
      or old_event.meeting_notes_url is distinct from nullif(pg_catalog.btrim(p_meeting_notes_url),'')) then
    perform private.write_audit_log('event.links_updated','event',saved_id::text,
      pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object(
        'slides_url',old_event.slides_url,'meeting_notes_url',old_event.meeting_notes_url),
        'after',pg_catalog.jsonb_build_object('slides_url',nullif(pg_catalog.btrim(p_slides_url),''),
          'meeting_notes_url',nullif(pg_catalog.btrim(p_meeting_notes_url),''))));
  end if;
  return saved_id;
end;
$$;
