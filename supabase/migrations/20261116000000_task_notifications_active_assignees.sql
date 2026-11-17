-- Issue #444: a removed Task assignment keeps its row (removed_at) for
-- history, so it must no longer make that Officer a direct recipient.
-- Explicit audience targets are unchanged: a removed assignee who matches the
-- creator's chosen audience still receives update notices, but reminders go
-- only to current, incomplete assignees. Inbox history is not modified.

create or replace function private.notify_task_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target record; task_key text;
begin
  if tg_op<>'UPDATE' then return new; end if;
  if old.title is not distinct from new.title and old.description is not distinct from new.description
    and old.branch_id is not distinct from new.branch_id and old.due_date is not distinct from new.due_date
    and old.due_time is not distinct from new.due_time and old.points is not distinct from new.points then return new; end if;
  task_key:='task.changed:'||new.id||':'||pg_catalog.clock_timestamp()::text;
  for target in select distinct o.id from public.officers o where o.status='active' and (
    exists(select 1 from public.task_officer_assignments a where a.task_id=new.id and a.officer_id=o.id
      and a.removed_at is null) or
    exists(select 1 from public.task_notification_targets a where a.task_id=new.id and a.all_active) or
    exists(select 1 from public.task_notification_targets a join public.officer_branches ob on ob.branch_id=a.branch_id where a.task_id=new.id and ob.officer_id=o.id) or
    exists(select 1 from public.task_notification_targets a where a.task_id=new.id and a.position_id=o.position_id))
  loop
    perform private.create_notification(target.id,'task.changed','Task updated: '||new.title,
      'The Task details or due date changed.','task',new.id,'/tasks/'||new.id,'important',task_key||':'||target.id);
  end loop;
  return new;
end;
$$;
revoke all on function private.notify_task_changes() from public,anon,authenticated;

create or replace function private.process_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare row record; recipient record; processed integer:=0; fires_at timestamptz; dedupe text;
begin
  for row in select e.id,e.name,e.event_date,e.starts_at,r.minutes_before
    from public.events e join public.event_reminder_offsets r on r.event_id=e.id
    where e.deleted_at is null and e.status<>'cancelled' and e.starts_at>pg_catalog.now()
      and e.starts_at-r.minutes_before*interval '1 minute'<=pg_catalog.now()
      and e.starts_at-r.minutes_before*interval '1 minute'>pg_catalog.now()-interval '30 days'
  loop
    fires_at:=row.starts_at-row.minutes_before*interval '1 minute';
    for recipient in select distinct eo.officer_id from public.event_officers eo
      where eo.event_id=row.id and eo.removed_at is null
    loop
      dedupe:='event.reminder:'||row.id||':'||row.minutes_before||':'||recipient.officer_id||':'||fires_at::text;
      perform private.create_notification(recipient.officer_id,'event.reminder','Event reminder: '||row.name,
        row.event_date::text,'event',row.id,'/events/'||row.id,'important',dedupe);
      processed:=processed+1;
    end loop;
  end loop;
  for row in select t.id,t.title,t.due_date,t.due_time,r.minutes_before
    from public.tasks t join public.task_reminder_offsets r on r.task_id=t.id
    where t.removed_at is null
      and (case when t.due_time is null then ((t.due_date+time '12:00') at time zone 'America/Denver')
        else ((t.due_date+t.due_time) at time zone 'America/Denver') end)
        -r.minutes_before*interval '1 minute'<=pg_catalog.now()
      and (case when t.due_time is null then ((t.due_date+time '12:00') at time zone 'America/Denver')
        else ((t.due_date+t.due_time) at time zone 'America/Denver') end)
        -r.minutes_before*interval '1 minute'>pg_catalog.now()-interval '30 days'
      and (case when t.due_time is null then ((t.due_date+time '12:00') at time zone 'America/Denver')
        else ((t.due_date+t.due_time) at time zone 'America/Denver') end)>pg_catalog.now()
  loop
    fires_at:=(case when row.due_time is null then ((row.due_date+time '12:00') at time zone 'America/Denver')
      else ((row.due_date+row.due_time) at time zone 'America/Denver') end)-row.minutes_before*interval '1 minute';
    for recipient in select a.officer_id from public.task_officer_assignments a
      where a.task_id=row.id and a.completed_at is null and a.removed_at is null
    loop
      dedupe:='task.reminder:'||row.id||':'||row.minutes_before||':'||recipient.officer_id||':'||fires_at::text;
      perform private.create_notification(recipient.officer_id,'task.reminder','Task reminder: '||row.title,
        row.due_date::text,'task',row.id,'/tasks/'||row.id,'important',dedupe);
      processed:=processed+1;
    end loop;
  end loop;
  return processed;
end;
$$;
revoke all on function private.process_due_reminders() from public,anon,authenticated;
