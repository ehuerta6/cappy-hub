-- Issue #31: preserve all timed history, including rows whose former Event
-- Types are no longer offered for new Events. Remove only truly untimed work.
with removed as (
  select e.id from public.events e where e.starts_at is null
)
delete from public.point_transactions where event_id in (select id from removed);
with removed as (
  select e.id from public.events e where e.starts_at is null
)
delete from public.event_officers where event_id in (select id from removed);
with removed as (
  select e.id from public.events e where e.starts_at is null
)
delete from public.event_branches where event_id in (select id from removed);
delete from public.events where starts_at is null;
-- Keep legacy type values while timed Events still reference them. Removing
-- unreferenced catalog rows is safe because the trusted save RPC allowlists
-- only Meeting, Social, and Workshop below.
delete from public.event_types t
  where t.name in ('General','Intro','ICPC')
    and not exists(select 1 from public.events e where e.event_type_id=t.id);

-- Drop the old callable signatures before removing the obsolete columns.
drop function public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text);
drop function private.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint,text,text);
drop function public.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint);
drop function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint);
drop function private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint);
drop function private.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint);

alter table public.events drop constraint events_kind_check;
alter table public.events alter column starts_at set not null,
  alter column ends_at set not null;
alter table public.events drop column fixed_points, drop column untimed_processed_at;
-- Preserve timed history with honest placeholders where old optional fields were blank.
update public.events set description='Description unavailable'
  where length(pg_catalog.btrim(description))=0;
update public.events set location='TBA'
  where location is null or length(pg_catalog.btrim(location))=0;
alter table public.events add constraint events_description_required
  check (length(pg_catalog.btrim(description))>0);
alter table public.events add constraint events_location_required
  check (location is not null and length(pg_catalog.btrim(location))>0);

create function private.current_is_event_executive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.officers o join public.positions p on p.id=o.position_id
    where o.id=private.current_active_officer_id()
      and p.name in ('President','Vice President of Operations','Vice President of Academics'))
$$;
revoke all on function private.current_is_event_executive() from public,anon,authenticated;

create function private.can_manage_branches(p_branches bigint[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_is_admin() or private.current_is_event_executive() or
    (private.current_is_lead() and cardinality(coalesce(p_branches,'{}'::bigint[]))>0
      and not exists(select 1 from unnest(p_branches) b(id)
        where not exists(select 1 from public.officer_branches ob
          where ob.officer_id=private.current_active_officer_id() and ob.branch_id=b.id)))
$$;
revoke all on function private.can_manage_branches(bigint[]) from public,anon,authenticated;

create or replace function private.can_manage_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_branches(coalesce((select array_agg(branch_id) from public.event_branches
    where event_id=p_event_id),'{}'::bigint[])) and
    exists(select 1 from public.events where id=p_event_id)
$$;

create function private.save_event_with_links(
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
    if old_event.deleted_at is not null or old_event.status='cancelled' then
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
create function public.save_event_with_links(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,
  p_branch_ids bigint[],p_event_id bigint default null,
  p_slides_url text default null,p_meeting_notes_url text default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event_with_links(p_name,p_description,p_event_type_id,p_location,
    p_event_date,p_starts_at,p_ends_at,p_branch_ids,p_event_id,p_slides_url,p_meeting_notes_url)
$$;
revoke all on function private.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text),
  public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text)
  from public,anon,authenticated;
grant execute on function private.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text),
  public.save_event_with_links(text,text,bigint,text,date,timestamptz,timestamptz,bigint[],bigint,text,text)
  to authenticated;

create or replace function private.cancel_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare current_event public.events;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' or
    current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=now() then
    raise exception 'This event cannot be cancelled'; end if;
  update public.events set status='cancelled' where id=p_event_id;
  perform private.write_audit_log('event.cancelled','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',current_event.name,'previous_status',current_event.status,
      'new_status','cancelled','event_date',current_event.event_date,
      'starts_at',current_event.starts_at,'ends_at',current_event.ends_at));
end;
$$;

