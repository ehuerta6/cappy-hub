-- New Warnings are effective Admin records. Existing statuses, approval
-- snapshots, decisions and Void history are deliberately left unchanged.
create or replace function private.create_warning(p_officer_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  saved_id bigint;
  target public.officers;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then
    raise exception 'Warning reason is required';
  end if;
  select * into target from public.officers where id=p_officer_id for share;
  if not found then raise exception 'Officer not found'; end if;

  insert into public.officer_warnings(officer_id,reason,status)
  values(p_officer_id,pg_catalog.btrim(p_reason),'approved') returning id into saved_id;
  perform private.write_audit_log('warning.created','warning',saved_id::text,
    pg_catalog.jsonb_build_object('warning_id',saved_id,'officer_id',p_officer_id,
      'officer_name',target.name,'reason',pg_catalog.btrim(p_reason),
      'status','approved','management','direct_admin'));
  return saved_id;
end;
$$;

-- Only the information being corrected changes. In particular, editing a
-- historical pending/rejected/voided record cannot make it effective.
create function private.update_warning(p_warning_id bigint,p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  warning public.officer_warnings;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then
    raise exception 'Warning reason is required';
  end if;
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  if warning.reason is distinct from pg_catalog.btrim(p_reason) then
    update public.officer_warnings set reason=pg_catalog.btrim(p_reason)
      where id=p_warning_id;
    perform private.write_audit_log('warning.updated','warning',p_warning_id::text,
      pg_catalog.jsonb_build_object('warning_id',p_warning_id,
        'officer_id',warning.officer_id,
        'before',pg_catalog.jsonb_build_object('reason',warning.reason),
        'after',pg_catalog.jsonb_build_object('reason',pg_catalog.btrim(p_reason))));
  end if;
  return warning.officer_id;
end;
$$;
revoke all on function private.update_warning(bigint,text) from public,anon,authenticated;
grant execute on function private.update_warning(bigint,text) to authenticated;
create function public.update_warning(p_warning_id bigint,p_reason text)
returns bigint language sql security invoker set search_path = '' as $$
  select private.update_warning(p_warning_id,p_reason)
$$;
revoke all on function public.update_warning(bigint,text) from public,anon,authenticated;
grant execute on function public.update_warning(bigint,text) to authenticated;
