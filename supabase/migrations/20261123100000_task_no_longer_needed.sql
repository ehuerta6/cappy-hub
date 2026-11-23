-- Let Leads and Admins close overdue Tasks as no longer needed without
-- changing the completion state of any individual assignment.

alter table public.tasks
  add column no_longer_needed_at timestamptz,
  add column no_longer_needed_by bigint references public.officers(id) on delete restrict,
  add constraint tasks_no_longer_needed_actor_check
    check ((no_longer_needed_at is null) = (no_longer_needed_by is null));

create index tasks_current_no_longer_needed_idx
  on public.tasks(no_longer_needed_at) where removed_at is null;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'event.created','event.changed','event.cancelled','event.signup','event.left',
  'task.assigned','task.assignment_removed','task.changed','task.completed','task.completion_rejected',
  'task.completion_changed','task.need_status_changed','point.changed','warning.changed',
  'warning.threshold','event.reminder','task.reminder'
));

create function private.set_task_need_status(
  p_task_id bigint, p_no_longer_needed boolean, p_period_context text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  actor_id bigint := private.current_active_officer_id();
  before_status text;
  after_status text;
  notice_key text;
  recipient record;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if not (private.current_is_admin() or private.current_is_lead()) then
    raise exception 'Only Leads or Admins can change Task need status';
  end if;
  if p_no_longer_needed is null then raise exception 'Select a Task need status'; end if;

  select * into task_row from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task_row.removed_at is not null then raise exception 'Task has been removed'; end if;
  perform private.assert_task_period_writable(task_row.due_date,p_period_context);

  before_status:=case when task_row.no_longer_needed_at is null
    then 'Needed' else 'No longer needed' end;
  after_status:=case when p_no_longer_needed
    then 'No longer needed' else 'Needed' end;

  if (task_row.no_longer_needed_at is not null) = p_no_longer_needed then return; end if;
  if p_no_longer_needed and task_row.due_date >=
      (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date then
    raise exception 'Only overdue Tasks can be marked no longer needed';
  end if;

  update public.tasks set
    no_longer_needed_at=case when p_no_longer_needed then pg_catalog.clock_timestamp() else null end,
    no_longer_needed_by=case when p_no_longer_needed then actor_id else null end
  where id=p_task_id;

  perform private.write_audit_log(
    case when p_no_longer_needed then 'task.no_longer_needed' else 'task.needed_restored' end,
    'task',p_task_id::text,
    pg_catalog.jsonb_build_object('task_id',p_task_id,'task_title',task_row.title,
      'actor_id',actor_id,'before',pg_catalog.jsonb_build_object('need_status',before_status),
      'after',pg_catalog.jsonb_build_object('need_status',after_status))
  );

  notice_key:='task.need_status_changed:'||p_task_id||':'||pg_catalog.clock_timestamp()::text;
  for recipient in
    select distinct o.id from public.officers o
    join public.task_officer_assignments a on a.officer_id=o.id
    where a.task_id=p_task_id and a.removed_at is null and o.status='active'
  loop
    perform private.create_notification(
      recipient.id,'task.need_status_changed',
      case when p_no_longer_needed then 'Task no longer needed: '||task_row.title
        else 'Task needed again: '||task_row.title end,
      case when p_no_longer_needed then 'A Lead or Admin closed this Task because the work is no longer needed.'
        else 'A Lead or Admin restored this Task to Needed.' end,
      'task',p_task_id,'/tasks/'||p_task_id,'important',notice_key||':'||recipient.id
    );
  end loop;
end;
$$;

create function public.set_task_need_status(
  p_task_id bigint, p_no_longer_needed boolean, p_period_context text
) returns void language sql security definer set search_path = '' as $$
  select private.set_task_need_status(p_task_id,p_no_longer_needed,p_period_context)
$$;

revoke all on function private.set_task_need_status(bigint,boolean,text),
  public.set_task_need_status(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.set_task_need_status(bigint,boolean,text)
  to authenticated;

-- A closed Task is no longer active work, so do not surface it as an action
-- item or send a scheduled due reminder. Its record and assignment history stay.
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
    where t.removed_at is null and t.no_longer_needed_at is null
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