create or replace function private.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare current_event public.events; actor_id bigint := private.current_active_officer_id(); changed_rows integer;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' or
    current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=now() then
    raise exception 'Signups are closed for this event'; end if;
  if p_officer_id is distinct from actor_id and not private.can_manage_event(p_event_id) then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if not exists(select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active'; end if;
  if p_remove then
    delete from public.event_officers where event_id=p_event_id and officer_id=p_officer_id;
  else
    insert into public.event_officers(event_id,officer_id) values(p_event_id,p_officer_id)
      on conflict do nothing;
  end if;
  get diagnostics changed_rows=row_count;
  if changed_rows>0 then
    perform private.write_audit_log(case when p_remove and p_officer_id=actor_id then 'event.signout'
      when p_remove then 'event.officer_removed'
      when p_officer_id=actor_id then 'event.signup'
      else 'event.officer_assigned' end,
      'event',p_event_id::text,pg_catalog.jsonb_build_object('officer_id',p_officer_id,
        'actor_id',actor_id,'removed',p_remove));
  end if;
end;
$$;

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare finished_event public.events%rowtype; signup record; current_rate numeric;
  award_points numeric; scheduled_hours numeric; award_id bigint; award_count integer;
  event_count integer := 0;
begin
  for finished_event in select * from public.events
    where status<>'cancelled' and deleted_at is null and ends_at<=pg_catalog.now()
      and participation_points_per_hour_at_end is null
    order by id for update skip locked
  loop
    select participation_points_per_hour into current_rate from public.application_config
      where id=1 for share;
    if not found then raise exception 'Participation configuration not found'; end if;
    scheduled_hours := extract(epoch from (finished_event.ends_at-finished_event.starts_at))::numeric/3600;
    award_points := scheduled_hours*current_rate;
    update public.events set participation_points_per_hour_at_end=current_rate where id=finished_event.id;
    award_count := 0;
    for signup in select officer_id from public.event_officers where event_id=finished_event.id order by officer_id loop
      award_id := null;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
      values(signup.officer_id,finished_event.id,award_points,'Event participation','participation',null)
      on conflict(officer_id,event_id) where award_type='participation' do nothing returning id into award_id;
      if award_id is not null then
        award_count := award_count+1;
        perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',finished_event.id,'officer_id',signup.officer_id,
            'scheduled_hours',scheduled_hours,'rate',current_rate,'points',award_points));
      end if;
    end loop;
    perform private.write_audit_log('event.participation_processed','event',finished_event.id::text,
      pg_catalog.jsonb_build_object('rate',current_rate,'scheduled_hours',scheduled_hours,'awards_created',award_count));
    event_count := event_count+1;
  end loop;
  return event_count;
end;
$$;
create or replace view public.dashboard_summary with (security_invoker=true) as
  with period as (select * from private.half_year_bounds(pg_catalog.now()))
  select (select count(*) from public.officers where status='active') as active_officer_count,
    (select count(*) from public.events where status<>'cancelled' and deleted_at is null
      and starts_at>pg_catalog.now()) as upcoming_event_count,
    (select coalesce(pg_catalog.sum(points),0) from public.point_transactions,period
      where removed_at is null and created_at>=period.starts_at and created_at<period.ends_at)
      as half_year_points
  where (select private.current_active_officer_id()) is not null;

