-- Personal notification history, audience selection, and shared reminders.
-- All notification writes are trusted database operations; clients can only
-- read their own inbox and use narrow acknowledgement RPCs.

alter table public.tasks add column due_time time;

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_officer_id bigint not null references public.officers(id) on delete cascade,
  kind text not null check (kind in (
    'event.created','event.changed','event.cancelled','event.signup','event.left',
    'task.assigned','task.changed','task.completed','point.changed','warning.changed',
    'warning.threshold','event.reminder','task.reminder'
  )),
  title text not null check (length(pg_catalog.btrim(title)) > 0),
  message text not null default '',
  entity_type text not null check (entity_type in ('event','task','point','warning')),
  entity_id bigint,
  href text not null check (href like '/%'),
  priority text not null default 'important' check (priority in ('confirmation','important')),
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  reviewed_at timestamptz,
  dedupe_key text not null unique,
  check ((priority = 'confirmation') or entity_id is not null)
);

create index notifications_recipient_recent_idx
  on public.notifications(recipient_officer_id, created_at desc, id desc);
create index notifications_recipient_attention_idx
  on public.notifications(recipient_officer_id, priority, reviewed_at, created_at desc)
  where reviewed_at is null;

create table public.event_notification_targets (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  all_active boolean not null default false,
  branch_id bigint references public.branches(id) on delete restrict,
  position_id bigint references public.positions(id) on delete restrict,
  check ((all_active and branch_id is null and position_id is null) or
         (not all_active and ((branch_id is null) <> (position_id is null))))
);
create unique index event_notification_target_all_idx on public.event_notification_targets(event_id)
  where all_active;
create unique index event_notification_target_branch_idx on public.event_notification_targets(event_id,branch_id)
  where branch_id is not null;
create unique index event_notification_target_position_idx on public.event_notification_targets(event_id,position_id)
  where position_id is not null;

create table public.task_notification_targets (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.tasks(id) on delete cascade,
  all_active boolean not null default false,
  branch_id bigint references public.branches(id) on delete restrict,
  position_id bigint references public.positions(id) on delete restrict,
  check ((all_active and branch_id is null and position_id is null) or
         (not all_active and ((branch_id is null) <> (position_id is null))))
);
create unique index task_notification_target_all_idx on public.task_notification_targets(task_id)
  where all_active;
create unique index task_notification_target_branch_idx on public.task_notification_targets(task_id,branch_id)
  where branch_id is not null;
create unique index task_notification_target_position_idx on public.task_notification_targets(task_id,position_id)
  where position_id is not null;

create table public.event_reminder_offsets (
  event_id bigint not null references public.events(id) on delete cascade,
  minutes_before integer not null check (minutes_before between 1 and 43200),
  primary key (event_id,minutes_before)
);
create table public.task_reminder_offsets (
  task_id bigint not null references public.tasks(id) on delete cascade,
  minutes_before integer not null check (minutes_before between 1 and 43200),
  primary key (task_id,minutes_before)
);

create function private.default_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.current_setting('cappy.seed_loading',true)='on' then return new; end if;
  if tg_table_name='events' then
    insert into public.event_reminder_offsets(event_id,minutes_before)
    values(new.id,1440),(new.id,60) on conflict do nothing;
  else
    insert into public.task_reminder_offsets(task_id,minutes_before)
    values(new.id,1440) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.default_reminders() from public,anon,authenticated;
create trigger events_default_reminders after insert on public.events
  for each row execute function private.default_reminders();
create trigger tasks_default_reminders after insert on public.tasks
  for each row execute function private.default_reminders();

