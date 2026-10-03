create or replace function private.can_manage_branches(p_branches bigint[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_is_admin() or private.current_is_event_executive() or
    (private.current_is_lead() and cardinality(coalesce(p_branches,'{}'::bigint[]))>0
      and exists(select 1 from unnest(p_branches) b(id)
        join public.officer_branches ob
          on ob.officer_id=private.current_active_officer_id() and ob.branch_id=b.id))
$$;
revoke all on function private.can_manage_branches(bigint[]) from public,anon,authenticated;

create or replace function private.can_manage_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_branches(coalesce((select array_agg(branch_id) from public.event_branches
    where event_id=p_event_id),'{}'::bigint[])) and
    exists(select 1 from public.events where id=p_event_id)
$$;
revoke all on function private.can_manage_event(bigint) from public,anon,authenticated;

