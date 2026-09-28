-- The POC processor accepted a caller-supplied rate and is no longer used.
drop function public.process_completed_events(numeric);

-- Cron runs this as the database role that schedules the job (postgres in
-- migrations). SECURITY INVOKER and no client EXECUTE grant keep it internal.
-- Event row locks prevent overlapping runs from resnapshotting the same event;
-- the partial unique index also includes logically removed awards.
create function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  finished_event public.events%rowtype;
  signup record;
  current_rate numeric;
  scheduled_hours numeric;
  award_points numeric;
  award_id bigint;
  award_count integer;
  event_count integer := 0;
begin
  for finished_event in
    select * from public.events
    where status <> 'cancelled'
      and participation_points_per_hour_at_end is null
      and (ends_at <= pg_catalog.now() or status = 'past')
    order by id for update skip locked
  loop
    -- A concurrent admin rate change either commits before this read or waits
    -- until this event has its one permanent snapshot.
    select participation_points_per_hour into current_rate
      from public.application_config where id = 1 for share;
    if not found then raise exception 'Participation configuration not found'; end if;
    scheduled_hours := extract(epoch from
      (finished_event.ends_at - finished_event.starts_at))::numeric / 3600;
    award_points := scheduled_hours * current_rate;
    update public.events set participation_points_per_hour_at_end = current_rate
      where id = finished_event.id;

    award_count := 0;
    for signup in select officer_id from public.event_officers
      where event_id = finished_event.id order by officer_id
    loop
      award_id := null;
      insert into public.point_transactions
        (officer_id,event_id,points,reason,award_type,created_by)
      values (signup.officer_id,finished_event.id,award_points,
        'Event participation','participation',null)
      on conflict (officer_id,event_id) where award_type = 'participation'
        do nothing returning id into award_id;
      if award_id is not null then
        award_count := award_count + 1;
        perform private.write_audit_log('points.participation_created',
          'point_transaction',award_id::text,pg_catalog.jsonb_build_object(
            'transaction_id',award_id,'event_id',finished_event.id,
            'officer_id',signup.officer_id,'scheduled_hours',scheduled_hours,
            'rate',current_rate,'points',award_points));
      end if;
    end loop;
    -- Also records zero-signup processing, which has no award row to audit.
    perform private.write_audit_log('event.participation_processed',
      'event',finished_event.id::text,pg_catalog.jsonb_build_object(
        'rate',current_rate,'scheduled_hours',scheduled_hours,
        'awards_created',award_count));
    event_count := event_count + 1;
  end loop;
  return event_count;
end;
$$;

revoke all on function private.process_finished_events()
  from public,anon,authenticated;

-- Scheduling the same stable name updates the job instead of duplicating it.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('cappy-process-finished-events', '* * * * *',
  'select private.process_finished_events()');