create function private.set_task_due_time(
  p_task_id bigint,p_due_time time,p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; target_task public.tasks; selected_ids bigint[];
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope not in ('occurrence','following','series') then raise exception 'Invalid recurrence scope'; end if;
  -- Recurrence edits lock the series before its occurrence rows. Discover the
  -- selected row without a lock, then follow that same order to avoid deadlocks.
  select * into task_row from public.tasks where id=p_task_id and removed_at is null;
  if not found then raise exception 'Task not found'; end if;
  if p_scope<>'occurrence' then
    perform 1 from public.task_series s where s.id=p_series_id and s.revision=p_series_revision for update;
    if not found or task_row.recurrence_series_id is distinct from p_series_id then raise exception 'Recurring Task changed; reload it'; end if;
    perform 1 from public.tasks t where t.recurrence_series_id=p_series_id
      and (p_scope='series' or t.recurrence_key>=task_row.recurrence_key)
      order by t.id for update;
    select * into task_row from public.tasks where id=p_task_id and removed_at is null;
    if not found or task_row.recurrence_series_id is distinct from p_series_id then
      raise exception 'Recurring Task changed; reload it'; end if;
  else
    select * into task_row from public.tasks where id=p_task_id and removed_at is null for update;
    if not found then raise exception 'Task not found'; end if;
  end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then raise exception 'Task outside branch scope'; end if;
  select coalesce(array_agg(t.id order by t.id),array[p_task_id]) into selected_ids
  from public.tasks t where t.id=p_task_id or
    (p_scope='series' and t.recurrence_series_id=p_series_id) or
    (p_scope='following' and t.recurrence_series_id=p_series_id and t.recurrence_key>=task_row.recurrence_key);
  for target_task in select * from public.tasks t where t.id=any(selected_ids) order by t.id loop
    if not private.can_manage_branches(array[target_task.branch_id]) then
      raise exception 'Task outside branch scope';
    end if;
  end loop;
  update public.tasks set due_time=p_due_time where id=any(selected_ids);
end;
$$;
create function public.set_task_due_time(
  p_task_id bigint,p_due_time time,p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
)
returns void language sql security definer set search_path = '' as $$ select private.set_task_due_time($1,$2,$3,$4,$5) $$;
revoke all on function private.set_task_due_time(bigint,time,text,bigint,integer),public.set_task_due_time(bigint,time,text,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.set_task_due_time(bigint,time,text,bigint,integer) to authenticated;

alter table public.notifications enable row level security;
alter table public.event_notification_targets enable row level security;
alter table public.task_notification_targets enable row level security;
alter table public.event_reminder_offsets enable row level security;
alter table public.task_reminder_offsets enable row level security;
revoke all on public.notifications,public.event_notification_targets,
  public.task_notification_targets,public.event_reminder_offsets,
  public.task_reminder_offsets from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant select on public.event_notification_targets,public.task_notification_targets,
  public.event_reminder_offsets,public.task_reminder_offsets to authenticated;
create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_officer_id=(select private.current_active_officer_id()));
create policy event_notification_targets_read_managed on public.event_notification_targets
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy task_notification_targets_read_active on public.task_notification_targets
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy event_reminder_offsets_read_active on public.event_reminder_offsets
  for select to authenticated using ((select private.current_active_officer_id()) is not null);
create policy task_reminder_offsets_read_active on public.task_reminder_offsets
  for select to authenticated using ((select private.current_active_officer_id()) is not null);

create function private.create_notification(
  p_recipient bigint,p_kind text,p_title text,p_message text,
  p_entity_type text,p_entity_id bigint,p_href text,p_priority text,p_dedupe text
) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(recipient_officer_id,kind,title,message,
    entity_type,entity_id,href,priority,dedupe_key)
  select p_recipient,p_kind,p_title,p_message,p_entity_type,p_entity_id,p_href,p_priority,p_dedupe
  where pg_catalog.current_setting('cappy.seed_loading',true) is distinct from 'on'
    and exists(select 1 from public.officers o where o.id=p_recipient and o.status='active')
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function private.create_notification(bigint,text,text,text,text,bigint,text,text,text)
  from public,anon,authenticated;

create function private.set_event_notification_settings(
  p_event_id bigint,p_all_active boolean,p_branch_ids bigint[],p_position_ids bigint[],
  p_reminder_offsets integer[],p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare actor bigint:=private.current_active_officer_id(); event_row public.events; target_event public.events; selected_ids bigint[];
begin
  if actor is null then raise exception 'Unauthorized'; end if;
  if p_scope not in ('occurrence','following','series') then raise exception 'Invalid recurrence scope'; end if;
  -- Keep the recurrence-series-first lock order used by occurrence mutations.
  select * into event_row from public.events where id=p_event_id and deleted_at is null;
  if not found then raise exception 'Event not found'; end if;
  if p_scope<>'occurrence' then
    perform 1 from public.event_series s where s.id=p_series_id and s.revision=p_series_revision for update;
    if not found or event_row.recurrence_series_id is distinct from p_series_id then raise exception 'Recurring Event changed; reload it'; end if;
    perform 1 from public.events e where e.recurrence_series_id=p_series_id
      and (p_scope='series' or e.recurrence_key>=event_row.recurrence_key)
      order by e.id for update;
    select * into event_row from public.events where id=p_event_id and deleted_at is null;
    if not found or event_row.recurrence_series_id is distinct from p_series_id then
      raise exception 'Recurring Event changed; reload it'; end if;
  else
    select * into event_row from public.events where id=p_event_id and deleted_at is null for update;
    if not found then raise exception 'Event not found'; end if;
  end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if coalesce(cardinality(p_branch_ids),0)>0 and exists(
    select 1 from unnest(p_branch_ids) as target(branch_id)
    left join public.branches b on b.id=target.branch_id where b.id is null
  ) then raise exception 'Unknown notification Branch'; end if;
  if coalesce(cardinality(p_position_ids),0)>0 and exists(
    select 1 from unnest(p_position_ids) as target(position_id)
    left join public.positions p on p.id=target.position_id where p.id is null
  ) then raise exception 'Unknown notification Position'; end if;
  if coalesce(cardinality(p_reminder_offsets),0)>0 and exists(
    select 1 from unnest(p_reminder_offsets) m where m<1 or m>43200
  ) then raise exception 'Invalid Event reminder'; end if;
  select coalesce(array_agg(e.id order by e.id),array[p_event_id]) into selected_ids
  from public.events e where e.id=p_event_id or
    (p_scope='series' and e.recurrence_series_id=p_series_id) or
    (p_scope='following' and e.recurrence_series_id=p_series_id and e.recurrence_key>=event_row.recurrence_key);
  for target_event in select * from public.events e where e.id=any(selected_ids) order by e.id loop
    if not private.can_manage_event(target_event.id) then
      raise exception 'Event outside branch scope';
    end if;
  end loop;
  delete from public.event_notification_targets where event_id=any(selected_ids);
  insert into public.event_notification_targets(event_id,all_active)
    select e,true from unnest(selected_ids) e where p_all_active;
  insert into public.event_notification_targets(event_id,branch_id)
    select e,b from unnest(selected_ids) e cross join unnest(coalesce(p_branch_ids,'{}')) b;
  insert into public.event_notification_targets(event_id,position_id)
    select e,p from unnest(selected_ids) e cross join unnest(coalesce(p_position_ids,'{}')) p;
  delete from public.event_reminder_offsets where event_id=any(selected_ids);
  insert into public.event_reminder_offsets(event_id,minutes_before)
    select e,m from unnest(selected_ids) e cross join unnest(coalesce(p_reminder_offsets,'{}')) m
    on conflict do nothing;
  -- The new occurrence is notified after its audience has been saved.
  if event_row.created_at>pg_catalog.now()-interval '5 minutes' then
    perform private.notify_event_created(p_event_id);
  end if;
end;
$$;
revoke all on function private.set_event_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  from public,anon,authenticated;
create function public.set_event_notification_settings(
  p_event_id bigint,p_all_active boolean,p_branch_ids bigint[],p_position_ids bigint[],
  p_reminder_offsets integer[],p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
) returns void language sql security definer set search_path = '' as $$
  select private.set_event_notification_settings($1,$2,$3,$4,$5,$6,$7,$8)
$$;
revoke all on function public.set_event_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.set_event_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  to authenticated;

create function private.set_task_notification_settings(
  p_task_id bigint,p_all_active boolean,p_branch_ids bigint[],p_position_ids bigint[],
  p_reminder_offsets integer[],p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare actor bigint:=private.current_active_officer_id(); task_row public.tasks; target_task public.tasks; selected_ids bigint[];
begin
  if actor is null then raise exception 'Unauthorized'; end if;
  if p_scope not in ('occurrence','following','series') then raise exception 'Invalid recurrence scope'; end if;
  -- Match recurrence mutation lock ordering: series, then occurrences by ID.
  select * into task_row from public.tasks where id=p_task_id and removed_at is null;
  if not found then raise exception 'Task not found'; end if;
  if p_scope<>'occurrence' then
    perform 1 from public.task_series s where s.id=p_series_id and s.revision=p_series_revision for update;
    if not found or task_row.recurrence_series_id is distinct from p_series_id then raise exception 'Recurring Task changed; reload it'; end if;
    perform 1 from public.tasks t where t.recurrence_series_id=p_series_id
      and (p_scope='series' or t.recurrence_key>=task_row.recurrence_key)
      order by t.id for update;
    select * into task_row from public.tasks where id=p_task_id and removed_at is null;
    if not found or task_row.recurrence_series_id is distinct from p_series_id then
      raise exception 'Recurring Task changed; reload it'; end if;
  else
    select * into task_row from public.tasks where id=p_task_id and removed_at is null for update;
    if not found then raise exception 'Task not found'; end if;
  end if;
  if not private.can_manage_branches(array[task_row.branch_id]) then raise exception 'Task outside branch scope'; end if;
  if coalesce(cardinality(p_branch_ids),0)>0 and exists(
    select 1 from unnest(p_branch_ids) as target(branch_id)
    left join public.branches b on b.id=target.branch_id where b.id is null
  ) then raise exception 'Unknown notification Branch'; end if;
  if coalesce(cardinality(p_position_ids),0)>0 and exists(
    select 1 from unnest(p_position_ids) as target(position_id)
    left join public.positions p on p.id=target.position_id where p.id is null
  ) then raise exception 'Unknown notification Position'; end if;
  if coalesce(cardinality(p_reminder_offsets),0)>0 and exists(
    select 1 from unnest(p_reminder_offsets) m where m<1 or m>43200
  ) then raise exception 'Invalid Task reminder'; end if;
  select coalesce(array_agg(t.id order by t.id),array[p_task_id]) into selected_ids
  from public.tasks t where t.id=p_task_id or
    (p_scope='series' and t.recurrence_series_id=p_series_id) or
    (p_scope='following' and t.recurrence_series_id=p_series_id and t.recurrence_key>=task_row.recurrence_key);
  for target_task in select * from public.tasks t where t.id=any(selected_ids) order by t.id loop
    if not private.can_manage_branches(array[target_task.branch_id]) then
      raise exception 'Task outside branch scope';
    end if;
  end loop;
  delete from public.task_notification_targets where task_id=any(selected_ids);
  insert into public.task_notification_targets(task_id,all_active)
    select t,true from unnest(selected_ids) t where p_all_active;
  insert into public.task_notification_targets(task_id,branch_id)
    select t,b from unnest(selected_ids) t cross join unnest(coalesce(p_branch_ids,'{}')) b;
  insert into public.task_notification_targets(task_id,position_id)
    select t,p from unnest(selected_ids) t cross join unnest(coalesce(p_position_ids,'{}')) p;
  delete from public.task_reminder_offsets where task_id=any(selected_ids);
  insert into public.task_reminder_offsets(task_id,minutes_before)
    select t,m from unnest(selected_ids) t cross join unnest(coalesce(p_reminder_offsets,'{}')) m
    on conflict do nothing;
end;
$$;
revoke all on function private.set_task_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  from public,anon,authenticated;
create function public.set_task_notification_settings(
  p_task_id bigint,p_all_active boolean,p_branch_ids bigint[],p_position_ids bigint[],
  p_reminder_offsets integer[],p_scope text default 'occurrence',
  p_series_id bigint default null,p_series_revision integer default null
) returns void language sql security definer set search_path = '' as $$
  select private.set_task_notification_settings($1,$2,$3,$4,$5,$6,$7,$8)
$$;
revoke all on function public.set_task_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.set_task_notification_settings(bigint,boolean,bigint[],bigint[],integer[],text,bigint,integer)
  to authenticated;

create function private.event_created_recipients(p_event_id bigint)
returns table(officer_id bigint) language sql stable security definer set search_path = '' as $$
  select distinct o.id from public.officers o where o.status='active' and (
    exists(select 1 from public.event_notification_targets a where a.event_id=p_event_id and a.all_active) or
    exists(select 1 from public.event_notification_targets a join public.officer_branches ob on ob.branch_id=a.branch_id
      where a.event_id=p_event_id and ob.officer_id=o.id) or
    exists(select 1 from public.event_notification_targets a where a.event_id=p_event_id and a.position_id=o.position_id) or
    (not exists(select 1 from public.event_notification_targets a where a.event_id=p_event_id) and (
      not exists(select 1 from public.event_branches eb where eb.event_id=p_event_id) or
      exists(select 1 from public.event_branches eb join public.officer_branches ob on ob.branch_id=eb.branch_id
        where eb.event_id=p_event_id and ob.officer_id=o.id)))
  )
  union
  select o.id from public.officers o join public.positions p on p.id=o.position_id
    where o.status='active' and (o.application_role='admin' or p.code in
      ('president','vice_president_operations','vice_president_academics'));
$$;

create function private.event_administrator_recipients()
returns table(officer_id bigint) language sql stable security definer set search_path = '' as $$
  select o.id from public.officers o join public.positions p on p.id=o.position_id
  where o.status='active' and (o.application_role='admin' or p.code in
    ('president','vice_president_operations','vice_president_academics'))
$$;

create function private.notify_event_created(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id=p_event_id;
  if not found then return; end if;
  perform private.create_notification(r.officer_id,'event.created','New Event: '||event_row.name,
    event_row.event_date::text||coalesce(' · '||event_row.location,''),'event',event_row.id,
    '/events/'||event_row.id,'important','event.created:'||event_row.id||':'||r.officer_id)
  from private.event_created_recipients(p_event_id) r;
end;
$$;
revoke all on function private.event_created_recipients(bigint),private.event_administrator_recipients(),private.notify_event_created(bigint)
  from public,anon,authenticated;

create function private.notify_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare change_kind text; change_title text; recipient record; change_key text;
begin
  if tg_op<>'UPDATE' or new.deleted_at is not null then return new; end if;
  if new.status='cancelled' and old.status is distinct from new.status then
    change_kind:='event.cancelled'; change_title:='Event cancelled: '||new.name;
  elsif old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at or old.location is distinct from new.location then
    change_kind:='event.changed'; change_title:='Event updated: '||new.name;
  else return new; end if;
  change_key:=change_kind||':'||new.id||':'||pg_catalog.clock_timestamp()::text;
  for recipient in select distinct eo.officer_id from public.event_officers eo
    where eo.event_id=new.id and eo.removed_at is null
  loop
    perform private.create_notification(recipient.officer_id,change_kind,change_title,
      new.event_date::text||coalesce(' · '||new.location,''),'event',new.id,'/events/'||new.id,
      'important',change_key||':'||recipient.officer_id);
  end loop;
  for recipient in select r.officer_id from private.event_administrator_recipients() r
  loop
    perform private.create_notification(recipient.officer_id,change_kind,change_title,
      'An Event you follow changed.','event',new.id,'/events/'||new.id,'important',
      change_key||':'||recipient.officer_id);
  end loop;
  return new;
end;
$$;
revoke all on function private.notify_event_change() from public,anon,authenticated;
create trigger events_notify_important_changes after update on public.events
  for each row execute function private.notify_event_change();

create function private.notify_event_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor bigint:=private.current_active_officer_id(); event_row public.events; who bigint;
begin
  who:=case when tg_op='INSERT' then new.officer_id else old.officer_id end;
  if tg_op='UPDATE' and (old.removed_at is not null or new.removed_at is null) then return new; end if;
  if actor is distinct from who then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select * into event_row from public.events where id=case when tg_op='INSERT' then new.event_id else old.event_id end;
  perform private.create_notification(who,case when tg_op='INSERT' then 'event.signup' else 'event.left' end,
    case when tg_op='INSERT' then 'Event signup confirmed' else 'Event signup removed' end,
    event_row.name,'event',event_row.id,'/events/'||event_row.id,'confirmation',
    'event.signup:'||event_row.id||':'||who||':'||tg_op||':'||pg_catalog.clock_timestamp()::text);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.notify_event_signup() from public,anon,authenticated;
create trigger event_signup_notifications after insert or update of removed_at on public.event_officers
  for each row execute function private.notify_event_signup();

create function private.notify_task_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; actor bigint:=private.current_active_officer_id(); target record;
begin
  if tg_op='DELETE' then return old; end if;
  select * into task_row from public.tasks where id=new.task_id;
  for target in
    select distinct o.id from public.officers o where o.status='active' and (
      o.id=new.officer_id or
      exists(select 1 from public.task_notification_targets a where a.task_id=new.task_id and a.all_active) or
      exists(select 1 from public.task_notification_targets a join public.officer_branches ob on ob.branch_id=a.branch_id
        where a.task_id=new.task_id and ob.officer_id=o.id) or
      exists(select 1 from public.task_notification_targets a where a.task_id=new.task_id and a.position_id=o.position_id))
  loop
    perform private.create_notification(target.id,'task.assigned','Task assigned: '||task_row.title,
      'You have a Task to complete.','task',task_row.id,'/tasks/'||task_row.id,'important',
      'task.assigned:'||task_row.id||':'||new.officer_id||':'||target.id||':'||new.assigned_at::text);
  end loop;
  return new;
end;
$$;
create trigger task_assignment_notifications after insert on public.task_officer_assignments
  for each row execute function private.notify_task_assignment();

create function private.notify_task_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target record; task_key text;
begin
  if tg_op<>'UPDATE' then return new; end if;
  if old.title is not distinct from new.title and old.description is not distinct from new.description
    and old.branch_id is not distinct from new.branch_id and old.due_date is not distinct from new.due_date
    and old.due_time is not distinct from new.due_time and old.points is not distinct from new.points then return new; end if;
  task_key:='task.changed:'||new.id||':'||pg_catalog.clock_timestamp()::text;
  for target in select distinct o.id from public.officers o where o.status='active' and (
    exists(select 1 from public.task_officer_assignments a where a.task_id=new.id and a.officer_id=o.id) or
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
create trigger task_change_notifications after update on public.tasks
  for each row execute function private.notify_task_changes();

create function private.notify_task_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; target record;
begin
  if new.completed_at is null or old.completed_at is not distinct from new.completed_at then return new; end if;
  select * into task_row from public.tasks where id=new.task_id;
  for target in select distinct o.id from public.officers o join public.positions p on p.id=o.position_id
    join public.officer_branches ob on ob.officer_id=o.id
    where o.status='active' and p.code='lead' and ob.branch_id=task_row.branch_id
  loop
    perform private.create_notification(target.id,'task.completed','Task completed: '||task_row.title,
      'An Officer completed a Task for your Branch.','task',task_row.id,'/tasks/'||task_row.id,
      'important','task.completed:'||new.task_id||':'||new.officer_id||':'||target.id||':'||new.completed_at::text);
  end loop;
  return new;
end;
$$;
create trigger task_completion_notifications after update of completed_at on public.task_officer_assignments
  for each row execute function private.notify_task_completion();

create function private.notify_point_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id bigint; transaction_id bigint; removed boolean; point_value numeric; key text;
begin
  target_id:=case when tg_op='DELETE' then old.officer_id else new.officer_id end;
  transaction_id:=case when tg_op='DELETE' then old.id else new.id end;
  removed:=tg_op='DELETE' or (new.removed_at is not null and (tg_op='INSERT' or old.removed_at is null));
  point_value:=case when tg_op='DELETE' then old.points else new.points end;
  if pg_catalog.current_setting('cappy.seed_loading',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' and old.points is not distinct from new.points and old.removed_at is not distinct from new.removed_at then return new; end if;
  key:='point.changed:'||transaction_id||':'||pg_catalog.clock_timestamp()::text;
  perform private.create_notification(target_id,'point.changed',case when removed then 'Points removed' else 'Points updated' end,
    point_value::text||' Points','point',transaction_id,'/points','important',key||':'||target_id);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.notify_point_changes() from public,anon,authenticated;
create trigger point_transaction_notifications after insert or update or delete on public.point_transactions
  for each row execute function private.notify_point_changes();

-- Serialize new Warning writes for one Officer before their threshold trigger
-- evaluates the active count, so concurrent Admin writes cannot miss or repeat
-- the transition to three active Warnings.
create or replace function private.create_warning(p_officer_id bigint,p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; target public.officers;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then
    raise exception 'Warning reason is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('warning.threshold:'||p_officer_id::text,91));
  select * into target from public.officers where id=p_officer_id for share;
  if not found then raise exception 'Officer not found'; end if;
  insert into public.officer_warnings(officer_id,reason,status)
    values(p_officer_id,pg_catalog.btrim(p_reason),'approved') returning id into saved_id;
  perform private.write_audit_log('warning.created','warning',saved_id::text,
    pg_catalog.jsonb_build_object('warning_id',saved_id,'officer_id',p_officer_id,
      'officer_name',target.name,'reason',pg_catalog.btrim(p_reason),
      'status','approved','management','direct_admin'));
  return saved_id;
end;
$$;

create function private.notify_warning_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id bigint; warning_id bigint; key text; count_active integer;
  prior_active integer; leader record;
begin
  if pg_catalog.current_setting('cappy.seed_loading',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  target_id:=case when tg_op='DELETE' then old.officer_id else new.officer_id end;
  warning_id:=case when tg_op='DELETE' then old.id else new.id end;
  key:='warning.changed:'||warning_id||':'||pg_catalog.clock_timestamp()::text;
  perform private.create_notification(target_id,'warning.changed',case when tg_op='DELETE' or new.voided_at is not null or new.deleted_at is not null then 'Warning removed' else 'Warning updated' end,
    case when tg_op='DELETE' or new.voided_at is not null or new.deleted_at is not null then 'A Warning was removed from your record.' else 'A Warning on your record changed.' end,
    'warning',warning_id,'/officers/'||target_id,'important',key||':'||target_id);
  if tg_op='INSERT' and new.voided_at is null and new.deleted_at is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('warning.threshold:'||target_id::text,91));
    select count(*),count(*) filter(where w.id<new.id)
      into count_active,prior_active from public.officer_warnings w
      where w.officer_id=target_id and w.voided_at is null and w.deleted_at is null;
    -- A multi-row INSERT exposes all rows to each row trigger. Only the row
    -- that completes the third active Warning should emit the threshold notice.
    if count_active=3 and prior_active=2 then
      for leader in select o.id from public.officers o join public.positions p on p.id=o.position_id
        where o.status='active' and (o.application_role='admin' or p.code in
          ('lead','president','vice_president_operations','vice_president_academics'))
      loop
        perform private.create_notification(leader.id,'warning.threshold','Officer reached 3 active Warnings',
          'Review the Officer record.','warning',warning_id,'/officers/'||target_id,'important',
          'warning.threshold:'||warning_id||':'||leader.id);
      end loop;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.notify_warning_changes() from public,anon,authenticated;
create trigger warning_notifications after insert or update or delete on public.officer_warnings
  for each row execute function private.notify_warning_changes();

create function private.mark_notification_read(p_notification_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now())
  where id=p_notification_id and recipient_officer_id=private.current_active_officer_id();
  if not found then raise exception 'Notification not found'; end if;
end;
$$;
revoke all on function private.mark_notification_read(bigint) from public,anon,authenticated;
create function public.mark_notification_read(p_notification_id bigint)
returns void language sql security definer set search_path = '' as $$ select private.mark_notification_read($1) $$;
revoke all on function private.mark_notification_read(bigint),public.mark_notification_read(bigint) from public,anon,authenticated;
grant execute on function public.mark_notification_read(bigint) to authenticated;

create function private.mark_notifications_reviewed(p_entity_type text,p_entity_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_entity_type not in ('event','task','point','warning') then raise exception 'Invalid notification target'; end if;
  update public.notifications set reviewed_at=coalesce(reviewed_at,pg_catalog.now()),
    read_at=coalesce(read_at,pg_catalog.now())
  where recipient_officer_id=private.current_active_officer_id() and entity_type=p_entity_type
    and priority='important' and case
      when p_entity_type in ('event','task') then entity_id=p_entity_id
      when p_entity_type='point' then p_entity_id=0 or entity_id=p_entity_id
      when p_entity_type='warning' then exists(select 1 from public.officer_warnings w
        where w.id=notifications.entity_id and w.officer_id=p_entity_id)
      else false end;
end;
$$;
revoke all on function private.mark_notifications_reviewed(text,bigint) from public,anon,authenticated;
create function public.mark_notifications_reviewed(p_entity_type text,p_entity_id bigint)
returns void language sql security definer set search_path = '' as $$ select private.mark_notifications_reviewed($1,$2) $$;
revoke all on function private.mark_notifications_reviewed(text,bigint),public.mark_notifications_reviewed(text,bigint) from public,anon,authenticated;
grant execute on function public.mark_notifications_reviewed(text,bigint) to authenticated;

create function private.mark_notification_opened(p_notification_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now()),
    reviewed_at=case when priority='important' then coalesce(reviewed_at,pg_catalog.now()) else reviewed_at end
  where id=p_notification_id and recipient_officer_id=private.current_active_officer_id();
  if not found then raise exception 'Notification not found'; end if;
end;
$$;
create function public.mark_notification_opened(p_notification_id bigint)
returns void language sql security definer set search_path = '' as $$ select private.mark_notification_opened($1) $$;
revoke all on function private.mark_notification_opened(bigint),public.mark_notification_opened(bigint)
  from public,anon,authenticated;
grant execute on function public.mark_notification_opened(bigint) to authenticated;

create function private.process_due_reminders() returns integer
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
      where a.task_id=row.id and a.completed_at is null
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
select cron.schedule('cappy-process-due-reminders','* * * * *','select private.process_due_reminders()');
