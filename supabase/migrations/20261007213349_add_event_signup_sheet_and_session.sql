-- Issue #142: add a nullable external signup sheet and activate Session.
-- Existing Events, type IDs, and RPC signatures remain usable during rollout.
alter table public.events add column signup_sheet_url text;

insert into public.event_types(name, available_for_new_events)
select 'Session', true
where not exists(select 1 from public.event_types where lower(trim(name))='session');
update public.event_types set available_for_new_events=true where lower(trim(name))='session';

create or replace function private.normalize_signup_sheet_url(p_url text)
returns text language plpgsql immutable set search_path = '' as $$
declare normalized text := nullif(pg_catalog.btrim(p_url), '');
begin
  if normalized is not null and normalized !~* '^https?://[^/?#[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    raise exception 'Signup sheet must be an HTTP(S) URL';
  end if;
  return normalized;
end;
$$;
revoke all on function private.normalize_signup_sheet_url(text) from public, anon, authenticated;

-- Reuse the authoritative Event saver with catalog based validation. Existing
-- Event types stay editable for their existing rows even after deactivation.
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
  if cardinality(branches) <> (select count(distinct id) from unnest(branches) b(id)) then raise exception 'Duplicate branches'; end if;
  if nullif(pg_catalog.btrim(p_name),'') is null or nullif(pg_catalog.btrim(p_description),'') is null or nullif(pg_catalog.btrim(p_location),'') is null then raise exception 'Name, description and location are required'; end if;
  if not exists(select 1 from public.event_types where id=p_event_type_id and available_for_new_events)
    and not (p_event_id is not null and exists(select 1 from public.events where id=p_event_id and event_type_id=p_event_type_id)) then raise exception 'Invalid event type'; end if;
  if p_event_date is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or
    (p_starts_at at time zone 'America/Denver')::date<>p_event_date or (p_ends_at at time zone 'America/Denver')::date<>p_event_date or
    (p_starts_at at time zone 'America/Denver')::time<time '06:00' or (p_ends_at at time zone 'America/Denver')::time>time '23:59' then
    raise exception 'Events need one date and a valid time from 06:00 through 23:59'; end if;
  if nullif(pg_catalog.btrim(p_slides_url),'') is not null and pg_catalog.btrim(p_slides_url) !~* '^https?://[^[:space:]]+$' then raise exception 'Slides link must be an HTTP(S) URL'; end if;
  if nullif(pg_catalog.btrim(p_meeting_notes_url),'') is not null and pg_catalog.btrim(p_meeting_notes_url) !~* '^https?://[^[:space:]]+$' then raise exception 'Meeting notes link must be an HTTP(S) URL'; end if;
  if p_event_id is null then
    insert into public.events(name,description,event_type_id,location,event_date,starts_at,ends_at,slides_url,meeting_notes_url)
    values(pg_catalog.btrim(p_name),pg_catalog.btrim(p_description),p_event_type_id,pg_catalog.btrim(p_location),p_event_date,p_starts_at,p_ends_at,nullif(pg_catalog.btrim(p_slides_url),''),nullif(pg_catalog.btrim(p_meeting_notes_url),'')) returning id into saved_id;
  else
    select * into old_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if old_event.deleted_at is not null then raise exception 'This event cannot be edited'; end if;
    before_details := pg_catalog.to_jsonb(old_event) || pg_catalog.jsonb_build_object('branch_ids',(select coalesce(array_agg(branch_id order by branch_id),'{}'::bigint[]) from public.event_branches where event_id=p_event_id));
    update public.events set name=pg_catalog.btrim(p_name),description=pg_catalog.btrim(p_description),event_type_id=p_event_type_id,location=pg_catalog.btrim(p_location),event_date=p_event_date,starts_at=p_starts_at,ends_at=p_ends_at,slides_url=nullif(pg_catalog.btrim(p_slides_url),''),meeting_notes_url=nullif(pg_catalog.btrim(p_meeting_notes_url),'') where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id) select saved_id,id from unnest(branches) b(id);
  if p_event_id is null or before_details is distinct from ((select to_jsonb(e) from public.events e where id=saved_id) || pg_catalog.jsonb_build_object('branch_ids',branches)) then
    perform private.write_audit_log(case when p_event_id is null then 'event.created' else 'event.updated' end,'event',saved_id::text,pg_catalog.jsonb_build_object('before',before_details,'after',(select to_jsonb(e) from public.events e where id=saved_id) || pg_catalog.jsonb_build_object('branch_ids',branches)));
  end if;
  if p_event_id is not null and (old_event.slides_url is distinct from nullif(pg_catalog.btrim(p_slides_url),'') or old_event.meeting_notes_url is distinct from nullif(pg_catalog.btrim(p_meeting_notes_url),'')) then
    perform private.write_audit_log('event.links_updated','event',saved_id::text,pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object('slides_url',old_event.slides_url,'meeting_notes_url',old_event.meeting_notes_url),'after',pg_catalog.jsonb_build_object('slides_url',nullif(pg_catalog.btrim(p_slides_url),''),'meeting_notes_url',nullif(pg_catalog.btrim(p_meeting_notes_url),''))));
  end if;
  return saved_id;
