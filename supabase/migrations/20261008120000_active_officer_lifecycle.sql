-- Keep an Officer's history and memberships intact when their active status
-- changes. New Event signups and Task assignments already require active
-- Officers in their trusted mutation functions.
create or replace function private.save_officer(
  p_name text, p_position_id bigint, p_status text, p_branch_ids bigint[],
  p_officer_id bigint, p_utep_email text, p_personal_email text, p_classification text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  saved_id bigint;
  old_officer public.officers;
  new_officer public.officers;
  old_branches bigint[] := '{}'::bigint[];
  requested_branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
  new_branches bigint[];
  old_snapshot jsonb;
  new_snapshot jsonb;
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
    select * into old_officer from public.officers where id=p_officer_id for update;
    if not found then raise exception 'Officer not found'; end if;
    select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
      into old_branches from public.officer_branches where officer_id=p_officer_id;
    old_snapshot := pg_catalog.jsonb_build_object(
      'name',old_officer.name,'position_id',old_officer.position_id,
      'status',old_officer.status,'application_role',old_officer.application_role,
      'utep_email',old_officer.utep_email,'personal_email',old_officer.personal_email,
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
    if old_branches is distinct from requested_branches then
      delete from public.officer_branches where officer_id=saved_id;
      insert into public.officer_branches(officer_id,branch_id)
        select saved_id,branch_id from unnest(requested_branches) branch_id;
    end if;
  end if;
  if p_officer_id is null then
    insert into public.officer_branches(officer_id,branch_id)
      select saved_id,branch_id from unnest(requested_branches) branch_id;
  end if;
  select * into new_officer from public.officers where id=saved_id;
  select coalesce(pg_catalog.array_agg(branch_id order by branch_id),'{}'::bigint[])
    into new_branches from public.officer_branches where officer_id=saved_id;
  new_snapshot := pg_catalog.jsonb_build_object(
    'name',new_officer.name,'position_id',new_officer.position_id,
    'status',new_officer.status,'application_role',new_officer.application_role,
    'utep_email',new_officer.utep_email,'personal_email',new_officer.personal_email,
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
        else pg_catalog.jsonb_build_object('before',old_snapshot,'after',new_snapshot) end);
  end if;
  return saved_id;
end;
$$;

create or replace function private.add_manual_transaction(
  p_officer_id bigint,p_event_id bigint,p_points numeric,p_reason text,p_award_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare saved_transaction_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if not exists (select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active';
  end if;
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
