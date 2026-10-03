-- Each segment has an explicit DTSTART. Retired segments retain tombstones and
-- their original definition for history; they no longer imply an active schedule.
alter table public.event_series add column parent_series_id bigint references public.event_series(id),
  add column starts_on date,
  add column ends_on date,
  add column retired boolean not null default false,
  add column revision integer not null default 0;
alter table public.task_series add column parent_series_id bigint references public.task_series(id),
  add column starts_on date,
  add column ends_on date,
  add column retired boolean not null default false,
  add column revision integer not null default 0;
update public.event_series s set starts_on=(select min(recurrence_key) from public.events where recurrence_series_id=s.id),
  ends_on=(select max(recurrence_key) from public.events where recurrence_series_id=s.id);
update public.task_series s set starts_on=(select min(recurrence_key) from public.tasks where recurrence_series_id=s.id),
  ends_on=(select max(recurrence_key) from public.tasks where recurrence_series_id=s.id);

-- Receipt and payload are private. A retried operation must have the same actor
-- and exact input, and returns before touching any occurrence a second time.
create table private.recurrence_mutations (
  request_key uuid primary key, actor_id uuid not null,
  payload jsonb not null, selected_id bigint not null
);
revoke all on private.recurrence_mutations from public,anon,authenticated;

create or replace function private.assert_recurrence_dates(p_rule text,p_dates date[]) returns void
language plpgsql set search_path = '' as $$
declare frequency text; recurrence_interval integer; byday_text text;
  weekdays integer[]; start_day date; until_day date; occurrence_count integer;
  expected date[]; maximum_cycle integer;
begin
  if p_rule is null or p_rule !~
    '^RRULE:FREQ=(DAILY|WEEKLY);INTERVAL=[1-9][0-9]*(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?;(COUNT=[1-9][0-9]*|UNTIL=[0-9]{8})$' then
    raise exception 'Invalid recurrence definition';
  end if;
  if p_dates is null or array_lower(p_dates,1)<>1 or cardinality(p_dates)<1 or
    cardinality(p_dates)>500 or exists(select 1 from unnest(p_dates) d where d is null) or
    cardinality(p_dates)<>(select count(distinct d) from unnest(p_dates) d) or
    p_dates[1]<>(select min(d) from unnest(p_dates) d) then
    raise exception 'Invalid recurrence occurrence dates';
  end if;

  frequency := substring(p_rule from 'FREQ=(DAILY|WEEKLY)');
  recurrence_interval := substring(p_rule from 'INTERVAL=([0-9]+)')::integer;
  byday_text := substring(p_rule from ';BYDAY=([^;]+)');
  if recurrence_interval>52 or (frequency='WEEKLY' and byday_text is null) or
    (frequency='DAILY' and byday_text is not null) then
    raise exception 'Invalid recurrence definition';
  end if;
  if byday_text is not null then
    select array_agg(case weekday
      when 'MO' then 1 when 'TU' then 2 when 'WE' then 3 when 'TH' then 4
      when 'FR' then 5 when 'SA' then 6 when 'SU' then 7 end order by ordinal)
      into weekdays
      from unnest(string_to_array(byday_text,',')) with ordinality as selected(weekday,ordinal);
    if cardinality(weekdays)<>(select count(distinct weekday)
      from unnest(string_to_array(byday_text,',')) weekday) then
      raise exception 'Invalid recurrence definition';
    end if;
  end if;

  start_day := p_dates[1];
  if p_rule like '%;COUNT=%' then
    occurrence_count := substring(p_rule from ';COUNT=([0-9]+)$')::integer;
    if occurrence_count<1 or occurrence_count>500 or cardinality(p_dates)<>occurrence_count then
      raise exception 'Recurrence count does not match generated occurrences';
    end if;
  else
    begin
      until_day := to_date(substring(p_rule from ';UNTIL=([0-9]{8})$'),'YYYYMMDD');
    exception when others then
      raise exception 'Invalid recurrence end date';
    end;
    if to_char(until_day,'YYYYMMDD')<>substring(p_rule from ';UNTIL=([0-9]{8})$') then
      raise exception 'Invalid recurrence end date';
    end if;
    if until_day<start_day then raise exception 'Invalid recurrence end date'; end if;
  end if;

  if frequency='DAILY' then
    if p_rule like '%;COUNT=%' then
      select array_agg(start_day + (n * recurrence_interval)::integer order by n)
        into expected from generate_series(0,occurrence_count-1) as offsets(n);
    else
      occurrence_count := ((until_day-start_day)/recurrence_interval)+1;
      if occurrence_count<1 or occurrence_count>500 then
        raise exception 'Invalid recurring occurrence count';
      end if;
      select array_agg(start_day + (n * recurrence_interval)::integer order by n)
        into expected from generate_series(0,occurrence_count-1) as offsets(n);
    end if;
  else
    if not (extract(isodow from start_day)::integer = any(weekdays)) then
      raise exception 'Recurrence start date does not match BYDAY';
    end if;
    if p_rule like '%;COUNT=%' then
      maximum_cycle := occurrence_count;
    else
      maximum_cycle := greatest(0,floor((until_day-(start_day-(extract(isodow from start_day)::integer-1)))::numeric /
        (7*recurrence_interval))::integer);
      if maximum_cycle>=500 then raise exception 'Invalid recurring occurrence count'; end if;
    end if;
    select array_agg(candidate order by candidate) into expected
      from (
        select candidate from (
          select (start_day-(extract(isodow from start_day)::integer-1)) +
            (cycles.n * 7 * recurrence_interval) + (selected.weekday-1) as candidate
          from generate_series(0,maximum_cycle) as cycles(n)
          cross join unnest(weekdays) as selected(weekday)
        ) candidates
        where candidate>=start_day and (until_day is null or candidate<=until_day)
        order by candidate limit 501
      ) limited_candidates;
    if p_rule like '%;COUNT=%' then expected := expected[1:occurrence_count]; end if;
    if expected is null or cardinality(expected)<1 or cardinality(expected)>500 then
      raise exception 'Invalid recurring occurrence count';
    end if;
    if p_rule like '%;COUNT=%' and cardinality(expected)<>occurrence_count then
      raise exception 'Invalid recurring occurrence count';
    end if;
  end if;

  if expected is distinct from p_dates then
    raise exception 'Occurrence dates do not match recurrence definition';
  end if;