end;
$$;

create or replace function private.update_event_signup_sheet_url(p_event_id bigint,p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_url text; new_url text := private.normalize_signup_sheet_url(p_url);
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select signup_sheet_url into old_url from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if old_url is distinct from new_url then
    update public.events set signup_sheet_url=new_url where id=p_event_id;
    perform private.write_audit_log('event.links_updated','event',p_event_id::text,
      pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object('signup_sheet_url',old_url),
        'after',pg_catalog.jsonb_build_object('signup_sheet_url',new_url)));
  end if;
end;
$$;
revoke all on function private.update_event_signup_sheet_url(bigint,text) from public, anon, authenticated;

create table private.recurring_event_signup_sheet_requests (
  request_key uuid primary key,
  signup_sheet_url text
);
revoke all on private.recurring_event_signup_sheet_requests from public, anon, authenticated;

-- A separate RPC leaves the legacy link-save signature unambiguous for old clients.
create function private.save_event_with_signup_sheet(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint,
  p_slides_url text,p_meeting_notes_url text,p_signup_sheet_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  saved_id := private.save_event_with_links(p_name,p_description,p_event_type_id,p_location,p_event_date,
    p_starts_at,p_ends_at,p_branch_ids,p_event_id,p_slides_url,p_meeting_notes_url);
  perform private.update_event_signup_sheet_url(saved_id,p_signup_sheet_url);
  return saved_id;
end;
$$;
revoke all on function private.save_event_with_signup_sheet(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text,text) from public, anon, authenticated;
grant execute on function private.save_event_with_signup_sheet(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text,text) to authenticated;

create function public.save_event_with_signup_sheet(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_signup_sheet_url text,
  p_event_id bigint default null,p_slides_url text default null,p_meeting_notes_url text default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event_with_signup_sheet(p_name,p_description,p_event_type_id,p_location,p_event_date,
    p_starts_at,p_ends_at,p_branch_ids,p_event_id,p_slides_url,p_meeting_notes_url,p_signup_sheet_url)
$$;
revoke all on function public.save_event_with_signup_sheet(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.save_event_with_signup_sheet(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,bigint,text,text) to authenticated;

-- The old recurrence constructor keeps its idempotency behavior. Apply the
-- optional field to every created occurrence within the same transaction.
create function private.create_recurring_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_branch_ids bigint[],
  p_slides_url text,p_meeting_notes_url text,p_signup_sheet_url text,p_request_key uuid,
  p_recurrence_rule text,p_event_dates date[],p_starts_at timestamptz[],p_ends_at timestamptz[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare first_id bigint; series_id bigint; event_row record;
  normalized_url text := private.normalize_signup_sheet_url(p_signup_sheet_url);
  prior_url text; had_receipt boolean;
begin
  if p_request_key is null then raise exception 'Invalid recurrence request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,72));
  select signup_sheet_url into prior_url from private.recurring_event_signup_sheet_requests
    where request_key=p_request_key for update;
  had_receipt := found;
  if had_receipt and prior_url is distinct from normalized_url then
    raise exception 'Idempotency key already used';
  end if;
  first_id := private.create_recurring_event(p_name,p_description,p_event_type_id,p_location,p_branch_ids,
    p_slides_url,p_meeting_notes_url,p_request_key,p_recurrence_rule,p_event_dates,p_starts_at,p_ends_at);
  if not had_receipt then
    insert into private.recurring_event_signup_sheet_requests(request_key,signup_sheet_url)
      values(p_request_key,normalized_url);
    select recurrence_series_id into series_id from public.events where id=first_id;
    for event_row in select id from public.events where recurrence_series_id=series_id order by recurrence_key loop
      perform private.update_event_signup_sheet_url(event_row.id,p_signup_sheet_url);
    end loop;
  end if;
  return first_id;
end;
$$;
revoke all on function private.create_recurring_event(text,text,bigint,text,bigint[],text,text,text,uuid,text,date[],timestamptz[],timestamptz[]) from public,anon,authenticated;
grant execute on function private.create_recurring_event(text,text,bigint,text,bigint[],text,text,text,uuid,text,date[],timestamptz[],timestamptz[]) to authenticated;
create function public.create_recurring_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_branch_ids bigint[],
  p_slides_url text,p_meeting_notes_url text,p_signup_sheet_url text,p_request_key uuid,
  p_recurrence_rule text,p_event_dates date[],p_starts_at timestamptz[],p_ends_at timestamptz[]
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_recurring_event(p_name,p_description,p_event_type_id,p_location,p_branch_ids,
    p_slides_url,p_meeting_notes_url,p_signup_sheet_url,p_request_key,p_recurrence_rule,p_event_dates,p_starts_at,p_ends_at)
$$;
revoke all on function public.create_recurring_event(text,text,bigint,text,bigint[],text,text,text,uuid,text,date[],timestamptz[],timestamptz[]) from public,anon,authenticated;
grant execute on function public.create_recurring_event(text,text,bigint,text,bigint[],text,text,text,uuid,text,date[],timestamptz[],timestamptz[]) to authenticated;

-- Add the field to the established scoped edit patch; absence preserves each
-- occurrence's own value and schedule-created occurrences inherit the source.
create or replace function private.mutate_recurring_event(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.events; r public.events; s public.event_series;
  actor uuid := auth.uid(); payload jsonb; receipt private.recurrence_mutations;
  ids bigint[]; preserved_removed_ids bigint[]; target_series bigint; i integer := 0; day date; previous_day date;
  before_definition jsonb; after_definition jsonb; starts timestamptz; ends timestamptz; branches bigint[]; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or p_operation is null or p_operation not in ('edit','remove','cancel') or p_request_key is null then raise exception 'Invalid recurrence scope or operation'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('name','description','event_type_id','location','slides_url','meeting_notes_url','signup_sheet_url','branch_ids','event_date','start_time','end_time')) or exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then raise exception 'Invalid recurrence edit fields'; end if;
  if p_patch ? 'signup_sheet_url' then perform private.normalize_signup_sheet_url(p_patch->>'signup_sheet_url'); end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or (p_scope<>'occurrence' and p_patch ? 'event_date') or ((p_rule is null)<>(p_dates is null)) then raise exception 'Invalid recurrence edit fields'; end if;
  payload := jsonb_build_object('domain','event','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then raise exception 'Idempotency key already used'; end if; return receipt.selected_id; end if;
  select * into s from public.event_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if s.revision is distinct from p_revision or s.retired then raise exception 'Series changed; reload and try again'; end if;
  perform 1 from public.events where recurrence_series_id=s.id order by id for update;
  select * into selected from public.events where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then raise exception 'Occurrence does not belong to this series'; end if;
  if not private.can_manage_event(p_selected_id) then raise exception 'Event outside branch scope'; end if;
  if selected.deleted_at is not null and p_operation='edit' then raise exception 'This event cannot be edited'; end if;
  select array_agg(id order by recurrence_key) into ids from public.events where recurrence_series_id=s.id and (recurrence_key<=s.ends_on or p_scope='occurrence') and (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if ids is null then raise exception 'Occurrence outside active schedule'; end if;
  select coalesce(array_agg(id),'{}'::bigint[]) into preserved_removed_ids from public.events where id=any(ids) and deleted_at is not null;
  before_definition := to_jsonb(s);
  if p_rule is not null then
    perform private.assert_recurrence_dates(p_rule,p_dates);
    if p_scope='following' and p_dates[1]<=coalesce((select max(recurrence_key) from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key),'-infinity'::date) then raise exception 'Future schedule must remain after earlier occurrences'; end if;
    insert into public.event_series(request_key,recurrence_rule,created_by,starts_on,ends_on,parent_series_id) values(p_request_key,p_rule,private.current_active_officer_id(),p_dates[1],p_dates[cardinality(p_dates)],s.id) returning id into target_series;
    select max(recurrence_key) into previous_day from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key;
    if p_scope='following' and previous_day is not null then update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day,revision=revision+1 where id=s.id; else update public.event_series set retired=true,revision=revision+1 where id=s.id; end if;
  end if;
  foreach occurrence_id in array ids loop
    i:=i+1; select * into r from public.events where id=occurrence_id;
    if not private.can_manage_event(r.id) then raise exception 'Event outside branch scope'; end if;
    if p_operation='remove' or (p_rule is not null and i>cardinality(p_dates)) then perform private.remove_event(r.id);
    elsif p_operation='cancel' then if r.status<>'cancelled' and r.deleted_at is null then perform private.cancel_event(r.id); end if;
    elsif r.deleted_at is null then
      if p_scope='occurrence' and r.status='cancelled' then raise exception 'This event cannot be edited'; end if;
      day:=case when p_scope='occurrence' then coalesce((p_patch->>'event_date')::date,r.event_date) else r.event_date end; if p_rule is not null then day:=p_dates[i]; end if;
      starts:=(day+coalesce((p_patch->>'start_time')::time,(r.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      ends:=(day+coalesce((p_patch->>'end_time')::time,(r.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      branches:=case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint) else array(select branch_id from public.event_branches where event_id=r.id order by branch_id) end;
      perform private.save_event_fields(coalesce(p_patch->>'name',r.name),coalesce(p_patch->>'description',r.description),coalesce((p_patch->>'event_type_id')::bigint,r.event_type_id),coalesce(p_patch->>'location',r.location),day,starts,ends,branches,r.id,case when p_patch ? 'slides_url' then p_patch->>'slides_url' else r.slides_url end,case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else r.meeting_notes_url end);
      perform private.update_event_signup_sheet_url(r.id,case when p_patch ? 'signup_sheet_url' then p_patch->>'signup_sheet_url' else r.signup_sheet_url end);
    end if;
    if p_rule is not null and i<=cardinality(p_dates) then update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=r.id; end if;
  end loop;
  if p_rule is not null and cardinality(p_dates)>cardinality(ids) then
    for i in cardinality(ids)+1..cardinality(p_dates) loop
      if exists(with recursive ancestors as (select id,parent_series_id from public.event_series where id=s.id union all select a.id,a.parent_series_id from public.event_series a join ancestors b on a.id=b.parent_series_id) select 1 from public.events t join ancestors a on a.id=t.recurrence_series_id where t.deleted_at is not null and t.recurrence_key=p_dates[i]) then raise exception 'Schedule would recreate a removed occurrence'; end if;
      occurrence_id:=private.save_event_fields(coalesce(p_patch->>'name',selected.name),coalesce(p_patch->>'description',selected.description),coalesce((p_patch->>'event_type_id')::bigint,selected.event_type_id),coalesce(p_patch->>'location',selected.location),p_dates[i],(p_dates[i]+coalesce((p_patch->>'start_time')::time,(selected.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',(p_dates[i]+coalesce((p_patch->>'end_time')::time,(selected.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint) else array(select branch_id from public.event_branches where event_id=selected.id) end,null,case when p_patch ? 'slides_url' then p_patch->>'slides_url' else selected.slides_url end,case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else selected.meeting_notes_url end);
      perform private.update_event_signup_sheet_url(occurrence_id,case when p_patch ? 'signup_sheet_url' then p_patch->>'signup_sheet_url' else selected.signup_sheet_url end);
      update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=occurrence_id; ids:=array_append(ids,occurrence_id);
    end loop;
  end if;
  if p_rule is null then
    if p_operation='remove' and p_scope<>'occurrence' then select max(recurrence_key) into previous_day from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on; if p_scope='following' and previous_day is not null then update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day where id=s.id; else update public.event_series set retired=true where id=s.id; end if; end if;
    update public.event_series set revision=revision+1 where id=s.id; target_series:=s.id;
  end if;
  select to_jsonb(definition) into after_definition from public.event_series definition where id=target_series;
  perform private.write_audit_log('event.series_'||p_operation,'event_series',s.id::text,jsonb_build_object('selected_occurrence_id',selected.id,'boundary',selected.recurrence_key,'scope',p_scope,'operation',p_operation,'before',before_definition,'after',after_definition,'result_series_id',target_series,'original_series_after',(select to_jsonb(definition) from public.event_series definition where id=s.id),'affected_occurrence_ids',ids,'preserved_removed_occurrence_ids',preserved_removed_ids,'patch',p_patch,'request_key',p_request_key));
  insert into private.recurrence_mutations values(p_request_key,actor,payload,selected.id); return selected.id;
end;
$$;
