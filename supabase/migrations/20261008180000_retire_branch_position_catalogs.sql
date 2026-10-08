-- Catalog retirement preserves keys and historical relationships while
-- preventing retired values from being added to new relationships.
alter table public.branches add column is_active boolean not null default true;
alter table public.positions add column is_active boolean not null default true;

create function private.set_branch_active(p_id bigint, p_is_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text; old_active boolean;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name,is_active into old_name,old_active from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if old_active is distinct from p_is_active then
    update public.branches set is_active=p_is_active where id=p_id;
    perform private.write_audit_log(case when p_is_active then 'branch.reactivated' else 'branch.retired' end,
      'branch',p_id::text,pg_catalog.jsonb_build_object('name',old_name));
  end if;
end;
$$;

create function private.set_position_active(p_id bigint, p_is_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text; old_code text; old_active boolean;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name,code,is_active into old_name,old_code,old_active from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_code) then raise exception 'Required positions cannot be retired'; end if;
  if old_active is distinct from p_is_active then
    update public.positions set is_active=p_is_active where id=p_id;
    perform private.write_audit_log(case when p_is_active then 'position.reactivated' else 'position.retired' end,
      'position',p_id::text,pg_catalog.jsonb_build_object('name',old_name));
  end if;
end;
$$;

create function public.set_branch_active(p_id bigint,p_is_active boolean) returns void
language sql security invoker set search_path = '' as $$select private.set_branch_active(p_id,p_is_active)$$;
create function public.set_position_active(p_id bigint,p_is_active boolean) returns void
language sql security invoker set search_path = '' as $$select private.set_position_active(p_id,p_is_active)$$;
revoke all on function private.set_branch_active(bigint,boolean),private.set_position_active(bigint,boolean),
  public.set_branch_active(bigint,boolean),public.set_position_active(bigint,boolean) from public,anon,authenticated;
grant execute on function private.set_branch_active(bigint,boolean),private.set_position_active(bigint,boolean),
  public.set_branch_active(bigint,boolean),public.set_position_active(bigint,boolean) to authenticated;

-- Tasks are single-Branch records, and recurring-series mutation paths write
-- Task rows internally. Guard every insert/branch change at the table boundary.
create function private.prevent_retired_task_branch_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' and not exists(
    select 1 from public.branches where id=new.branch_id and is_active) then
    raise exception 'Invalid or retired branch';
  elsif tg_op='UPDATE' and new.branch_id is distinct from old.branch_id and not exists(
    select 1 from public.branches where id=new.branch_id and is_active) then
    raise exception 'Invalid or retired branch';
  end if;
  return new;
end;
$$;
create trigger tasks_active_branch_assignment
before insert or update of branch_id on public.tasks
for each row execute function private.prevent_retired_task_branch_assignment();
revoke all on function private.prevent_retired_task_branch_assignment() from public,anon,authenticated;

