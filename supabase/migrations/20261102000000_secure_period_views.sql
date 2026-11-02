drop policy "authenticated users can read academic periods" on public.academic_periods;
create policy "Approved officers read academic periods"
  on public.academic_periods for select to authenticated
  using ((select private.current_active_officer_id()) is not null);

create function public.assert_academic_period_context_writable(
  p_period_context text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  today date := (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date;
  selected_period_id bigint;
begin
  if p_period_context is null or pg_catalog.btrim(p_period_context) = '' then
    raise exception 'Period context required';
  end if;

  if p_period_context = 'current' then
    select p.id into selected_period_id
    from public.academic_periods p
    where today between p.starts_on and p.ends_on;
    if selected_period_id is null then return; end if;
  elsif p_period_context = 'none' then
    if exists (select 1 from public.academic_periods p
      where today between p.starts_on and p.ends_on) then
      raise exception 'All-dates mode is only available when no period is current';
    end if;
    return;
  elsif p_period_context ~ '^[1-9][0-9]{0,18}$' then
    begin
      selected_period_id := p_period_context::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'Academic period not found';
    end;
  else
    raise exception 'Invalid period context';
  end if;

  perform public.assert_academic_period_writable(selected_period_id);
end;
$$;
revoke all on function public.assert_academic_period_context_writable(text)
  from public, anon;
grant execute on function public.assert_academic_period_context_writable(text)
  to authenticated;

create function public.academic_period_point_summary(p_period_id bigint)
returns table(net_points numeric, ranking jsonb)
language sql stable security invoker set search_path = '' as $$
  with selected_period as (
    select starts_on, ends_on
    from public.academic_periods
    where id = p_period_id
  ), officer_totals as (
    select h.officer_id, h.officer_name, pg_catalog.sum(h.points) as points
    from public.point_history h
    cross join selected_period p
    where h.activity_date between p.starts_on and p.ends_on
      and h.removed_at is null
    group by h.officer_id, h.officer_name
  )
  select
    coalesce((select pg_catalog.sum(t.points) from officer_totals t), 0::numeric),
    coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'officer_id', t.officer_id,
        'officer_name', t.officer_name,
        'points', t.points
      ) order by t.points desc, t.officer_name
    ) from officer_totals t), '[]'::jsonb)
$$;
revoke all on function public.academic_period_point_summary(bigint)
  from public, anon;
grant execute on function public.academic_period_point_summary(bigint)
  to authenticated;
