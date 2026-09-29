-- The public functions are thin Data API entry points. All decisions and
-- writes happen in private functions with an empty search path.
create function private.create_warning(p_officer_id bigint, p_reason text)
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

  -- Lock the current roster while taking its snapshot. A later position or
  -- account-link change cannot alter rows already saved for this warning.
  for leader in
    select o.id, o.name, o.status, o.auth_user_id, p.name as position_name
    from public.officers o
    join public.positions p on p.id=o.position_id
    where o.id<>p_officer_id
      and p.name in ('President','Vice President of Operations',
        'Vice President of Academics')
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
      case when leader.position_name='President' then 'President'
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
revoke all on function private.create_warning(bigint,text) from public,anon,authenticated;
grant execute on function private.create_warning(bigint,text) to authenticated;
create function public.create_warning(p_officer_id bigint,p_reason text)
returns bigint language sql security invoker set search_path = '' as $$
  select private.create_warning(p_officer_id,p_reason)
$$;
revoke all on function public.create_warning(bigint,text) from public,anon,authenticated;
grant execute on function public.create_warning(bigint,text) to authenticated;

create function private.decide_warning(p_warning_id bigint,p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  warning public.officer_warnings;
  approval public.warning_approvals;
  resulting_status text;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid warning decision';
  end if;
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  if warning.status<>'pending' then raise exception 'This warning is already closed'; end if;
  select * into approval from public.warning_approvals
    where warning_id=p_warning_id and approver_id=auth.uid() for update;
  if not found then raise exception 'You are not an approver for this warning'; end if;
  if approval.decision<>'pending' then
    raise exception 'This approval has already been decided'; end if;
  update public.warning_approvals set decision=p_decision,decided_at=now()
    where warning_id=p_warning_id and approver_id=auth.uid();
  if exists(select 1 from public.warning_approvals
      where warning_id=p_warning_id and decision='rejected') then
    resulting_status := 'rejected';
  elsif not exists(select 1 from public.warning_approvals
      where warning_id=p_warning_id and decision<>'approved') then
    resulting_status := 'approved';
  else
    resulting_status := 'pending';
  end if;
  update public.officer_warnings set status=resulting_status where id=p_warning_id;
  perform private.write_audit_log(
    case when p_decision='approved' then 'warning.approved_by_approver'
      else 'warning.rejected_by_approver' end,
    'warning',p_warning_id::text,
    pg_catalog.jsonb_build_object('warning_id',p_warning_id,
      'officer_id',warning.officer_id,'approver_id',auth.uid(),
      'decision',p_decision,'status',resulting_status));
end;
$$;
revoke all on function private.decide_warning(bigint,text) from public,anon,authenticated;
grant execute on function private.decide_warning(bigint,text) to authenticated;
create function public.decide_warning(p_warning_id bigint,p_decision text)
returns void language sql security invoker set search_path = '' as $$
  select private.decide_warning(p_warning_id,p_decision)
$$;
revoke all on function public.decide_warning(bigint,text) from public,anon,authenticated;
grant execute on function public.decide_warning(bigint,text) to authenticated;

create function private.delete_warning(p_warning_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  warning public.officer_warnings;
  approvals jsonb;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'approver_id',a.approver_id,'approver_role',a.approver_role,
    'decision',a.decision,'decided_at',a.decided_at)
    order by a.approver_id),'[]'::jsonb) into approvals
    from public.warning_approvals a where a.warning_id=p_warning_id;
  delete from public.officer_warnings where id=p_warning_id;
  perform private.write_audit_log('warning.deleted','warning',p_warning_id::text,
    pg_catalog.jsonb_build_object('warning_id',p_warning_id,
      'officer_id',warning.officer_id,'reason',warning.reason,
      'status',warning.status,'created_at',warning.created_at,
      'approvers',approvals));
end;
$$;
revoke all on function private.delete_warning(bigint) from public,anon,authenticated;
grant execute on function private.delete_warning(bigint) to authenticated;
create function public.delete_warning(p_warning_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_warning(p_warning_id)
$$;
revoke all on function public.delete_warning(bigint) from public,anon,authenticated;
grant execute on function public.delete_warning(bigint) to authenticated;

-- A policy cannot directly read its own approval table without recursion.
-- This private predicate evaluates only the current user's pending assignment.
create function private.has_pending_warning_approval(p_warning_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_active_officer_id() is not null and exists(
    select 1 from public.warning_approvals a
    join public.officer_warnings w on w.id=a.warning_id
    where a.warning_id=p_warning_id and a.approver_id=auth.uid()
      and a.decision='pending' and w.status='pending')
$$;
revoke all on function private.has_pending_warning_approval(bigint) from public,anon,authenticated;
-- PostgreSQL evaluates policy expressions as the querying role. This helper
-- is executable there, but private is not an exposed Data API schema.
grant execute on function private.has_pending_warning_approval(bigint) to authenticated;

drop policy "Admins or assigned officers read approved warnings" on public.officer_warnings;
create policy "Admins, assigned officers, or pending approvers read warnings"
  on public.officer_warnings for select to authenticated using (
    (select private.current_is_admin()) or
    (status='approved' and officer_id=(select private.current_active_officer_id())) or
    (status='pending' and private.has_pending_warning_approval(id)));
drop policy "Admins read warning approvals" on public.warning_approvals;
create policy "Admins or pending approvers read warning approvals"
  on public.warning_approvals for select to authenticated using (
    (select private.current_is_admin()) or
    (approver_id=(select auth.uid()) and
      private.has_pending_warning_approval(warning_id)));
