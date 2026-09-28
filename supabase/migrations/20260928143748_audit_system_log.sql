create index audit_logs_created_at_id_idx
  on public.audit_logs(created_at desc,id desc);

-- Trusted mutations call this helper within their own transaction. Ordinary
-- clients have no EXECUTE grant and no direct INSERT grant on audit_logs.
-- A future trusted system job may call it with no JWT, producing NULL actor_id.
create function private.write_audit_log(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),p_action,p_entity_type,p_entity_id,coalesce(p_details,'{}'::jsonb));
end;
$$;
revoke all on function private.write_audit_log(text,text,text,jsonb)
  from public,anon,authenticated;

-- Replace only the private trusted implementations; public RPC signatures stay stable.
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
        where eo.event_id=e.id and eo.officer_id=saved_id and e.starts_at>now();
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

create or replace function private.set_officer_application_role(p_officer_id bigint,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.officers;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_role not in ('admin','officer') or p_role is null then
    raise exception 'Invalid application role'; end if;
  perform pg_catalog.pg_advisory_xact_lock(3847821);
  select * into target from public.officers where id=p_officer_id for update;
  if not found then raise exception 'Officer not found'; end if;
  if target.application_role='admin' and p_role='officer' then
    if target.id=private.current_active_officer_id() then
      raise exception 'Admins cannot demote themselves'; end if;
    if (select count(*) from public.officers
        where application_role='admin' and status='active') <= 1 then
      raise exception 'Last active admin cannot be demoted'; end if;
  end if;
  if target.application_role is distinct from p_role then
    update public.officers set application_role=p_role where id=p_officer_id;
    perform private.write_audit_log('officer.role_changed','officer',p_officer_id::text,
      pg_catalog.jsonb_build_object('officer_name',target.name,
        'old_role',target.application_role,'new_role',p_role));
  end if;
end;
$$;

create or replace function private.save_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  saved_id bigint;
  current_event public.events;
  saved_event public.events;
  branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
  previous_branches bigint[];
  saved_branches bigint[];
  before_details jsonb;
  after_details jsonb;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_event_id is null then
    if not (private.current_is_admin() or
      (private.current_is_lead() and private.shares_current_branch(branches))) then
      raise exception 'Event outside branch scope'; end if;
    insert into public.events(name,description,event_type_id,location,starts_at,ends_at)
    values(trim(p_name),p_description,p_event_type_id,nullif(trim(p_location),''),p_starts_at,p_ends_at)
    returning id into saved_id;
  else
    select * into current_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
      into previous_branches from public.event_branches where event_id=p_event_id;
    before_details := pg_catalog.jsonb_build_object(
      'name',current_event.name,'description',current_event.description,
      'event_type_id',current_event.event_type_id,'location',current_event.location,
      'starts_at',current_event.starts_at,'ends_at',current_event.ends_at,
      'status',current_event.status,'branch_ids',previous_branches,
      'is_global',pg_catalog.cardinality(previous_branches)=0);
    -- Check the persisted branches before any replacement, so a Lead cannot
    -- acquire an unrelated or global event by adding their own branch.
    if not private.can_manage_event(p_event_id) then
      raise exception 'Event outside branch scope'; end if;
    if not private.current_is_admin() and
      not private.shares_current_branch(branches) then
      raise exception 'Event outside branch scope'; end if;
    if current_event.starts_at<=now() or current_event.status in ('cancelled','past') then
      raise exception 'Only upcoming events can be edited'; end if;
    update public.events set name=trim(p_name),description=p_description,
      event_type_id=p_event_type_id,location=nullif(trim(p_location),''),
      starts_at=p_starts_at,ends_at=p_ends_at where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id)
    select saved_id,branch_id from unnest(branches) branch_id;
  select * into saved_event from public.events where id=saved_id;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into saved_branches from public.event_branches where event_id=saved_id;
  after_details := pg_catalog.jsonb_build_object(
    'name',saved_event.name,'description',saved_event.description,
    'event_type_id',saved_event.event_type_id,'location',saved_event.location,
    'starts_at',saved_event.starts_at,'ends_at',saved_event.ends_at,
    'status',saved_event.status,'branch_ids',saved_branches,
    'is_global',pg_catalog.cardinality(saved_branches)=0);
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

create or replace function private.cancel_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare current_event public.events;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if current_event.ends_at<=now() or current_event.status in ('cancelled','past') then
    raise exception 'This event cannot be cancelled'; end if;
  update public.events set status='cancelled' where id=p_event_id;
  perform private.write_audit_log('event.cancelled','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',current_event.name,
      'previous_status',current_event.status,'new_status','cancelled',
      'starts_at',current_event.starts_at,'ends_at',current_event.ends_at));
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
  if current_event.ends_at<=now() or current_event.status in ('cancelled','past') then
    raise exception 'Signups are closed for this event'; end if;
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

create or replace function private.claim_current_officer_identity()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_uid uuid := auth.uid();
  verified_email text;
  linked_officer public.officers%rowtype;
  matching_ids bigint[];
begin
  if current_uid is null then
    return null;
  end if;

  -- Supabase owns these fields. A caller cannot supply an email or officer ID.
  select lower(trim(u.email)) into verified_email
  from auth.users u
  where u.id = current_uid
    and u.email_confirmed_at is not null
    and u.raw_app_meta_data ->> 'provider' = 'google';
  if verified_email is null or verified_email = '' then
    return null;
  end if;

  select * into linked_officer
  from public.officers o where o.auth_user_id = current_uid;
  if found then
    if linked_officer.status = 'active' then return linked_officer.id; end if;
    return null;
  end if;

  -- Lock the matching row until assignment. The unique auth_user_id constraint
  -- also prevents one account from owning two officer records.
  select array_agg(o.id) into matching_ids
  from public.officers o
  where lower(trim(o.utep_email)) = verified_email
     or lower(trim(o.personal_email)) = verified_email;
  if coalesce(array_length(matching_ids, 1), 0) <> 1 then return null; end if;

  select * into linked_officer
  from public.officers o where o.id = matching_ids[1] for update;
  if linked_officer.status <> 'active' or linked_officer.auth_user_id is not null
    or not (lower(trim(linked_officer.utep_email)) = verified_email
      or lower(trim(linked_officer.personal_email)) = verified_email) then
    return null;
  end if;

  update public.officers set auth_user_id = current_uid where id = linked_officer.id;
  perform private.write_audit_log('officer.auth_linked','officer',linked_officer.id::text,
    pg_catalog.jsonb_build_object('officer_name',linked_officer.name,
      'linked_auth_user_id',current_uid));
  return linked_officer.id;
exception
  when unique_violation then
    -- A concurrent claim of this officer or another link for this account wins.
    return null;
end;
$$;
