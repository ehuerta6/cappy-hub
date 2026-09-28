-- PR 4: the Data API can read only as a linked active officer. All client
-- writes go through the checked RPCs from PR 2/3; raw writes are denied even
-- to admins because those RPCs preserve multi-table and role invariants.

-- Remove the prototype's permissive policies, including anonymous reads.
do $$
declare old_policy record;
begin
  for old_policy in
    select tablename,policyname from pg_catalog.pg_policies
    where schemaname='public' and policyname like 'TEMPORARY DEVELOPMENT %'
  loop
    execute pg_catalog.format('drop policy %I on public.%I',
      old_policy.policyname,old_policy.tablename);
  end loop;
end;
$$;

-- The POC also granted writes to individual columns. Table-level REVOKE does
-- not remove column grants, so clear both forms before granting final reads.
revoke all on all tables in schema public from public,anon,authenticated;
do $$
declare old_column record;
begin
  for old_column in
    select c.relname,a.attname from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and a.attnum>0 and not a.attisdropped and a.attacl is not null
  loop
    execute pg_catalog.format('revoke all (%I) on table public.%I from anon, authenticated',
      old_column.attname,old_column.relname);
  end loop;
end;
$$;
revoke all on all sequences in schema public from public,anon,authenticated;

-- Supabase's older project defaults granted new objects to client roles.
-- Future objects created by the migration role (postgres) must opt in
-- deliberately alongside their RLS policies. Supabase-managed roles keep
-- their own defaults and require a separate grant review for new objects.
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated;

-- Public RPC inventory: claim, officer save, role assignment, event save,
-- cancellation, signup, and manual points are checked entry points. The old
-- page-load participation processor and trigger helper have no client grant.
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.claim_current_officer_identity() to authenticated;
grant execute on function public.save_officer(text,bigint,text,bigint[],bigint,text,text,text) to authenticated;
grant execute on function public.set_officer_application_role(bigint,text) to authenticated;
grant execute on function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint) to authenticated;
grant execute on function public.cancel_event(bigint) to authenticated;
grant execute on function public.change_event_signup(bigint,bigint,boolean) to authenticated;
grant execute on function public.add_manual_transaction(bigint,numeric,text,text,bigint) to authenticated;

-- Policies call these private SECURITY DEFINER lookups to avoid recursion on
-- officers. They use auth.uid(), return only the caller's own scope, and have
-- search_path='' from PR 3. The private schema is not exposed by PostgREST.
grant execute on function private.current_active_officer_id() to authenticated;
grant execute on function private.current_is_admin() to authenticated;

-- Relational application reads. The helper returns NULL for unlinked or
-- inactive identities, including users holding an otherwise valid JWT.
grant select on table public.officers,public.positions,public.branches,
  public.officer_branches,public.events,public.event_types,public.event_branches,
  public.event_officers,public.point_transactions,public.application_config
  to authenticated;
create policy "Approved officers read officers" on public.officers
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read positions" on public.positions
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read branches" on public.branches
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read memberships" on public.officer_branches
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read events" on public.events
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read event types" on public.event_types
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read event branches" on public.event_branches
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read signups" on public.event_officers
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read points" on public.point_transactions
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy "Approved officers read configuration" on public.application_config
  for select to authenticated using ((select private.current_active_officer_id()) is not null);

-- Warning privacy is separate from the peer-readable officer directory.
-- The approval workflow is not built yet, so only admins may read its rows.
grant select on table public.officer_warnings,public.warning_approvals,
  public.audit_logs to authenticated;
create policy "Admins or assigned officers read approved warnings" on public.officer_warnings
  for select to authenticated using (
    (select private.current_is_admin()) or
    (status='approved' and officer_id=(select private.current_active_officer_id()))
  );
create policy "Admins read warning approvals" on public.warning_approvals
  for select to authenticated using ((select private.current_is_admin()));
create policy "Admins read audit logs" on public.audit_logs
  for select to authenticated using ((select private.current_is_admin()));

-- Both views must run as their caller. The aggregate dashboard view needs an
-- explicit guard: without it, an unapproved user could still see a zero row.
create or replace view public.officer_point_totals with (security_invoker=true) as
  select o.id,o.name,coalesce(sum(p.points),0) as total_points
  from public.officers o left join public.point_transactions p
    on p.officer_id=o.id and p.removed_at is null group by o.id,o.name;
create or replace view public.dashboard_summary with (security_invoker=true) as
  with period as (
    select (date_trunc('year',now() at time zone 'UTC') +
      case when extract(month from now() at time zone 'UTC')>6
        then interval '6 months' else interval '0 months' end)
      at time zone 'UTC' as starts_at
  )
  select (select count(*) from public.officers where status='active') as active_officer_count,
    (select count(*) from public.events where status<>'cancelled' and starts_at>now()) as upcoming_event_count,
    (select coalesce(sum(points),0) from public.point_transactions,period
      where removed_at is null and created_at>=period.starts_at
        and created_at<period.starts_at+interval '6 months') as half_year_points
  where (select private.current_active_officer_id()) is not null;
grant select on table public.officer_point_totals,public.dashboard_summary to authenticated;
