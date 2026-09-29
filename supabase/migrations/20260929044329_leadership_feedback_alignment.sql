-- PR 10: leadership decisions. Keep historical rows and relationships intact.
alter table public.events
  add column event_date date,
  add column fixed_points numeric,
  add column untimed_processed_at timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id);
update public.events set event_date=(starts_at at time zone 'America/Denver')::date;
create function private.default_event_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.event_date is null and new.starts_at is not null then
    new.event_date := (new.starts_at at time zone 'America/Denver')::date;
  end if;
  return new;
end;
$$;
create trigger events_default_date before insert on public.events
  for each row execute function private.default_event_date();
revoke all on function private.default_event_date() from public,anon,authenticated;
alter table public.events alter column event_date set not null,
  alter column starts_at drop not null,
  alter column ends_at drop not null;
alter table public.events add constraint events_kind_check check (
  (starts_at is not null and ends_at is not null and fixed_points is null)
  or (starts_at is null and ends_at is null and fixed_points is not null
      and fixed_points <> 0 and fixed_points not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
);
alter table public.events add constraint events_date_check check (
  starts_at is null or (starts_at at time zone 'America/Denver')::date = event_date
);
-- Old rows may predate the new hours policy. Enforce it on every new/edited
-- timed event without making historical imports un-migratable.
alter table public.events add constraint events_local_hours_check check (
  starts_at is null or (
    (starts_at at time zone 'America/Denver')::time >= time '06:00'
    and (ends_at at time zone 'America/Denver')::time <= time '23:59'
  )
) not valid;
create index events_event_date_idx on public.events(event_date desc) where deleted_at is null;

-- Deactivation also removes future untimed work assignments.
create or replace function private.save_officer(
  p_name text, p_position_id bigint, p_status text, p_branch_ids bigint[],
  p_officer_id bigint, p_utep_email text, p_personal_email text, p_classification text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  saved_id bigint;
  old_officer public.officers;
  new_officer public.officers;
  old_branches bigint[] := '{}'::bigint[];
  new_branches bigint[];
  old_snapshot jsonb;
  new_snapshot jsonb;
  removed_signups integer := 0;
  audit_action text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_officer_id is null then
    insert into public.officers(name,utep_email,personal_email,position_id,classification)
    values(trim(p_name),nullif(lower(trim(p_utep_email)),''),
      nullif(lower(trim(p_personal_email)),''),p_position_id,nullif(trim(p_classification),''))
    returning id into saved_id;
  else
    perform pg_catalog.pg_advisory_xact_lock(3847821);
    select * into old_officer
      from public.officers where id=p_officer_id for update;
    if not found then raise exception 'Officer not found'; end if;
    select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
      into old_branches from public.officer_branches where officer_id=p_officer_id;
    old_snapshot := pg_catalog.jsonb_build_object(
      'name',old_officer.name,'position_id',old_officer.position_id,
      'status',old_officer.status,'utep_email',old_officer.utep_email,
      'personal_email',old_officer.personal_email,
      'classification',old_officer.classification,'branch_ids',old_branches);
    if old_officer.status='active' and p_status='inactive' and old_officer.application_role='admin' then
      if (select count(*) from public.officers
          where application_role='admin' and status='active') <= 1 then
        raise exception 'Last active admin cannot be deactivated';
      end if;
    end if;
    update public.officers set name=trim(p_name),
      utep_email=nullif(lower(trim(p_utep_email)),''),
      personal_email=nullif(lower(trim(p_personal_email)),''),
      position_id=p_position_id,classification=nullif(trim(p_classification),''),
      status=p_status where id=p_officer_id returning id into saved_id;
    if old_officer.status='active' and p_status='inactive' then
      delete from public.event_officers eo using public.events e
        where eo.event_id=e.id and eo.officer_id=saved_id and e.deleted_at is null
          and (e.starts_at>now() or (e.starts_at is null and e.event_date >=
            (now() at time zone 'America/Denver')::date));
      get diagnostics removed_signups = row_count;
    end if;
  end if;
  delete from public.officer_branches where officer_id=saved_id;
  insert into public.officer_branches(officer_id,branch_id)
    select saved_id, branch_id from unnest(coalesce(p_branch_ids,'{}'::bigint[])) branch_id;
  select * into new_officer from public.officers where id=saved_id;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into new_branches from public.officer_branches where officer_id=saved_id;
  new_snapshot := pg_catalog.jsonb_build_object(
    'name',new_officer.name,'position_id',new_officer.position_id,
    'status',new_officer.status,'utep_email',new_officer.utep_email,
    'personal_email',new_officer.personal_email,
    'classification',new_officer.classification,'branch_ids',new_branches);
  if p_officer_id is null then
    audit_action := 'officer.created';
  elsif old_officer.status='active' and new_officer.status='inactive' then
    audit_action := 'officer.deactivated';
  elsif old_officer.status='inactive' and new_officer.status='active' then
    audit_action := 'officer.reactivated';
  else
    audit_action := 'officer.updated';
  end if;
  if p_officer_id is null or old_snapshot is distinct from new_snapshot then
    perform private.write_audit_log(audit_action,'officer',saved_id::text,
      case when p_officer_id is null
        then pg_catalog.jsonb_build_object('after',new_snapshot)
        else pg_catalog.jsonb_build_object('before',old_snapshot,'after',new_snapshot,
          'future_signups_removed',removed_signups) end);
  end if;
  return saved_id;
end;
$$;

create function private.save_event_v2(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_fixed_points numeric,
  p_branch_ids bigint[],p_event_id bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  saved_id bigint;
  old_event public.events;
  new_event public.events;
  branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
  old_branches bigint[];
  new_branches bigint[];
  before_details jsonb;
  after_details jsonb;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_event_date is null then raise exception 'Event date is required'; end if;
  if (p_starts_at is null) <> (p_ends_at is null) then
    raise exception 'Provide both start and end times'; end if;
  if p_starts_at is null then
    if p_fixed_points is null or p_fixed_points = 0 or
      p_fixed_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
      raise exception 'Untimed events require finite nonzero fixed points'; end if;
  else
    if p_fixed_points is not null then raise exception 'Timed events cannot have fixed points'; end if;
    if p_ends_at <= p_starts_at or
      (p_starts_at at time zone 'America/Denver')::date <> p_event_date or
      (p_ends_at at time zone 'America/Denver')::date <> p_event_date or
      (p_starts_at at time zone 'America/Denver')::time < time '06:00' or
      (p_ends_at at time zone 'America/Denver')::time > time '23:59' then
      raise exception 'Timed events need one Denver date, start at or after 06:00, end by 23:59, and end after start';
    end if;
  end if;
  if p_event_id is null then
    if not (private.current_is_admin() or
      (private.current_is_lead() and private.shares_current_branch(branches))) then
      raise exception 'Event outside branch scope'; end if;
    insert into public.events(name,description,event_type_id,location,event_date,starts_at,ends_at,fixed_points)
      values(trim(p_name),p_description,p_event_type_id,nullif(trim(p_location),''),
        p_event_date,p_starts_at,p_ends_at,p_fixed_points) returning id into saved_id;
  else
    select * into old_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_manage_event(p_event_id) or
      (not private.current_is_admin() and not private.shares_current_branch(branches)) then
      raise exception 'Event outside branch scope'; end if;
    if old_event.deleted_at is not null then raise exception 'Removed events cannot be edited'; end if;
    if old_event.status='cancelled' then raise exception 'Cancelled events cannot be edited'; end if;
    if (old_event.participation_points_per_hour_at_end is not null or
        old_event.untimed_processed_at is not null) and
       (old_event.starts_at is null) <> (p_starts_at is null) then
      raise exception 'Processed event kind cannot change'; end if;
    select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
      into old_branches from public.event_branches where event_id=p_event_id;
    before_details := pg_catalog.jsonb_build_object(
      'name',old_event.name,'description',old_event.description,
      'event_type_id',old_event.event_type_id,'location',old_event.location,
      'event_date',old_event.event_date,'starts_at',old_event.starts_at,
      'ends_at',old_event.ends_at,'fixed_points',old_event.fixed_points,
      'status',old_event.status,'branch_ids',old_branches,
      'rate_snapshot',old_event.participation_points_per_hour_at_end,
      'untimed_processed_at',old_event.untimed_processed_at);
    update public.events set name=trim(p_name),description=p_description,
      event_type_id=p_event_type_id,location=nullif(trim(p_location),''),
      event_date=p_event_date,starts_at=p_starts_at,ends_at=p_ends_at,
      fixed_points=p_fixed_points where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id)
    select saved_id,branch_id from unnest(branches) branch_id;
  select * into new_event from public.events where id=saved_id;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into new_branches from public.event_branches where event_id=saved_id;
  after_details := pg_catalog.jsonb_build_object(
    'name',new_event.name,'description',new_event.description,
    'event_type_id',new_event.event_type_id,'location',new_event.location,
    'event_date',new_event.event_date,'starts_at',new_event.starts_at,
    'ends_at',new_event.ends_at,'fixed_points',new_event.fixed_points,
    'status',new_event.status,'branch_ids',new_branches,
    'rate_snapshot',new_event.participation_points_per_hour_at_end,
    'untimed_processed_at',new_event.untimed_processed_at);
  if p_event_id is null then
    perform private.write_audit_log('event.created','event',saved_id::text,
      pg_catalog.jsonb_build_object('after',after_details));
  elsif before_details is distinct from after_details then
    perform private.write_audit_log('event.updated','event',saved_id::text,
      pg_catalog.jsonb_build_object('before',before_details,'after',after_details));
  end if;
  return saved_id;
end;
$$;
create function public.save_event_v2(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_fixed_points numeric,
  p_branch_ids bigint[],p_event_id bigint default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event_v2(p_name,p_description,p_event_type_id,p_location,
    p_event_date,p_starts_at,p_ends_at,p_fixed_points,p_branch_ids,p_event_id)
$$;
-- Preserve the existing timed RPC for migrations and existing clients.
create or replace function private.save_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint
) returns bigint language sql security definer set search_path = '' as $$
  select private.save_event_v2(p_name,p_description,p_event_type_id,p_location,
    (p_starts_at at time zone 'America/Denver')::date,p_starts_at,p_ends_at,null,
    p_branch_ids,p_event_id)
$$;

create function private.remove_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare old_event public.events; branch_ids bigint[];
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into old_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if old_event.deleted_at is not null then return false; end if;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into branch_ids from public.event_branches where event_id=p_event_id;
  update public.events set deleted_at=pg_catalog.clock_timestamp(),deleted_by=auth.uid()
    where id=p_event_id;
  perform private.write_audit_log('event.removed','event',p_event_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(old_event),
      'branch_ids',branch_ids,'signup_count',
      (select count(*) from public.event_officers where event_id=p_event_id),
      'point_count',(select count(*) from public.point_transactions where event_id=p_event_id),
      'removed_by',auth.uid()));
  return true;
end;
$$;
create function public.remove_event(p_event_id bigint) returns boolean
language sql security invoker set search_path = '' as $$
  select private.remove_event(p_event_id)
$$;

create or replace function private.cancel_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare current_event public.events;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' or
    current_event.participation_points_per_hour_at_end is not null or
    current_event.untimed_processed_at is not null or
    (current_event.ends_at is not null and current_event.ends_at<=now()) or
    (current_event.ends_at is null and current_event.event_date <
       (now() at time zone 'America/Denver')::date) then
    raise exception 'This event cannot be cancelled'; end if;
  update public.events set status='cancelled' where id=p_event_id;
  perform private.write_audit_log('event.cancelled','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',current_event.name,
      'previous_status',current_event.status,'new_status','cancelled',
      'event_date',current_event.event_date,'starts_at',current_event.starts_at,
      'ends_at',current_event.ends_at));
