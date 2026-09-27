-- A normal view recalculates these values from current records; it stores no statistics.
create view public.dashboard_summary with(security_invoker=true) as
 with period as (
  select (date_trunc('year',now() at time zone 'UTC')+
   case when extract(month from now() at time zone 'UTC')>6 then interval '6 months' else interval '0 months' end) at time zone 'UTC' as starts_at
 )
 select (select count(*) from public.officers where status='active') as active_officer_count,
 (select count(*) from public.events where status<>'cancelled' and starts_at>now()) as upcoming_event_count,
 (select coalesce(sum(points),0) from public.point_transactions,period where created_at>=period.starts_at and created_at<period.starts_at+interval '6 months') as half_year_points;
revoke all on public.dashboard_summary,public.officer_point_totals from anon,authenticated;
grant select on public.dashboard_summary,public.officer_point_totals to anon;
-- The participation-only index does not cover manual transaction lookups or this foreign key.
create index point_transactions_officer_id_idx on public.point_transactions(officer_id);
