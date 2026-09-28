-- PR 7: current rate and logical participation-award removal are admin-only.
-- Raw writes to application_config and point_transactions remain closed.
create function private.set_participation_rate(p_rate numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare old_rate numeric;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_rate is null or p_rate <= 0 or
    p_rate in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Rate must be a finite positive number';
  end if;
  select participation_points_per_hour into old_rate
    from public.application_config where id=1 for update;
  if not found then raise exception 'Participation configuration not found'; end if;
  if old_rate is distinct from p_rate then
    update public.application_config
      set participation_points_per_hour=p_rate,
        updated_at=greatest(pg_catalog.clock_timestamp(),updated_at+interval '1 microsecond')
      where id=1;
    perform private.write_audit_log('config.participation_rate_changed',
      'application_config','1',pg_catalog.jsonb_build_object(
        'old_rate',old_rate,'new_rate',p_rate));
  end if;
end;
$$;

create function public.set_participation_rate(p_rate numeric) returns void
language sql security invoker set search_path = '' as $$
  select private.set_participation_rate(p_rate)
$$;

create function private.remove_participation_award(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare award public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into award from public.point_transactions
    where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if award.award_type <> 'participation' then
    raise exception 'Only participation awards can be removed';
  end if;
  if award.removed_at is not null then return false; end if;
  update public.point_transactions
    set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid()
    where id=p_transaction_id;
  perform private.write_audit_log('points.participation_removed',
    'point_transaction',p_transaction_id::text,pg_catalog.jsonb_build_object(
      'transaction_id',award.id,'officer_id',award.officer_id,
      'event_id',award.event_id,'points',award.points,'reason',award.reason,
      'created_at',award.created_at,'created_by',award.created_by,
      'removed_by',auth.uid()));
  return true;
end;
$$;

create function public.remove_participation_award(p_transaction_id bigint)
returns boolean language sql security invoker set search_path = '' as $$
  select private.remove_participation_award(p_transaction_id)
$$;

revoke all on function private.set_participation_rate(numeric),
  private.remove_participation_award(bigint),
  public.set_participation_rate(numeric),public.remove_participation_award(bigint)
  from public,anon,authenticated;
grant execute on function private.set_participation_rate(numeric),
  private.remove_participation_award(bigint) to authenticated;
grant execute on function public.set_participation_rate(numeric),
  public.remove_participation_award(bigint) to authenticated;

-- One read surface supports server-side search, filters, and pagination.
-- security_invoker makes underlying officers/events/points RLS apply.
create view public.point_history with (security_invoker=true) as
  select p.*,o.name as officer_name,e.name as event_name,
    creator.name as created_by_name,remover.name as removed_by_name,
    pg_catalog.concat_ws(' ',o.name,p.reason,e.name) as search_text
  from public.point_transactions p
  join public.officers o on o.id=p.officer_id
  left join public.events e on e.id=p.event_id
  left join public.officers creator on creator.auth_user_id=p.created_by
  left join public.officers remover on remover.auth_user_id=p.removed_by;
revoke all on table public.point_history from public,anon,authenticated;
grant select on table public.point_history to authenticated;

-- Calendar half-years are measured in El Paso local dates. Convert each
-- boundary separately so the interval includes the DST shift correctly.
create function private.half_year_bounds(p_at timestamptz)
returns table(starts_at timestamptz,ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with local_start as (
    select pg_catalog.date_trunc('year',p_at at time zone 'America/Denver')+
      case when extract(month from p_at at time zone 'America/Denver')>6
        then interval '6 months' else interval '0 months' end as value
  )
  select value at time zone 'America/Denver',
    (value+interval '6 months') at time zone 'America/Denver'
  from local_start
$$;
revoke all on function private.half_year_bounds(timestamptz)
  from public,anon,authenticated;
grant execute on function private.half_year_bounds(timestamptz)
  to authenticated;

create or replace view public.dashboard_summary with (security_invoker=true) as
  with period as (select * from private.half_year_bounds(pg_catalog.now()))
  select (select count(*) from public.officers where status='active') as active_officer_count,
    (select count(*) from public.events where status<>'cancelled' and starts_at>pg_catalog.now()) as upcoming_event_count,
    (select coalesce(pg_catalog.sum(points),0)
      from public.point_transactions,period
      where removed_at is null and created_at>=period.starts_at
        and created_at<period.ends_at) as half_year_points
  where (select private.current_active_officer_id()) is not null;