end;
$$;

create or replace function private.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_event public.events;
  actor_id bigint := private.current_active_officer_id();
  changed_rows integer;
  audit_action text;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' or
    current_event.participation_points_per_hour_at_end is not null or
    current_event.untimed_processed_at is not null or
    (current_event.ends_at is not null and current_event.ends_at<=now()) or
    (current_event.ends_at is null and current_event.event_date <
      (now() at time zone 'America/Denver')::date) then
    raise exception 'Signups are closed for this event'; end if;
  if current_event.starts_at is null and p_officer_id = actor_id and
    not private.can_manage_event(p_event_id) then
    raise exception 'Untimed assignments require an event manager'; end if;
  if p_officer_id is distinct from actor_id and not private.can_manage_event(p_event_id) then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if not exists (select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active'; end if;
  if p_remove then
    delete from public.event_officers where event_id=p_event_id and officer_id=p_officer_id;
  else
    insert into public.event_officers(event_id,officer_id)
      values(p_event_id,p_officer_id) on conflict do nothing;
  end if;
  get diagnostics changed_rows = row_count;
  if changed_rows > 0 then
    audit_action := case
      when p_remove and p_officer_id=actor_id then 'event.signout'
      when p_remove then 'event.officer_removed'
      when p_officer_id=actor_id then 'event.signup'
      else 'event.officer_assigned' end;
    perform private.write_audit_log(audit_action,'event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_name',current_event.name,
        'target_officer_id',p_officer_id,'actor_officer_id',actor_id));
  end if;
