-- Keep the Auth UUID columns as the compatibility and authentication-provenance
-- representation. Stable Officer IDs are added beside them so historical
-- attribution survives a later officers.auth_user_id relink.
alter table public.audit_logs
  add column actor_officer_id bigint references public.officers(id) on delete restrict;
alter table public.warning_approvals
  add column approver_officer_id bigint references public.officers(id) on delete restrict;
alter table public.events
  add column deleted_by_officer_id bigint references public.officers(id) on delete restrict;
alter table public.point_transactions
  add column created_by_officer_id bigint references public.officers(id) on delete restrict,
  add column updated_by_officer_id bigint references public.officers(id) on delete restrict,
  add column removed_by_officer_id bigint references public.officers(id) on delete restrict;

-- An old UUID is mapped only when it exactly equals one Officer's current
-- auth_user_id. No names, emails, JSON details, or other inferred links are used.
update public.audit_logs a set actor_officer_id=o.id
  from public.officers o where a.actor_officer_id is null and a.actor_id=o.auth_user_id;
update public.warning_approvals a set approver_officer_id=o.id
  from public.officers o where a.approver_officer_id is null and a.approver_id=o.auth_user_id;
update public.events e set deleted_by_officer_id=o.id
  from public.officers o where e.deleted_by_officer_id is null and e.deleted_by=o.auth_user_id;
update public.point_transactions p set created_by_officer_id=o.id
  from public.officers o where p.created_by_officer_id is null and p.created_by=o.auth_user_id;
update public.point_transactions p set updated_by_officer_id=o.id
  from public.officers o where p.updated_by_officer_id is null and p.updated_by=o.auth_user_id;
update public.point_transactions p set removed_by_officer_id=o.id
  from public.officers o where p.removed_by_officer_id is null and p.removed_by=o.auth_user_id;

create index audit_logs_actor_officer_id_idx on public.audit_logs(actor_officer_id);
create unique index warning_approvals_warning_officer_uidx
  on public.warning_approvals(warning_id,approver_officer_id)
  where approver_officer_id is not null;
create index events_deleted_by_officer_id_idx on public.events(deleted_by_officer_id);
create index point_transactions_created_by_officer_id_idx
  on public.point_transactions(created_by_officer_id);
create index point_transactions_updated_by_officer_id_idx
  on public.point_transactions(updated_by_officer_id);
create index point_transactions_removed_by_officer_id_idx
  on public.point_transactions(removed_by_officer_id);

-- The old deployed application continues to write UUID fields until it is
-- replaced. This trigger synchronizes those writes using only exact current
-- UUID-to-Officer links. Unmatched UUIDs intentionally stay NULL.
create function private.sync_stable_actor_ids() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'audit_logs' then
    if new.actor_officer_id is null and new.actor_id is not null then
      select o.id into new.actor_officer_id from public.officers o
        where o.auth_user_id = new.actor_id;
    end if;
  elsif tg_table_name = 'warning_approvals' then
    if new.approver_officer_id is null then
      select o.id into new.approver_officer_id from public.officers o
        where o.auth_user_id = new.approver_id;
    end if;
  elsif tg_table_name = 'events' then
    if new.deleted_by_officer_id is null and new.deleted_by is not null then
      select o.id into new.deleted_by_officer_id from public.officers o
        where o.auth_user_id = new.deleted_by;
    end if;
  elsif tg_table_name = 'point_transactions' then
    if new.created_by_officer_id is null and new.created_by is not null then
      select o.id into new.created_by_officer_id from public.officers o
        where o.auth_user_id = new.created_by;
    end if;
    if new.updated_by_officer_id is null and new.updated_by is not null then
      select o.id into new.updated_by_officer_id from public.officers o
        where o.auth_user_id = new.updated_by;
    end if;
    if new.removed_by_officer_id is null and new.removed_by is not null then
      select o.id into new.removed_by_officer_id from public.officers o
        where o.auth_user_id = new.removed_by;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_stable_actor_ids() from public,anon,authenticated;
create trigger audit_logs_sync_stable_actor_ids before insert or update on public.audit_logs
  for each row execute function private.sync_stable_actor_ids();
create trigger warning_approvals_sync_stable_actor_ids before insert or update on public.warning_approvals
  for each row execute function private.sync_stable_actor_ids();
create trigger events_sync_stable_actor_ids before insert or update on public.events
  for each row execute function private.sync_stable_actor_ids();
create trigger point_transactions_sync_stable_actor_ids before insert or update on public.point_transactions
  for each row execute function private.sync_stable_actor_ids();

-- Current sessions still resolve through auth.uid(); only the durable snapshot
-- lookup changes to the stable Officer ID.
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
      and a.decision='pending' and w.status='pending')
$$;

drop policy "Admins or pending approvers read warning approvals" on public.warning_approvals;
create policy "Admins or pending approvers read warning approvals"
  on public.warning_approvals for select to authenticated using (
    (select private.current_is_admin()) or
    (approver_officer_id=(select private.current_active_officer_id()) and
      private.has_pending_warning_approval(warning_id)));

-- Preserve the existing point-history columns for the deployed app, append
-- stable actor fields, and resolve names by Officer ID first.
create or replace view public.point_history with (security_invoker=true) as
  select p.id,p.officer_id,p.event_id,p.points,p.reason,p.award_type,
    p.created_by,p.created_at,p.removed_at,p.removed_by,p.updated_at,p.updated_by,p.task_id,
    o.name as officer_name,e.name as event_name,
    creator.name as created_by_name,remover.name as removed_by_name,
    t.title as task_title,
    pg_catalog.concat_ws(' ',o.name,p.reason,e.name,t.title) as search_text,
    e.event_date as event_date,
    case
      when e.id is not null then e.event_date
      else (p.created_at at time zone 'America/Denver')::date
    end as activity_date,
    p.created_by_officer_id,p.updated_by_officer_id,p.removed_by_officer_id,
    updater.name as updated_by_name
  from public.point_transactions p
  join public.officers o on o.id=p.officer_id
  left join public.events e on e.id=p.event_id
  left join public.tasks t on t.id=p.task_id
  left join public.officers creator on creator.id=p.created_by_officer_id
    or (p.created_by_officer_id is null and creator.auth_user_id=p.created_by)
  left join public.officers remover on remover.id=p.removed_by_officer_id
    or (p.removed_by_officer_id is null and remover.auth_user_id=p.removed_by)
  left join public.officers updater on updater.id=p.updated_by_officer_id
    or (p.updated_by_officer_id is null and updater.auth_user_id=p.updated_by);
revoke all on table public.point_history from public,anon,authenticated;
grant select on table public.point_history to authenticated;