end;
$$;
revoke all on function private.assert_recurrence_dates(text,date[]) from public,anon,authenticated;

create or replace function private.create_recurring_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_branch_ids bigint[],p_slides_url text,p_meeting_notes_url text,
  p_request_key uuid,p_recurrence_rule text,p_event_dates date[],
  p_starts_at timestamptz[],p_ends_at timestamptz[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id bigint := private.current_active_officer_id(); series_id bigint;
  first_event_id bigint; event_id bigint; i integer; day date;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_recurrence_rule is null or p_recurrence_rule !~
    '^RRULE:FREQ=(DAILY|WEEKLY);INTERVAL=[1-9][0-9]*(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?;(COUNT=[1-9][0-9]*|UNTIL=[0-9]{8})$' then
    raise exception 'Invalid recurrence definition';
  end if;
  if (substring(p_recurrence_rule from 'INTERVAL=([0-9]+)'))::integer>52 or
    (p_recurrence_rule like 'RRULE:FREQ=WEEKLY%' and p_recurrence_rule not like '%;BYDAY=%') or
    (p_recurrence_rule like 'RRULE:FREQ=DAILY%' and p_recurrence_rule like '%;BYDAY=%') then
    raise exception 'Invalid recurrence definition'; end if;
  if p_event_dates is null or cardinality(p_event_dates)<2 or cardinality(p_event_dates)>500 or
    cardinality(p_event_dates)<>cardinality(p_starts_at) or
    cardinality(p_event_dates)<>cardinality(p_ends_at) or
    p_event_dates[1] is null then raise exception 'Invalid recurring Event occurrences'; end if;
  if cardinality(p_event_dates)<>(select count(distinct d) from unnest(p_event_dates) d) or
    p_event_dates[1]<>(select min(d) from unnest(p_event_dates) d) then
    raise exception 'Recurring Event dates must be unique and ordered'; end if;
  if p_recurrence_rule like '%;COUNT=%' and
    ((substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer<2 or
      (substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer>500 or
      cardinality(p_event_dates)<>(substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer) then
    raise exception 'Recurrence count does not match generated occurrences'; end if;
  if p_recurrence_rule like '%;UNTIL=%' and
    p_event_dates[cardinality(p_event_dates)]>(to_date(substring(p_recurrence_rule from ';UNTIL=([0-9]{8})$'),'YYYYMMDD')) then
    raise exception 'Occurrence exceeds recurrence end date'; end if;
  perform private.assert_recurrence_dates(p_recurrence_rule,p_event_dates);
  if not private.can_manage_branches(coalesce(p_branch_ids,'{}'::bigint[])) then
    raise exception 'Event outside branch scope'; end if;

  insert into public.event_series(request_key,recurrence_rule,created_by)
    values(p_request_key,p_recurrence_rule,actor_id)
    on conflict(request_key) do nothing returning id into series_id;
  if series_id is null then
    select id into series_id from public.event_series where request_key=p_request_key;
    if (select recurrence_rule from public.event_series where id=series_id) is distinct from p_recurrence_rule or
      (select count(*) from public.events where recurrence_series_id=series_id)<>cardinality(p_event_dates) or
      exists(select 1 from unnest(p_event_dates) d where not exists(
        select 1 from public.events e where e.recurrence_series_id=series_id and e.recurrence_key=d)) then
      raise exception 'Idempotency key already used'; end if;
    select id into first_event_id from public.events
      where recurrence_series_id=series_id and recurrence_key=p_event_dates[1];
    return first_event_id;
  end if;
  update public.event_series set starts_on=p_event_dates[1],ends_on=p_event_dates[cardinality(p_event_dates)] where id=series_id;
  for i in 1..cardinality(p_event_dates) loop
    day := p_event_dates[i];
    if day is null or (i>1 and day<=p_event_dates[i-1]) or
      p_starts_at[i] is null or p_ends_at[i] is null or p_ends_at[i]<=p_starts_at[i] or
      (p_starts_at[i] at time zone 'America/Denver')::date<>day or
      (p_ends_at[i] at time zone 'America/Denver')::date<>day then
      raise exception 'Invalid recurring Event schedule'; end if;
    event_id := private.save_event_with_links(p_name,p_description,p_event_type_id,p_location,
      day,p_starts_at[i],p_ends_at[i],p_branch_ids,null,p_slides_url,p_meeting_notes_url);
    update public.events set recurrence_series_id=series_id,recurrence_key=day where id=event_id;
    if first_event_id is null then first_event_id := event_id; end if;
  end loop;
  perform private.write_audit_log('event.series_created','event_series',series_id::text,
    pg_catalog.jsonb_build_object('recurrence_rule',p_recurrence_rule,
      'occurrence_count',cardinality(p_event_dates),'first_event_id',first_event_id));
  return first_event_id;
end;
$$;

create or replace function private.create_recurring_task(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id bigint := private.current_active_officer_id(); series_id bigint;
  first_task_id bigint; task_id bigint; i integer; day date;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_recurrence_rule is null or p_recurrence_rule !~
    '^RRULE:FREQ=(DAILY|WEEKLY);INTERVAL=[1-9][0-9]*(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?;(COUNT=[1-9][0-9]*|UNTIL=[0-9]{8})$' then
    raise exception 'Invalid recurrence definition';
  end if;
  if (substring(p_recurrence_rule from 'INTERVAL=([0-9]+)'))::integer>52 or
    (p_recurrence_rule like 'RRULE:FREQ=WEEKLY%' and p_recurrence_rule not like '%;BYDAY=%') or
    (p_recurrence_rule like 'RRULE:FREQ=DAILY%' and p_recurrence_rule like '%;BYDAY=%') then
    raise exception 'Invalid recurrence definition'; end if;
  if p_due_dates is null or cardinality(p_due_dates)<2 or cardinality(p_due_dates)>500 or
    cardinality(p_due_dates)<>(select count(distinct d) from unnest(p_due_dates) d) or
    p_due_dates[1]<>(select min(d) from unnest(p_due_dates) d) then
    raise exception 'Invalid recurring Task dates'; end if;
  if p_recurrence_rule like '%;COUNT=%' and
    ((substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer<2 or
      (substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer>500 or
      cardinality(p_due_dates)<>(substring(p_recurrence_rule from ';COUNT=([0-9]+)$'))::integer) then
    raise exception 'Recurrence count does not match generated Tasks'; end if;
  if p_recurrence_rule like '%;UNTIL=%' and
    p_due_dates[cardinality(p_due_dates)]>(to_date(substring(p_recurrence_rule from ';UNTIL=([0-9]{8})$'),'YYYYMMDD')) then
    raise exception 'Task exceeds recurrence end date'; end if;
  perform private.assert_recurrence_dates(p_recurrence_rule,p_due_dates);
  if not private.can_manage_branches(array[p_branch_id]) then
    raise exception 'Task outside branch scope'; end if;

  insert into public.task_series(request_key,recurrence_rule,created_by)
    values(p_request_key,p_recurrence_rule,actor_id)
    on conflict(request_key) do nothing returning id into series_id;
  if series_id is null then
    select id into series_id from public.task_series where request_key=p_request_key;
    if (select recurrence_rule from public.task_series where id=series_id) is distinct from p_recurrence_rule or
      (select count(*) from public.tasks where recurrence_series_id=series_id)<>cardinality(p_due_dates) or
      exists(select 1 from unnest(p_due_dates) d where not exists(
        select 1 from public.tasks t where t.recurrence_series_id=series_id and t.recurrence_key=d)) then
      raise exception 'Idempotency key already used'; end if;
    select id into first_task_id from public.tasks
      where recurrence_series_id=series_id and recurrence_key=p_due_dates[1];
    return first_task_id;
  end if;
  update public.task_series set starts_on=p_due_dates[1],ends_on=p_due_dates[cardinality(p_due_dates)] where id=series_id;
  for i in 1..cardinality(p_due_dates) loop
    day := p_due_dates[i];
    if day is null or (i>1 and day<=p_due_dates[i-1]) then
      raise exception 'Recurring Task dates must be ordered'; end if;
    task_id := private.save_task(p_title,p_description,p_task_type,p_branch_id,day,
      p_points,p_approval_required);
    update public.tasks set recurrence_series_id=series_id,recurrence_key=day where id=task_id;
    if first_task_id is null then first_task_id := task_id; end if;
  end loop;
  perform private.write_audit_log('task.series_created','task_series',series_id::text,
    pg_catalog.jsonb_build_object('recurrence_rule',p_recurrence_rule,
      'occurrence_count',cardinality(p_due_dates),'first_task_id',first_task_id));
  return first_task_id;
end;
$$;



-- The shared field saver preserves cancellation state. The original RPC keeps
-- its existing selected-occurrence restriction; only the scoped trusted path
-- can update details on a cancelled sibling without changing its lifecycle.
create function private.save_event_fields(
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
  if not exists(select 1 from public.event_types where id=p_event_type_id and name in ('Meeting','Social','Workshop')) then
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

revoke all on function private.save_event_fields(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text) from public,anon,authenticated;
create or replace function private.save_event_with_links(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,
  p_branch_ids bigint[],p_event_id bigint,p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_branches(coalesce(p_branch_ids,'{}'::bigint[])) then raise exception 'Event outside branch scope'; end if;
  if p_event_id is not null then
    perform 1 from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if exists(select 1 from public.events where id=p_event_id and status='cancelled') then
      raise exception 'This event cannot be edited'; end if;
  end if;
  return private.save_event_fields(p_name,p_description,p_event_type_id,p_location,p_event_date,p_starts_at,p_ends_at,
    p_branch_ids,p_event_id,p_slides_url,p_meeting_notes_url);
end;
$$;

create function private.mutate_recurring_event(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',
  p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.events; r public.events; s public.event_series;
  actor uuid := auth.uid(); payload jsonb; receipt private.recurrence_mutations;
  ids bigint[]; preserved_removed_ids bigint[]; target_series bigint; i integer := 0; day date; previous_day date;
  before_definition jsonb; after_definition jsonb; starts timestamptz; ends timestamptz;
  branches bigint[]; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or
    p_operation is null or p_operation not in ('edit','remove','cancel') or p_request_key is null then
    raise exception 'Invalid recurrence scope or operation'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(
    select 1 from jsonb_object_keys(p_patch) k where k not in ('name','description','event_type_id','location','slides_url','meeting_notes_url','branch_ids','event_date','start_time','end_time')) or
    exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then
    raise exception 'Invalid recurrence edit fields'; end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or
    (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or
    (p_scope<>'occurrence' and p_patch ? 'event_date') or
    ((p_rule is null)<>(p_dates is null)) then raise exception 'Invalid recurrence edit fields'; end if;
  payload := jsonb_build_object('domain','event','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,
    'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then
    if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then
      raise exception 'Idempotency key already used'; end if;
    return receipt.selected_id;
  end if;
  -- Series first, then rows in ID order. Existing workflow RPCs lock the same
  -- rows, so assignments, awards and individual mutations serialize with bulk.
  select * into s from public.event_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if s.revision is distinct from p_revision or s.retired then raise exception 'Series changed; reload and try again'; end if;
  perform 1 from public.events where recurrence_series_id=s.id order by id for update;
  select * into selected from public.events where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_event(p_selected_id) then raise exception 'Event outside branch scope'; end if;
  if selected.deleted_at is not null and p_operation='edit' then raise exception 'This event cannot be edited'; end if;
  select array_agg(id order by recurrence_key) into ids from public.events
    where recurrence_series_id=s.id and (recurrence_key<=s.ends_on or p_scope='occurrence') and
      (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if ids is null then raise exception 'Occurrence outside active schedule'; end if;
  select coalesce(array_agg(id),'{}'::bigint[]) into preserved_removed_ids from public.events where id=any(ids) and deleted_at is not null;
  before_definition := to_jsonb(s);
  if p_rule is not null then
    perform private.assert_recurrence_dates(p_rule,p_dates);
    -- Schedule edits never bring back removed slots. Existing rows are mapped
    -- in recurrence order, including tombstones, and retain their real IDs.
    if p_scope='following' and p_dates[1]<=coalesce((select max(recurrence_key) from public.events
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key),'-infinity'::date) then
      raise exception 'Future schedule must remain after earlier occurrences'; end if;
    insert into public.event_series(request_key,recurrence_rule,created_by,starts_on,ends_on,parent_series_id)
      values(p_request_key,p_rule,private.current_active_officer_id(),p_dates[1],p_dates[cardinality(p_dates)],s.id) returning id into target_series;
    select max(recurrence_key) into previous_day from public.events
      where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
    if p_scope='following' and previous_day is not null then
      update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
        ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day,revision=revision+1 where id=s.id;
    else
      update public.event_series set retired=true,revision=revision+1 where id=s.id;
    end if;
  end if;
  foreach occurrence_id in array ids loop
    i := i+1;
    select * into r from public.events where id=occurrence_id;
    if not private.can_manage_event(r.id) then raise exception 'Event outside branch scope'; end if;
    if p_operation='remove' or (p_rule is not null and i>cardinality(p_dates)) then
      perform private.remove_event(r.id);
    elsif p_operation='cancel' then
      if r.status<>'cancelled' and r.deleted_at is null then perform private.cancel_event(r.id); end if;
    elsif r.deleted_at is null then

      if r.deleted_at is not null or (p_scope='occurrence' and r.status='cancelled') then raise exception 'This event cannot be edited'; end if;
      day := case when p_scope='occurrence' then coalesce((p_patch->>'event_date')::date,r.event_date) else r.event_date end;
      if p_rule is not null then day := p_dates[i]; end if;
      starts := (day + coalesce((p_patch->>'start_time')::time,(r.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      ends := (day + coalesce((p_patch->>'end_time')::time,(r.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      branches := case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint)
        else array(select branch_id from public.event_branches where event_id=r.id order by branch_id) end;
      -- Reuse all existing Event field, link, branch and schedule validation.
      -- Cancelled siblings keep their lifecycle while sharing field validation.
      perform private.save_event_fields(coalesce(p_patch->>'name',r.name),coalesce(p_patch->>'description',r.description),
        coalesce((p_patch->>'event_type_id')::bigint,r.event_type_id),coalesce(p_patch->>'location',r.location),
        day,starts,ends,branches,r.id,
        case when p_patch ? 'slides_url' then p_patch->>'slides_url' else r.slides_url end,
        case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else r.meeting_notes_url end);

    end if;
    if p_rule is not null and i<=cardinality(p_dates) then
      update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=r.id;
    end if;
  end loop;

  if p_rule is not null and cardinality(p_dates)>cardinality(ids) then
    for i in cardinality(ids)+1..cardinality(p_dates) loop
      if exists(with recursive ancestors as (
        select id,parent_series_id from public.event_series where id=s.id
        union all select a.id,a.parent_series_id from public.event_series a join ancestors b on a.id=b.parent_series_id
      ) select 1 from public.events t join ancestors a on a.id=t.recurrence_series_id
        where t.deleted_at is not null and t.recurrence_key=p_dates[i]) then
        raise exception 'Schedule would recreate a removed occurrence'; end if;
      occurrence_id := private.save_event_fields(coalesce(p_patch->>'name',selected.name),coalesce(p_patch->>'description',selected.description),
        coalesce((p_patch->>'event_type_id')::bigint,selected.event_type_id),coalesce(p_patch->>'location',selected.location),
        p_dates[i],(p_dates[i]+coalesce((p_patch->>'start_time')::time,(selected.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',
        (p_dates[i]+coalesce((p_patch->>'end_time')::time,(selected.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',
        case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint)
        else array(select branch_id from public.event_branches where event_id=selected.id) end,null,
        case when p_patch ? 'slides_url' then p_patch->>'slides_url' else selected.slides_url end,
        case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else selected.meeting_notes_url end);
      update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=occurrence_id;
      ids := array_append(ids,occurrence_id);
    end loop;
  end if;
  if p_rule is null then
    if p_operation='remove' and p_scope<>'occurrence' then
      select max(recurrence_key) into previous_day from public.events
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
      if p_scope='following' and previous_day is not null then
        update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
          ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day where id=s.id;
      else update public.event_series set retired=true where id=s.id; end if;
    end if;
    update public.event_series set revision=revision+1 where id=s.id;
    target_series := s.id;
  end if;
  select to_jsonb(definition) into after_definition from public.event_series definition where id=target_series;
  perform private.write_audit_log('event.series_'||p_operation,'event_series',s.id::text,
    jsonb_build_object('selected_occurrence_id',selected.id,'boundary',selected.recurrence_key,'scope',p_scope,
      'operation',p_operation,'before',before_definition,'after',after_definition,'result_series_id',target_series,
      'original_series_after',(select to_jsonb(definition) from public.event_series definition where id=s.id),
      'affected_occurrence_ids',ids,
      'preserved_removed_occurrence_ids',preserved_removed_ids,
      'patch',p_patch,'request_key',p_request_key));
  insert into private.recurrence_mutations values(p_request_key,actor,payload,selected.id);
  return selected.id;
end;
$$;
create function public.mutate_recurring_event(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_event(p_selected_id,p_scope,p_operation,p_request_key,p_series_id,p_revision,p_patch,p_rule,p_dates)
$$;
revoke all on function private.mutate_recurring_event(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_event(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]) from public,anon,authenticated;
grant execute on function private.mutate_recurring_event(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_event(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]) to authenticated;

create function private.mutate_recurring_task(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',
  p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.tasks; r public.tasks; s public.task_series;
  actor uuid := auth.uid(); payload jsonb; receipt private.recurrence_mutations;
  ids bigint[]; preserved_removed_ids bigint[]; target_series bigint; i integer := 0; day date; previous_day date;
  before_definition jsonb; after_definition jsonb; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or
    p_operation is null or p_operation not in ('edit','remove') or p_request_key is null then
    raise exception 'Invalid recurrence scope or operation'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(
    select 1 from jsonb_object_keys(p_patch) k where k not in ('title','description','task_type','branch_id','due_date','points','approval_required')) or
    exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then
    raise exception 'Invalid recurrence edit fields'; end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or
    (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or
    (p_scope<>'occurrence' and p_patch ? 'due_date') or
    ((p_rule is null)<>(p_dates is null)) then raise exception 'Invalid recurrence edit fields'; end if;
  payload := jsonb_build_object('domain','task','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,
    'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then
    if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then
      raise exception 'Idempotency key already used'; end if;
    return receipt.selected_id;
  end if;
  -- Series first, then rows in ID order. Existing workflow RPCs lock the same
  -- rows, so assignments, awards and individual mutations serialize with bulk.
  select * into s from public.task_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if s.revision is distinct from p_revision or s.retired then raise exception 'Series changed; reload and try again'; end if;
  perform 1 from public.tasks where recurrence_series_id=s.id order by id for update;
  select * into selected from public.tasks where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_branches(array[selected.branch_id]) then raise exception 'Task outside branch scope'; end if;
  if selected.removed_at is not null and p_operation='edit' then raise exception 'Task has been removed'; end if;
  select array_agg(id order by recurrence_key) into ids from public.tasks
    where recurrence_series_id=s.id and (recurrence_key<=s.ends_on or p_scope='occurrence') and
      (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if ids is null then raise exception 'Occurrence outside active schedule'; end if;
  select coalesce(array_agg(id),'{}'::bigint[]) into preserved_removed_ids from public.tasks where id=any(ids) and removed_at is not null;
  before_definition := to_jsonb(s);
  if p_rule is not null then
    perform private.assert_recurrence_dates(p_rule,p_dates);
    -- Schedule edits never bring back removed slots. Existing rows are mapped
    -- in recurrence order, including tombstones, and retain their real IDs.
    if p_scope='following' and p_dates[1]<=coalesce((select max(recurrence_key) from public.tasks
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key),'-infinity'::date) then
      raise exception 'Future schedule must remain after earlier occurrences'; end if;
    insert into public.task_series(request_key,recurrence_rule,created_by,starts_on,ends_on,parent_series_id)
      values(p_request_key,p_rule,private.current_active_officer_id(),p_dates[1],p_dates[cardinality(p_dates)],s.id) returning id into target_series;
    select max(recurrence_key) into previous_day from public.tasks
      where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
    if p_scope='following' and previous_day is not null then
      update public.task_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
        ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day,revision=revision+1 where id=s.id;
    else
      update public.task_series set retired=true,revision=revision+1 where id=s.id;
    end if;
  end if;
  foreach occurrence_id in array ids loop
    i := i+1;
    select * into r from public.tasks where id=occurrence_id;
    if not private.can_manage_branches(array[r.branch_id]) then raise exception 'Task outside branch scope'; end if;
    if p_operation='remove' or (p_rule is not null and i>cardinality(p_dates)) then
      perform private.remove_task(r.id);

    elsif r.removed_at is null then

      if r.removed_at is not null then raise exception 'Task has been removed'; end if;
      if p_patch ? 'branch_id' and not private.can_manage_branches(array[(p_patch->>'branch_id')::bigint]) then
        raise exception 'Task outside branch scope'; end if;
      if (p_patch ? 'points' or p_patch ? 'approval_required') and
        (exists(select 1 from public.task_assignments where task_id=r.id and completed_at is not null) or
         exists(select 1 from public.point_transactions where task_id=r.id)) then
        raise exception 'Completed or awarded Task point settings cannot be edited'; end if;
      day := case when p_scope='occurrence' then coalesce((p_patch->>'due_date')::date,r.due_date) else r.due_date end;
      if p_rule is not null then day := p_dates[i]; end if;
      update public.tasks set title=coalesce(p_patch->>'title',r.title),description=coalesce(p_patch->>'description',r.description),
        task_type=coalesce(p_patch->>'task_type',r.task_type),branch_id=coalesce((p_patch->>'branch_id')::bigint,r.branch_id),
        due_date=day,points=coalesce((p_patch->>'points')::numeric,r.points),
        approval_required=coalesce((p_patch->>'approval_required')::boolean,r.approval_required) where id=r.id;
      perform private.write_audit_log('task.updated','task',r.id::text,
        jsonb_build_object('before',to_jsonb(r),'after',(select to_jsonb(t) from public.tasks t where id=r.id)));

    end if;
    if p_rule is not null and i<=cardinality(p_dates) then
      update public.tasks set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=r.id;
    end if;
  end loop;

  if p_rule is not null and cardinality(p_dates)>cardinality(ids) then
    for i in cardinality(ids)+1..cardinality(p_dates) loop
      if exists(with recursive ancestors as (
        select id,parent_series_id from public.task_series where id=s.id
        union all select a.id,a.parent_series_id from public.task_series a join ancestors b on a.id=b.parent_series_id
      ) select 1 from public.tasks t join ancestors a on a.id=t.recurrence_series_id
        where t.removed_at is not null and t.recurrence_key=p_dates[i]) then
        raise exception 'Schedule would recreate a removed occurrence'; end if;
      occurrence_id := private.save_task(coalesce(p_patch->>'title',selected.title),coalesce(p_patch->>'description',selected.description),
        coalesce(p_patch->>'task_type',selected.task_type),coalesce((p_patch->>'branch_id')::bigint,selected.branch_id),p_dates[i],
        coalesce((p_patch->>'points')::numeric,selected.points),coalesce((p_patch->>'approval_required')::boolean,selected.approval_required));
      update public.tasks set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=occurrence_id;
      ids := array_append(ids,occurrence_id);
    end loop;
  end if;
  if p_rule is null then
    if p_operation='remove' and p_scope<>'occurrence' then
      select max(recurrence_key) into previous_day from public.tasks
        where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on;
      if p_scope='following' and previous_day is not null then
        update public.task_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',
          ';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day where id=s.id;
      else update public.task_series set retired=true where id=s.id; end if;
    end if;
    update public.task_series set revision=revision+1 where id=s.id;
    target_series := s.id;
  end if;
  select to_jsonb(definition) into after_definition from public.task_series definition where id=target_series;
  perform private.write_audit_log('task.series_'||p_operation,'task_series',s.id::text,
    jsonb_build_object('selected_occurrence_id',selected.id,'boundary',selected.recurrence_key,'scope',p_scope,
      'operation',p_operation,'before',before_definition,'after',after_definition,'result_series_id',target_series,
      'original_series_after',(select to_jsonb(definition) from public.task_series definition where id=s.id),
      'affected_occurrence_ids',ids,
      'preserved_removed_occurrence_ids',preserved_removed_ids,
      'patch',p_patch,'request_key',p_request_key));
  insert into private.recurrence_mutations values(p_request_key,actor,payload,selected.id);
  return selected.id;
end;
$$;
create function public.mutate_recurring_task(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.mutate_recurring_task(p_selected_id,p_scope,p_operation,p_request_key,p_series_id,p_revision,p_patch,p_rule,p_dates)
$$;
revoke all on function private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]) from public,anon,authenticated;
grant execute on function private.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]),
  public.mutate_recurring_task(bigint,text,text,uuid,bigint,integer,jsonb,text,date[]) to authenticated;

alter table public.event_series add constraint event_series_bounds check (
  (starts_on is null and ends_on is null) or (starts_on is not null and ends_on is not null and starts_on<=ends_on)),
  add constraint event_series_revision check (revision>=0),
  add constraint event_series_parent check (parent_series_id is distinct from id);
alter table public.task_series add constraint task_series_bounds check (
  (starts_on is null and ends_on is null) or (starts_on is not null and ends_on is not null and starts_on<=ends_on)),
  add constraint task_series_revision check (revision>=0),
  add constraint task_series_parent check (parent_series_id is distinct from id);