-- Preserve inactive values only when they are already related to the record
-- being edited. New records and newly added relationships must use active rows.
create or replace function private.save_officer(
  p_name text,p_position_id bigint,p_status text,p_branch_ids bigint[],p_officer_id bigint,
  p_utep_email text,p_personal_email text,p_classification text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; old_officer public.officers; new_officer public.officers;
  old_branches bigint[] := '{}'::bigint[]; requested_branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
  new_branches bigint[]; old_snapshot jsonb; new_snapshot jsonb; audit_action text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_officer_id is null then
    if not exists(select 1 from public.positions where id=p_position_id and is_active) then raise exception 'Invalid or retired position'; end if;
    if exists(select 1 from unnest(requested_branches) x(id) left join public.branches b on b.id=x.id where b.id is null or not b.is_active) then raise exception 'Invalid or retired branch'; end if;
    insert into public.officers(name,utep_email,personal_email,position_id,classification)
    values(trim(p_name),nullif(lower(trim(p_utep_email)),''),nullif(lower(trim(p_personal_email)),''),p_position_id,nullif(trim(p_classification),'')) returning id into saved_id;
  else
    perform pg_catalog.pg_advisory_xact_lock(3847821);
    select * into old_officer from public.officers where id=p_officer_id for update;
    if not found then raise exception 'Officer not found'; end if;
    select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[]) into old_branches from public.officer_branches where officer_id=p_officer_id;
    if not exists(select 1 from public.positions where id=p_position_id and (is_active or (id=old_officer.position_id))) then raise exception 'Invalid or retired position'; end if;
    if exists(select 1 from unnest(requested_branches) x(id) left join public.branches b on b.id=x.id where b.id is null or (not b.is_active and not (x.id=any(old_branches))) then raise exception 'Invalid or retired branch'; end if;
    old_snapshot := pg_catalog.jsonb_build_object('name',old_officer.name,'position_id',old_officer.position_id,'status',old_officer.status,'application_role',old_officer.application_role,'utep_email',old_officer.utep_email,'personal_email',old_officer.personal_email,'classification',old_officer.classification,'branch_ids',old_branches);
    if old_officer.status='active' and p_status='inactive' and old_officer.application_role='admin' and (select count(*) from public.officers where application_role='admin' and status='active')<=1 then raise exception 'Last active admin cannot be deactivated'; end if;
    update public.officers set name=trim(p_name),utep_email=nullif(lower(trim(p_utep_email)),''),personal_email=nullif(lower(trim(p_personal_email)),''),position_id=p_position_id,classification=nullif(trim(p_classification),''),status=p_status where id=p_officer_id returning id into saved_id;
    if old_branches is distinct from requested_branches then
      delete from public.officer_branches where officer_id=saved_id;
      insert into public.officer_branches(officer_id,branch_id) select saved_id,branch_id from unnest(requested_branches) branch_id;
    end if;
  end if;
  if p_officer_id is null then insert into public.officer_branches(officer_id,branch_id) select saved_id,branch_id from unnest(requested_branches) branch_id; end if;
  select * into new_officer from public.officers where id=saved_id;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[]) into new_branches from public.officer_branches where officer_id=saved_id;
  new_snapshot := pg_catalog.jsonb_build_object('name',new_officer.name,'position_id',new_officer.position_id,'status',new_officer.status,'application_role',new_officer.application_role,'utep_email',new_officer.utep_email,'personal_email',new_officer.personal_email,'classification',new_officer.classification,'branch_ids',new_branches);
  if p_officer_id is null then audit_action:='officer.created'; elsif old_officer.status='active' and new_officer.status='inactive' then audit_action:='officer.deactivated'; elsif old_officer.status='inactive' and new_officer.status='active' then audit_action:='officer.reactivated'; else audit_action:='officer.updated'; end if;
  if p_officer_id is null or old_snapshot is distinct from new_snapshot then perform private.write_audit_log(audit_action,'officer',saved_id::text,case when p_officer_id is null then pg_catalog.jsonb_build_object('after',new_snapshot) else pg_catalog.jsonb_build_object('before',old_snapshot,'after',new_snapshot) end); end if;
  return saved_id;
end;
$$;

create or replace function private.save_event_fields(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint,
  p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; before_details jsonb; old_event public.events; branches bigint[]:=coalesce(p_branch_ids,'{}'::bigint[]);
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_branches(branches) then raise exception 'Event outside branch scope'; end if;
  if cardinality(branches)<>(select count(distinct id) from unnest(branches) b(id)) then raise exception 'Duplicate branches'; end if;
  if exists(select 1 from unnest(branches) x(id) join public.branches b on b.id=x.id where not b.is_active and (p_event_id is null or not exists(select 1 from public.event_branches eb where eb.event_id=p_event_id and eb.branch_id=x.id))) then raise exception 'Invalid or retired branch'; end if;
  if nullif(pg_catalog.btrim(p_name),'') is null or nullif(pg_catalog.btrim(p_description),'') is null or nullif(pg_catalog.btrim(p_location),'') is null then raise exception 'Name, description and location are required'; end if;
  if not exists(select 1 from public.event_types where id=p_event_type_id and available_for_new_events) and not (p_event_id is not null and exists(select 1 from public.events where id=p_event_id and event_type_id=p_event_type_id)) then raise exception 'Invalid event type'; end if;
  if p_event_date is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or (p_starts_at at time zone 'America/Denver')::date<>p_event_date or (p_ends_at at time zone 'America/Denver')::date<>p_event_date or (p_starts_at at time zone 'America/Denver')::time<time '06:00' or (p_ends_at at time zone 'America/Denver')::time>time '23:59' then raise exception 'Events need one date and a valid time from 06:00 through 23:59'; end if;
  if nullif(pg_catalog.btrim(p_slides_url),'') is not null and pg_catalog.btrim(p_slides_url) !~* '^https?://[^[:space:]]+$' then raise exception 'Slides link must be an HTTP(S) URL'; end if;
  if nullif(pg_catalog.btrim(p_meeting_notes_url),'') is not null and pg_catalog.btrim(p_meeting_notes_url) !~* '^https?://[^[:space:]]+$' then raise exception 'Meeting notes link must be an HTTP(S) URL'; end if;
  if p_event_id is null then
    insert into public.events(name,description,event_type_id,location,event_date,starts_at,ends_at,slides_url,meeting_notes_url) values(pg_catalog.btrim(p_name),pg_catalog.btrim(p_description),p_event_type_id,pg_catalog.btrim(p_location),p_event_date,p_starts_at,p_ends_at,nullif(pg_catalog.btrim(p_slides_url),''),nullif(pg_catalog.btrim(p_meeting_notes_url),'')) returning id into saved_id;
  else
    select * into old_event from public.events where id=p_event_id for update; if not found then raise exception 'Event not found'; end if;
    if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if old_event.deleted_at is not null then raise exception 'This event cannot be edited'; end if;
    before_details:=pg_catalog.to_jsonb(old_event)||pg_catalog.jsonb_build_object('branch_ids',(select coalesce(array_agg(branch_id order by branch_id),'{}'::bigint[]) from public.event_branches where event_id=p_event_id));
    update public.events set name=pg_catalog.btrim(p_name),description=pg_catalog.btrim(p_description),event_type_id=p_event_type_id,location=pg_catalog.btrim(p_location),event_date=p_event_date,starts_at=p_starts_at,ends_at=p_ends_at,slides_url=nullif(pg_catalog.btrim(p_slides_url),''),meeting_notes_url=nullif(pg_catalog.btrim(p_meeting_notes_url),'') where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id) select saved_id,id from unnest(branches) b(id);
  if p_event_id is null or before_details is distinct from ((select to_jsonb(e) from public.events e where id=saved_id)||pg_catalog.jsonb_build_object('branch_ids',branches)) then perform private.write_audit_log(case when p_event_id is null then 'event.created' else 'event.updated' end,'event',saved_id::text,pg_catalog.jsonb_build_object('before',before_details,'after',(select to_jsonb(e) from public.events e where id=saved_id)||pg_catalog.jsonb_build_object('branch_ids',branches))); end if;
  if p_event_id is not null and (old_event.slides_url is distinct from nullif(pg_catalog.btrim(p_slides_url),'') or old_event.meeting_notes_url is distinct from nullif(pg_catalog.btrim(p_meeting_notes_url),'')) then perform private.write_audit_log('event.links_updated','event',saved_id::text,pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object('slides_url',old_event.slides_url,'meeting_notes_url',old_event.meeting_notes_url),'after',pg_catalog.jsonb_build_object('slides_url',nullif(pg_catalog.btrim(p_slides_url),''),'meeting_notes_url',nullif(pg_catalog.btrim(p_meeting_notes_url),'')))); end if;
  return saved_id;
