-- Stable Position identity is independent of presentation labels. Custom
-- Positions keep a NULL code and therefore never inherit system privileges.
alter table public.positions add column code text;

alter table public.positions add constraint positions_code_format_check
  check (code is null or code ~ '^[a-z][a-z0-9_]*$');
alter table public.positions add constraint positions_code_key unique (code);

-- Match the six canonical rows by their established labels, not synthetic IDs.
do $$
begin
  if (select count(*) from public.positions where name in (
    'President', 'Vice President of Operations', 'Vice President of Academics',
    'Secretary', 'Lead', 'Officer'
  )) <> 6 then
    raise exception 'Expected all six canonical Positions before assigning machine identities';
  end if;
end;
$$;

update public.positions
set code = case name
  when 'President' then 'president'
  when 'Vice President of Operations' then 'vice_president_operations'
  when 'Vice President of Academics' then 'vice_president_academics'
  when 'Secretary' then 'secretary'
  when 'Lead' then 'lead'
  when 'Officer' then 'officer'
end
where name in (
  'President', 'Vice President of Operations', 'Vice President of Academics',
  'Secretary', 'Lead', 'Officer'
);

create or replace function private.current_is_lead() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.officers o
    join public.positions p on p.id = o.position_id
    where o.id = private.current_active_officer_id() and p.code = 'lead')
$$;
revoke all on function private.current_is_lead() from public, anon, authenticated;

create or replace function private.current_is_event_executive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.officers o join public.positions p on p.id=o.position_id
    where o.id=private.current_active_officer_id()
      and p.code in ('president','vice_president_operations','vice_president_academics'))
$$;
revoke all on function private.current_is_event_executive() from public, anon, authenticated;

-- Retain the existing argument name for CREATE OR REPLACE compatibility; the
-- caller now passes the machine code rather than the Position label.
create or replace function private.required_position(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name = any(array['president','vice_president_operations',
    'vice_president_academics','secretary','lead','officer']::text[])
$$;
revoke all on function private.required_position(text) from public, anon, authenticated;

create or replace function private.rename_position(p_id bigint,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text; old_code text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Position name is required'; end if;
  select name, code into old_name, old_code from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_code) then raise exception 'Required positions cannot be renamed'; end if;
  if old_name is distinct from p_name then
    update public.positions set name=p_name where id=p_id;
    perform private.write_audit_log('position.renamed','position',p_id::text,
      pg_catalog.jsonb_build_object('old_name',old_name,'new_name',p_name));
  end if;
end;
$$;

create or replace function private.delete_position(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text; old_code text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name, code into old_name, old_code from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_code) then raise exception 'Required positions cannot be deleted'; end if;
  if exists(select 1 from public.officers where position_id=p_id) then
    raise exception 'This position cannot be deleted because officers are using it';
  end if;
  begin
    delete from public.positions where id=p_id;
  exception when foreign_key_violation then
    raise exception 'This position cannot be deleted because officers are using it';
  end;
  perform private.write_audit_log('position.deleted','position',p_id::text,
    pg_catalog.jsonb_build_object('name',old_name));
end;
$$;

create or replace function private.create_warning(p_officer_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  leader record;
  saved_id bigint;
  target public.officers;
  approvers jsonb := '[]'::jsonb;
  approver_count integer := 0;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if nullif(pg_catalog.btrim(p_reason),'') is null then
    raise exception 'Warning reason is required';
  end if;
  select * into target from public.officers where id=p_officer_id for share;
  if not found then raise exception 'Officer not found'; end if;

  for leader in
    select o.id, o.name, o.status, o.auth_user_id, p.name as position_name, p.code as position_code
    from public.officers o
    join public.positions p on p.id=o.position_id
    where o.id<>p_officer_id
      and p.code in ('president','vice_president_operations','vice_president_academics')
    order by o.id for share of o
  loop
    if leader.status<>'active' or leader.auth_user_id is null then
      raise exception 'Required approvers must have active linked accounts';
    end if;
    if saved_id is null then
      insert into public.officer_warnings(officer_id,reason)
      values(p_officer_id,pg_catalog.btrim(p_reason)) returning id into saved_id;
    end if;
    insert into public.warning_approvals(warning_id,approver_id,approver_role)
    values(saved_id,leader.auth_user_id,
      case when leader.position_code='president' then 'President'
        else 'Vice President' end);
    approvers := approvers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('approver_id',leader.auth_user_id,
        'officer_id',leader.id,'officer_name',leader.name,
        'position',leader.position_name));
    approver_count := approver_count+1;
  end loop;
  if approver_count=0 then raise exception 'No eligible approvers remain'; end if;
  perform private.write_audit_log('warning.created','warning',saved_id::text,
    pg_catalog.jsonb_build_object('warning_id',saved_id,'officer_id',p_officer_id,
      'officer_name',target.name,'reason',pg_catalog.btrim(p_reason),
      'status','pending','approvers',approvers));
  return saved_id;
end;
$$;