end;
$$;

create or replace function private.add_manual_transaction(
  p_officer_id bigint,p_event_id bigint,p_points numeric,p_reason text,p_award_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare saved_transaction_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_award_type not in ('manual','correction') or p_award_type is null then
    raise exception 'Invalid award type'; end if;
  if p_points is null or p_points=0 or
    p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Invalid point value'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Reason required'; end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id=p_event_id and deleted_at is null
  ) then raise exception 'Event unavailable'; end if;
  insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
    values(p_officer_id,p_event_id,p_points,trim(p_reason),p_award_type,auth.uid())
    returning id into saved_transaction_id;
  perform private.write_audit_log(
    case when p_award_type='correction' then 'points.correction_created'
      else 'points.manual_created' end,
    'point_transaction',saved_transaction_id::text,
    pg_catalog.jsonb_build_object('officer_id',p_officer_id,'event_id',p_event_id,
      'points',p_points,'award_type',p_award_type,'reason',trim(p_reason)));
end;
$$;

alter table public.point_transactions
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users(id);

create function private.update_point_transaction(p_transaction_id bigint,p_points numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare old_row public.point_transactions; new_row public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_points is null or p_points=0 or
    p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Invalid point value'; end if;
  select * into old_row from public.point_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if old_row.removed_at is not null then raise exception 'Removed transaction cannot be edited'; end if;
  if old_row.points is distinct from p_points then
    update public.point_transactions set points=p_points,
      updated_at=pg_catalog.clock_timestamp(),updated_by=auth.uid()
      where id=p_transaction_id
      returning * into new_row;
    perform private.write_audit_log('points.transaction_updated','point_transaction',
      p_transaction_id::text,pg_catalog.jsonb_build_object(
        'before',pg_catalog.to_jsonb(old_row),'after',pg_catalog.to_jsonb(new_row),
        'edited_by',auth.uid()));
  end if;
end;
$$;
create function public.update_point_transaction(p_transaction_id bigint,p_points numeric)
returns void language sql security invoker set search_path = '' as $$
  select private.update_point_transaction(p_transaction_id,p_points)
$$;

create function private.remove_point_transaction(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_row public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.point_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if old_row.removed_at is not null then return false; end if;
  update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
    removed_by=auth.uid() where id=p_transaction_id;
  perform private.write_audit_log('points.transaction_removed','point_transaction',
    p_transaction_id::text,pg_catalog.jsonb_build_object(
      'before',pg_catalog.to_jsonb(old_row),'removed_by',auth.uid()));
  return true;
end;
$$;
create function public.remove_point_transaction(p_transaction_id bigint)
returns boolean language sql security invoker set search_path = '' as $$
  select private.remove_point_transaction(p_transaction_id)
$$;
-- Preserve the old participation-only RPC and its audit contract.
create or replace function private.remove_participation_award(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare award public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into award from public.point_transactions
    where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if award.award_type <> 'participation' then
    raise exception 'Only participation awards can be removed';
  end if;
  if award.removed_at is not null then return false; end if;
  update public.point_transactions
    set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid()
    where id=p_transaction_id;
  perform private.write_audit_log('points.participation_removed',
    'point_transaction',p_transaction_id::text,pg_catalog.jsonb_build_object(
      'transaction_id',award.id,'officer_id',award.officer_id,
      'event_id',award.event_id,'points',award.points,'reason',award.reason,
      'created_at',award.created_at,'created_by',award.created_by,
      'removed_by',auth.uid()));
  return true;
end;
$$;


create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  finished_event public.events%rowtype;
  signup record;
  current_rate numeric;
  award_points numeric;
  scheduled_hours numeric;
  award_id bigint;
  award_count integer;
  event_count integer := 0;
begin
  for finished_event in
    select * from public.events
    where status <> 'cancelled' and deleted_at is null and (
      (starts_at is not null and ends_at <= pg_catalog.now()
        and participation_points_per_hour_at_end is null)
      or (starts_at is null and event_date <
        (pg_catalog.now() at time zone 'America/Denver')::date
        and untimed_processed_at is null))
    order by id for update skip locked
  loop
    current_rate := null;
    scheduled_hours := null;
    if finished_event.starts_at is not null then
      select participation_points_per_hour into current_rate
        from public.application_config where id = 1 for share;
      if not found then raise exception 'Participation configuration not found'; end if;
      scheduled_hours := extract(epoch from
        (finished_event.ends_at - finished_event.starts_at))::numeric / 3600;
      award_points := scheduled_hours * current_rate;
      update public.events set participation_points_per_hour_at_end = current_rate
        where id = finished_event.id;
    else
      award_points := finished_event.fixed_points;
      update public.events set untimed_processed_at=pg_catalog.clock_timestamp()
        where id = finished_event.id;
    end if;
    award_count := 0;
    for signup in select officer_id from public.event_officers
      where event_id = finished_event.id order by officer_id
    loop
      award_id := null;
      insert into public.point_transactions
        (officer_id,event_id,points,reason,award_type,created_by)
      values (signup.officer_id,finished_event.id,award_points,
        case when finished_event.starts_at is null then 'Untimed event work'
          else 'Event participation' end,'participation',null)
      on conflict (officer_id,event_id) where award_type = 'participation'
        do nothing returning id into award_id;
      if award_id is not null then
        award_count := award_count + 1;
        perform private.write_audit_log('points.participation_created',
          'point_transaction',award_id::text,pg_catalog.jsonb_build_object(
            'transaction_id',award_id,'event_id',finished_event.id,
            'officer_id',signup.officer_id,'scheduled_hours',scheduled_hours,
            'rate',current_rate,'points',award_points,
            'event_kind',case when finished_event.starts_at is null then 'untimed' else 'timed' end));
      end if;
    end loop;
    perform private.write_audit_log('event.participation_processed',
      'event',finished_event.id::text,pg_catalog.jsonb_build_object(
        'rate',current_rate,'scheduled_hours',scheduled_hours,
        'awards_created',award_count,
        'event_kind',case when finished_event.starts_at is null then 'untimed' else 'timed' end));
    event_count := event_count + 1;
  end loop;
  return event_count;
end;
$$;

create or replace view public.dashboard_summary with (security_invoker=true) as
  with period as (select * from private.half_year_bounds(pg_catalog.now()))
  select (select count(*) from public.officers where status='active') as active_officer_count,
    (select count(*) from public.events where status<>'cancelled' and deleted_at is null
      and ((starts_at is not null and starts_at>pg_catalog.now()) or
        (starts_at is null and event_date >= (pg_catalog.now() at time zone 'America/Denver')::date)))
      as upcoming_event_count,
    (select coalesce(pg_catalog.sum(points),0)
      from public.point_transactions,period
      where removed_at is null and created_at>=period.starts_at
        and created_at<period.ends_at) as half_year_points
  where (select private.current_active_officer_id()) is not null;

revoke all on function private.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint),
  public.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint),
  private.remove_event(bigint),public.remove_event(bigint),
  private.update_point_transaction(bigint,numeric),public.update_point_transaction(bigint,numeric),
  private.remove_point_transaction(bigint),public.remove_point_transaction(bigint)
  from public,anon,authenticated;
grant execute on function private.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint),
  public.save_event_v2(text,text,bigint,text,date,timestamptz,timestamptz,numeric,bigint[],bigint),
  private.remove_event(bigint),public.remove_event(bigint),
  private.update_point_transaction(bigint,numeric),public.update_point_transaction(bigint,numeric),
  private.remove_point_transaction(bigint),public.remove_point_transaction(bigint)
  to authenticated;
