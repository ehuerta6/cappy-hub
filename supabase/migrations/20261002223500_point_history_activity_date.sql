-- Point History presents the date of the underlying activity while retaining
-- point_transactions.created_at as the original transaction/audit timestamp.
create or replace view public.point_history with (security_invoker=true) as
  select p.*,o.name as officer_name,e.name as event_name,
    creator.name as created_by_name,remover.name as removed_by_name,
    t.title as task_title,
    pg_catalog.concat_ws(' ',o.name,p.reason,e.name,t.title) as search_text,
    e.event_date as event_date,
    case
      when e.id is not null then e.event_date
      else (p.created_at at time zone 'America/Denver')::date
    end as activity_date
  from public.point_transactions p
  join public.officers o on o.id=p.officer_id
  left join public.events e on e.id=p.event_id
  left join public.tasks t on t.id=p.task_id
  left join public.officers creator on creator.auth_user_id=p.created_by
  left join public.officers remover on remover.auth_user_id=p.removed_by;

revoke all on table public.point_history from public,anon,authenticated;
grant select on table public.point_history to authenticated;
