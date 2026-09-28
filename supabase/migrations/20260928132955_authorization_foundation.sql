-- Trusted mutation operations derive the actor from Supabase Auth. Table RLS is
-- intentionally completed in PR 4; these functions do not make direct writes safe.
create function private.current_active_officer_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select id from public.officers
  where auth_user_id = (select auth.uid()) and status = 'active'
$$;
revoke all on function private.current_active_officer_id() from public, anon, authenticated;

create function private.current_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.officers
    where id = private.current_active_officer_id() and application_role = 'admin')
$$;
revoke all on function private.current_is_admin() from public, anon, authenticated;

create function private.current_is_lead() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.officers o
    join public.positions p on p.id = o.position_id
    where o.id = private.current_active_officer_id() and p.name = 'Lead')
$$;
revoke all on function private.current_is_lead() from public, anon, authenticated;

create function private.shares_current_branch(p_branch_ids bigint[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.officer_branches ob
    where ob.officer_id = private.current_active_officer_id()
      and ob.branch_id = any(coalesce(p_branch_ids, '{}'::bigint[])))
$$;
revoke all on function private.shares_current_branch(bigint[]) from public, anon, authenticated;

create function private.can_manage_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_is_admin() or
    (private.current_is_lead() and exists (
      select 1 from public.event_branches eb
      join public.officer_branches ob on ob.branch_id = eb.branch_id
      where eb.event_id = p_event_id
        and ob.officer_id = private.current_active_officer_id()))
$$;
revoke all on function private.can_manage_event(bigint) from public, anon, authenticated;

create function private.save_officer(
  p_name text, p_position_id bigint, p_status text, p_branch_ids bigint[],
  p_officer_id bigint, p_utep_email text, p_personal_email text, p_classification text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; old_status text; old_role text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_officer_id is null then
    insert into public.officers(name,utep_email,personal_email,position_id,classification)
    values(trim(p_name),nullif(lower(trim(p_utep_email)),''),
      nullif(lower(trim(p_personal_email)),''),p_position_id,nullif(trim(p_classification),''))
    returning id into saved_id;
  else
    perform pg_catalog.pg_advisory_xact_lock(3847821);
    select status,application_role into old_status,old_role
      from public.officers where id=p_officer_id for update;
    if not found then raise exception 'Officer not found'; end if;
    if old_status='active' and p_status='inactive' and old_role='admin' then
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
    if old_status='active' and p_status='inactive' then
      delete from public.event_officers eo using public.events e
        where eo.event_id=e.id and eo.officer_id=saved_id and e.starts_at>now();
    end if;
  end if;
  delete from public.officer_branches where officer_id=saved_id;
  insert into public.officer_branches(officer_id,branch_id)
    select saved_id, branch_id from unnest(coalesce(p_branch_ids,'{}'::bigint[])) branch_id;
  return saved_id;
end;
$$;
revoke all on function private.save_officer(text,bigint,text,bigint[],bigint,text,text,text) from public,anon,authenticated;
grant execute on function private.save_officer(text,bigint,text,bigint[],bigint,text,text,text) to authenticated;
create or replace function public.save_officer(
  p_name text, p_position_id bigint, p_status text, p_branch_ids bigint[],
  p_officer_id bigint default null, p_utep_email text default null,
  p_personal_email text default null, p_classification text default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_officer(p_name,p_position_id,p_status,p_branch_ids,
    p_officer_id,p_utep_email,p_personal_email,p_classification)
$$;
revoke all on function public.save_officer(text,bigint,text,bigint[],bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.save_officer(text,bigint,text,bigint[],bigint,text,text,text) to authenticated;

create function private.set_officer_application_role(p_officer_id bigint,p_role text)
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
  update public.officers set application_role=p_role where id=p_officer_id;
end;
$$;
revoke all on function private.set_officer_application_role(bigint,text) from public,anon,authenticated;
grant execute on function private.set_officer_application_role(bigint,text) to authenticated;
create function public.set_officer_application_role(p_officer_id bigint,p_role text)
returns void language sql security invoker set search_path = '' as $$
  select private.set_officer_application_role(p_officer_id,p_role)
$$;
revoke all on function public.set_officer_application_role(bigint,text) from public,anon,authenticated;
grant execute on function public.set_officer_application_role(bigint,text) to authenticated;

create function private.save_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; current_event public.events; branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
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
  return saved_id;
end;
$$;
revoke all on function private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint) from public,anon,authenticated;
grant execute on function private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint) to authenticated;
create or replace function public.save_event(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_event_id bigint default null
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event(p_name,p_description,p_event_type_id,p_location,
    p_starts_at,p_ends_at,p_branch_ids,p_event_id)
$$;
revoke all on function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint) from public,anon,authenticated;
grant execute on function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint) to authenticated;

create function private.cancel_event(p_event_id bigint) returns void
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
end;
$$;
revoke all on function private.cancel_event(bigint) from public,anon,authenticated;
grant execute on function private.cancel_event(bigint) to authenticated;
create function public.cancel_event(p_event_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.cancel_event(p_event_id)
$$;
revoke all on function public.cancel_event(bigint) from public,anon,authenticated;
grant execute on function public.cancel_event(bigint) to authenticated;

create function private.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare current_event public.events; actor_id bigint := private.current_active_officer_id();
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
end;
$$;
revoke all on function private.change_event_signup(bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function private.change_event_signup(bigint,bigint,boolean) to authenticated;
create or replace function public.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean default false)
returns void language sql security invoker set search_path = '' as $$
  select private.change_event_signup(p_event_id,p_officer_id,p_remove)
$$;
revoke all on function public.change_event_signup(bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.change_event_signup(bigint,bigint,boolean) to authenticated;

create function private.add_manual_transaction(
  p_officer_id bigint,p_event_id bigint,p_points numeric,p_reason text,p_award_type text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_award_type not in ('manual','correction') or p_award_type is null then
    raise exception 'Invalid award type'; end if;
  if p_points is null or p_points=0 or
    p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Invalid point value'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Reason required'; end if;
  insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
    values(p_officer_id,p_event_id,p_points,trim(p_reason),p_award_type,auth.uid());
end;
$$;
revoke all on function private.add_manual_transaction(bigint,bigint,numeric,text,text) from public,anon,authenticated;
grant execute on function private.add_manual_transaction(bigint,bigint,numeric,text,text) to authenticated;
create function public.add_manual_transaction(
  p_officer_id bigint,p_points numeric,p_reason text,p_award_type text,p_event_id bigint default null
) returns void language sql security invoker set search_path = '' as $$
  select private.add_manual_transaction(p_officer_id,p_event_id,p_points,p_reason,p_award_type)
$$;
revoke all on function public.add_manual_transaction(bigint,numeric,text,text,bigint) from public,anon,authenticated;
grant execute on function public.add_manual_transaction(bigint,numeric,text,text,bigint) to authenticated;

-- Remove the prototype page-load processor from any client role. A dedicated
-- trusted scheduler and its points workflow arrive in a later PR.
revoke execute on function public.process_completed_events(numeric) from public,anon,authenticated;