end;
$$;

create or replace function private.update_task_details(p_task_id bigint,p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,p_points numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; actor_id bigint:=private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) or not private.can_manage_branches(array[p_branch_id]) then raise exception 'Task outside branch scope'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and (is_active or id=task_row.branch_id)) then raise exception 'Invalid or retired branch'; end if;
  if nullif(pg_catalog.btrim(p_title),'') is null or nullif(pg_catalog.btrim(p_description),'') is null or p_task_type not in ('Flyer','LinkedIn','Airtable','Story','Post') or p_due_date is null or p_points is null or p_points<=0 or p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Invalid task fields'; end if;
  if p_points is distinct from task_row.points and (exists(select 1 from public.task_officer_assignments where task_id=p_task_id and completed_at is not null) or exists(select 1 from public.point_transactions where task_id=p_task_id and award_type='task')) then raise exception 'Completed or awarded Task point settings cannot be edited'; end if;
  update public.tasks set title=pg_catalog.btrim(p_title),description=pg_catalog.btrim(p_description),task_type=p_task_type,branch_id=p_branch_id,due_date=p_due_date,points=p_points where id=p_task_id;
  perform private.write_audit_log('task.updated','task',p_task_id::text,pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(task_row),'after',(select pg_catalog.to_jsonb(t) from public.tasks t where id=p_task_id)));
end;
$$;

create or replace function private.save_task(p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,p_points numeric,p_approval_required boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; actor_id bigint:=private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_branches(array[p_branch_id]) then raise exception 'Task outside branch scope'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and is_active) then raise exception 'Invalid or retired branch'; end if;
  if nullif(pg_catalog.btrim(p_title),'') is null or nullif(pg_catalog.btrim(p_description),'') is null or p_due_date is null or p_task_type is null or p_task_type not in ('Flyer','LinkedIn','Airtable','Story','Post') or p_points is null or p_points<=0 or p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_approval_required is null then raise exception 'Invalid task fields'; end if;
  insert into public.tasks(title,description,task_type,branch_id,due_date,points,approval_required,created_by) values(pg_catalog.btrim(p_title),pg_catalog.btrim(p_description),p_task_type,p_branch_id,p_due_date,p_points,p_approval_required,actor_id) returning id into saved_id;
  perform private.write_audit_log('task.created','task',saved_id::text,pg_catalog.jsonb_build_object('task_type',p_task_type,'branch_id',p_branch_id,'points',p_points,'approval_required',p_approval_required));
  return saved_id;
end;
$$;
