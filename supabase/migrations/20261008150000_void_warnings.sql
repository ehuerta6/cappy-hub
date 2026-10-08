alter table public.officer_warnings
  add column voided_at timestamptz,
  add column voided_by bigint references public.officers(id) on delete restrict,
  add constraint officer_warnings_void_at_actor_check
    check ((voided_at is null) = (voided_by is null));

create index officer_warnings_voided_at_idx
  on public.officer_warnings(voided_at) where voided_at is not null;

-- Warning rows and their approval snapshots are administrative history. Keep
-- direct deletion unavailable to application roles, including Admins.
revoke delete on table public.officer_warnings, public.warning_approvals
  from public, anon, authenticated;

create function private.void_warning(p_warning_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  warning public.officer_warnings;
  actor_id bigint := private.current_active_officer_id();
  void_time timestamptz := pg_catalog.clock_timestamp();
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if actor_id is null then raise exception 'Active Admin required'; end if;
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  if warning.voided_at is not null then raise exception 'Warning is already voided'; end if;

  update public.officer_warnings
    set voided_at=void_time, voided_by=actor_id
    where id=p_warning_id;
  perform private.write_audit_log('warning.voided','warning',p_warning_id::text,
    pg_catalog.jsonb_build_object('warning_id',p_warning_id,
      'officer_id',warning.officer_id,'previous_status',warning.status,
      'actor_officer_id',actor_id,'voided_at',void_time));
end;
$$;
revoke all on function private.void_warning(bigint) from public,anon,authenticated;
grant execute on function private.void_warning(bigint) to authenticated;
create function public.void_warning(p_warning_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.void_warning(p_warning_id)
$$;
revoke all on function public.void_warning(bigint) from public,anon,authenticated;
grant execute on function public.void_warning(bigint) to authenticated;

-- Keep the public RPC during rollout so already deployed clients receive a
-- clear denial instead of an RPC-not-found error. The compatibility path is
-- never allowed to delete source rows or approvals.
create or replace function private.delete_warning(p_warning_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  raise exception 'Warning deletion is disabled; void instead';
end;
$$;

create or replace function private.decide_warning(p_warning_id bigint,p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  warning public.officer_warnings;
  approval public.warning_approvals;
  actor_id bigint := private.current_active_officer_id();
  resulting_status text;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid warning decision';
  end if;
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  if warning.voided_at is not null then raise exception 'This warning is voided'; end if;
  if warning.status<>'pending' then raise exception 'This warning is already closed'; end if;
  select * into approval from public.warning_approvals
    where warning_id=p_warning_id and approver_officer_id=actor_id for update;
  if not found then raise exception 'You are not an approver for this warning'; end if;
  if approval.decision<>'pending' then
    raise exception 'This approval has already been decided'; end if;
  update public.warning_approvals set decision=p_decision,decided_at=now()
    where warning_id=p_warning_id and approver_officer_id=actor_id;
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
      'approver_officer_id',actor_id,'decision',p_decision,'status',resulting_status));
end;
$$;

create or replace function private.has_pending_warning_approval(p_warning_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_active_officer_id() is not null and exists(
    select 1 from public.warning_approvals a
    join public.officer_warnings w on w.id=a.warning_id
    where a.warning_id=p_warning_id
      and a.approver_officer_id=private.current_active_officer_id()
      and a.decision='pending' and w.status='pending' and w.voided_at is null)
$$;

drop policy "Admins, assigned officers, or pending approvers read warnings"
  on public.officer_warnings;
create policy "Admins or assigned officers read non-voided warnings"
  on public.officer_warnings for select to authenticated using (
    (select private.current_is_admin()) or
    (voided_at is null and status='approved'
      and officer_id=(select private.current_active_officer_id())) or
    (voided_at is null and status='pending' and private.has_pending_warning_approval(id)));