-- One assignee per Task. Assignment/completion/approval dates express the
-- workflow without a separate status column that can drift out of sync.
create table public.tasks (
  id bigint generated by default as identity primary key,
  title text not null check(length(pg_catalog.btrim(title))>0),
  description text not null check(length(pg_catalog.btrim(description))>0),
  task_type text not null check(task_type in ('Flyer','LinkedIn','Airtable','Story','Post')),
  branch_id bigint not null references public.branches(id) on delete restrict,
  due_date date not null,
  points numeric not null check(points>0 and points not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  approval_required boolean not null default false,
  created_by bigint not null references public.officers(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.task_assignments (
  task_id bigint primary key references public.tasks(id) on delete restrict,
  officer_id bigint not null references public.officers(id) on delete restrict,
  assigned_by bigint not null references public.officers(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by bigint references public.officers(id) on delete restrict,
  check((approved_at is null)=(approved_by is null)),
  check(approved_at is null or completed_at is not null)
);
create index task_assignments_officer_idx on public.task_assignments(officer_id);
create index tasks_due_date_idx on public.tasks(due_date);
alter table public.point_transactions add column task_id bigint references public.tasks(id) on delete restrict;
alter table public.point_transactions drop constraint point_transactions_award_type_check;
alter table public.point_transactions add constraint point_transactions_award_type_check
  check(award_type in ('participation','manual','correction','task'));
alter table public.point_transactions add constraint task_award_shape_check
  check((award_type='task' and task_id is not null and event_id is null)
    or (award_type<>'task' and task_id is null));
create unique index one_task_award on public.point_transactions(task_id) where award_type='task';

alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
revoke all on public.tasks,public.task_assignments from public,anon,authenticated;
grant select on public.tasks,public.task_assignments to authenticated;
create policy "Approved officers read tasks" on public.tasks for select to authenticated
  using((select private.current_active_officer_id()) is not null);
create policy "Approved officers read task assignments" on public.task_assignments for select to authenticated
  using((select private.current_active_officer_id()) is not null);

create function private.save_task(p_title text,p_description text,p_task_type text,
  p_branch_id bigint,p_due_date date,p_points numeric,p_approval_required boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_branches(array[p_branch_id]) then raise exception 'Task outside branch scope'; end if;
  if nullif(pg_catalog.btrim(p_title),'') is null or nullif(pg_catalog.btrim(p_description),'') is null
    or p_due_date is null or p_task_type is null or p_task_type not in ('Flyer','LinkedIn','Airtable','Story','Post')
    or p_points is null or p_points<=0 or p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or p_approval_required is null then raise exception 'Invalid task fields'; end if;
  insert into public.tasks(title,description,task_type,branch_id,due_date,points,approval_required,created_by)
    values(pg_catalog.btrim(p_title),pg_catalog.btrim(p_description),p_task_type,p_branch_id,
      p_due_date,p_points,p_approval_required,actor_id) returning id into saved_id;
  perform private.write_audit_log('task.created','task',saved_id::text,
    pg_catalog.jsonb_build_object('task_type',p_task_type,'branch_id',p_branch_id,'points',p_points,
      'approval_required',p_approval_required));
  return saved_id;
end;
$$;
create function public.save_task(p_title text,p_description text,p_task_type text,
  p_branch_id bigint,p_due_date date,p_points numeric,p_approval_required boolean)
returns bigint language sql security invoker set search_path = '' as $$
  select private.save_task(p_title,p_description,p_task_type,p_branch_id,p_due_date,p_points,p_approval_required)
$$;

create function private.assign_task(p_task_id bigint,p_officer_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if p_officer_id is distinct from actor_id and
    not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Cannot assign another officer'; end if;
  if not exists(select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active'; end if;
  insert into public.task_assignments(task_id,officer_id,assigned_by)
    values(p_task_id,p_officer_id,actor_id);
  perform private.write_audit_log('task.assigned','task',p_task_id::text,
    pg_catalog.jsonb_build_object('officer_id',p_officer_id,'assigned_by',actor_id));
end;
$$;
create function public.assign_task(p_task_id bigint,p_officer_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.assign_task(p_task_id,p_officer_id)
$$;

create function private.award_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; assignment public.task_assignments; award_id bigint;
begin
  select * into task_row from public.tasks where id=p_task_id;
  select * into assignment from public.task_assignments where task_id=p_task_id;
  if assignment.completed_at is null or
    (task_row.approval_required and assignment.approved_at is null) then
    raise exception 'Task is not awardable'; end if;
  insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by)
    values(assignment.officer_id,p_task_id,task_row.points,'Task completion: '||task_row.title,
      'task',null)
    on conflict(task_id) where award_type='task' do nothing returning id into award_id;
  if award_id is not null then
    perform private.write_audit_log('points.task_created','point_transaction',award_id::text,
      pg_catalog.jsonb_build_object('task_id',p_task_id,'officer_id',assignment.officer_id,
        'points',task_row.points));
  end if;
end;
$$;

create function private.complete_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare assignment public.task_assignments; actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into assignment from public.task_assignments where task_id=p_task_id for update;
  if not found then raise exception 'Task is not assigned'; end if;
  if assignment.officer_id<>actor_id then raise exception 'Only the assignee can complete this task'; end if;
  if assignment.completed_at is not null then raise exception 'Task already completed'; end if;
  update public.task_assignments set completed_at=pg_catalog.clock_timestamp() where task_id=p_task_id;
  perform private.write_audit_log('task.completed','task',p_task_id::text,
    pg_catalog.jsonb_build_object('officer_id',actor_id));
  if not (select approval_required from public.tasks where id=p_task_id) then
    perform private.award_task(p_task_id);
  end if;
end;
$$;
create function public.complete_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.complete_task(p_task_id)
$$;

create function private.approve_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; assignment public.task_assignments;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then
    raise exception 'Task outside branch scope'; end if;
  select * into assignment from public.task_assignments where task_id=p_task_id for update;
  if assignment.completed_at is null or not task_row.approval_required or assignment.approved_at is not null then
    raise exception 'Task is not awaiting approval'; end if;
  if assignment.officer_id=actor_id then raise exception 'Assignee cannot approve own task'; end if;
  update public.task_assignments set approved_at=pg_catalog.clock_timestamp(),approved_by=actor_id
    where task_id=p_task_id;
  perform private.write_audit_log('task.approved','task',p_task_id::text,
    pg_catalog.jsonb_build_object('approved_by',actor_id,'officer_id',assignment.officer_id));
  perform private.award_task(p_task_id);
end;
$$;
create function public.approve_task(p_task_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.approve_task(p_task_id)
$$;
revoke all on function private.save_task(text,text,text,bigint,date,numeric,boolean),
  private.assign_task(bigint,bigint),private.complete_task(bigint),private.approve_task(bigint),
  private.award_task(bigint),public.save_task(text,text,text,bigint,date,numeric,boolean),
  public.assign_task(bigint,bigint),public.complete_task(bigint),public.approve_task(bigint)
  from public,anon,authenticated;
grant execute on function private.save_task(text,text,text,bigint,date,numeric,boolean),
  private.assign_task(bigint,bigint),private.complete_task(bigint),private.approve_task(bigint),
  public.save_task(text,text,text,bigint,date,numeric,boolean),
  public.assign_task(bigint,bigint),public.complete_task(bigint),public.approve_task(bigint)
  to authenticated;

-- The event type catalog is now fixed; its former admin mutation RPCs are closed.
revoke all on function public.create_event_type(text),public.rename_event_type(bigint,text),
  public.delete_event_type(bigint),private.create_event_type(text),
  private.rename_event_type(bigint,text),private.delete_event_type(bigint)
  from public,anon,authenticated;

-- Keep the earlier timed-only API used by database clients and integrity tests.
create function public.save_event(p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint default null)
returns bigint language sql security invoker set search_path = '' as $$
  select public.save_event_with_links(p_name,p_description,p_event_type_id,p_location,
    (p_starts_at at time zone 'America/Denver')::date,p_starts_at,p_ends_at,
    p_branch_ids,p_event_id,null,null)
$$;
revoke all on function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)
  from public,anon,authenticated;
grant execute on function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)
  to authenticated;

-- Include Task awards in the existing point history search surface.
drop view public.point_history;
create view public.point_history with (security_invoker=true) as
  select p.*,o.name as officer_name,e.name as event_name,
    creator.name as created_by_name,remover.name as removed_by_name,
    t.title as task_title,
    pg_catalog.concat_ws(' ',o.name,p.reason,e.name,t.title) as search_text
  from public.point_transactions p
  join public.officers o on o.id=p.officer_id
  left join public.events e on e.id=p.event_id
  left join public.tasks t on t.id=p.task_id
  left join public.officers creator on creator.auth_user_id=p.created_by
  left join public.officers remover on remover.auth_user_id=p.removed_by;
revoke all on table public.point_history from public,anon,authenticated;
grant select on table public.point_history to authenticated;
