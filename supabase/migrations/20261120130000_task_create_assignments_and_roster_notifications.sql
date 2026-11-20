-- Issue #468: save initial Task assignments with their Task, and notify Officers
-- when a manager changes a Task assignment or Event roster.

create function private.save_task_with_resources_and_officers(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,
  p_points numeric,p_approval_required boolean,p_event_ids bigint[],p_resource_links jsonb,
  p_officer_ids bigint[]
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  saved_id:=private.save_task_with_resources(p_title,p_description,p_task_type,p_branch_id,
    p_due_date,p_points,p_approval_required,p_event_ids,p_resource_links);
  if coalesce(cardinality(p_officer_ids),0)>0 then
    perform private.bulk_assign_task_officers(saved_id,p_officer_ids);
  end if;
  return saved_id;
end;
$$;

create function public.save_task_with_resources_and_officers(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_due_date date,
  p_points numeric,p_approval_required boolean,p_event_ids bigint[],p_resource_links jsonb,
  p_officer_ids bigint[]
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_task_with_resources_and_officers(p_title,p_description,p_task_type,
    p_branch_id,p_due_date,p_points,p_approval_required,p_event_ids,p_resource_links,p_officer_ids)
$$;

revoke all on function private.save_task_with_resources_and_officers(
  text,text,text,bigint,date,numeric,boolean,bigint[],jsonb,bigint[]
) from public,anon,authenticated;
revoke all on function public.save_task_with_resources_and_officers(
  text,text,text,bigint,date,numeric,boolean,bigint[],jsonb,bigint[]
) from public,anon,authenticated;
grant execute on function private.save_task_with_resources_and_officers(
  text,text,text,bigint,date,numeric,boolean,bigint[],jsonb,bigint[]
) to authenticated;
grant execute on function public.save_task_with_resources_and_officers(
  text,text,text,bigint,date,numeric,boolean,bigint[],jsonb,bigint[]
) to authenticated;

create table private.creation_roster_request_receipts (
  domain text not null check (domain in ('task.create','event.create')),
  actor_id uuid not null,
  request_key uuid not null,
  roster_payload jsonb not null,
  result_id bigint not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (domain,actor_id,request_key)
);
revoke all on table private.creation_roster_request_receipts from public,anon,authenticated;

create function private.create_recurring_task_with_resources_and_officers(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[],
  p_event_ids bigint[],p_resource_links jsonb,p_officer_ids bigint[],p_roster_scope text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare first_id bigint; series_id bigint; requested_ids bigint[]; target_task_id bigint;
  roster_payload jsonb; receipt private.creation_roster_request_receipts%rowtype;
begin
  if p_roster_scope is null or p_roster_scope not in ('occurrence','series') then raise exception 'Select an assignment scope'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid Officer';
  end if;
  select pg_catalog.array_agg(id order by id) into requested_ids
    from (select distinct unnest(p_officer_ids) id) submitted;
  roster_payload:=pg_catalog.jsonb_build_object('officer_ids',requested_ids,'scope',p_roster_scope);
  first_id:=private.create_recurring_task_with_resources(p_title,p_description,p_task_type,
    p_branch_id,p_points,p_approval_required,p_request_key,p_recurrence_rule,p_due_dates,
    p_event_ids,p_resource_links);
  select * into receipt from private.creation_roster_request_receipts r
    where r.domain='task.create' and r.actor_id=auth.uid() and r.request_key=p_request_key;
  if found then
    if receipt.roster_payload is distinct from roster_payload then
      raise exception 'Recurring Task creation request does not match its original assignment selection';
    end if;
    if receipt.result_id is distinct from first_id then raise exception 'Recurring Task creation receipt mismatch'; end if;
    return receipt.result_id;
  end if;
  select recurrence_series_id into series_id from public.tasks where id=first_id;
  if series_id is null then raise exception 'Recurring Task series not found'; end if;
  for target_task_id in
    select id from public.tasks where recurrence_series_id=series_id and removed_at is null
      and (p_roster_scope='series' or id=first_id) order by recurrence_key
  loop
    perform private.bulk_assign_task_officers(target_task_id,requested_ids);
  end loop;
  insert into private.creation_roster_request_receipts(domain,actor_id,request_key,roster_payload,result_id)
    values('task.create',auth.uid(),p_request_key,roster_payload,first_id);
  return first_id;
end;
$$;

create function public.create_recurring_task_with_resources_and_officers(
  p_title text,p_description text,p_task_type text,p_branch_id bigint,p_points numeric,
  p_approval_required boolean,p_request_key uuid,p_recurrence_rule text,p_due_dates date[],
  p_event_ids bigint[],p_resource_links jsonb,p_officer_ids bigint[],p_roster_scope text
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_recurring_task_with_resources_and_officers(p_title,p_description,p_task_type,
    p_branch_id,p_points,p_approval_required,p_request_key,p_recurrence_rule,p_due_dates,p_event_ids,
    p_resource_links,p_officer_ids,p_roster_scope)
$$;
revoke all on function private.create_recurring_task_with_resources_and_officers(
  text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[],jsonb,bigint[],text
) from public,anon,authenticated;
revoke all on function public.create_recurring_task_with_resources_and_officers(
  text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[],jsonb,bigint[],text
) from public,anon,authenticated;
grant execute on function private.create_recurring_task_with_resources_and_officers(
  text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[],jsonb,bigint[],text
) to authenticated;
grant execute on function public.create_recurring_task_with_resources_and_officers(
  text,text,text,bigint,numeric,boolean,uuid,text,date[],bigint[],jsonb,bigint[],text
) to authenticated;

create function private.create_event_officer_signups(p_signups jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare normalized jsonb;
begin
  if p_signups is null or pg_catalog.jsonb_typeof(p_signups)<>'array' or
      pg_catalog.jsonb_array_length(p_signups)=0 then
    raise exception 'Select at least one Officer';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_signups) as item(value)
    where pg_catalog.jsonb_typeof(item.value)<>'object' or
      coalesce((item.value->>'officer_id') !~ '^-?[1-9][0-9]*$',true) or
      coalesce(item.value->>'participation_type' not in ('volunteer','attendee'),true) or
      coalesce(pg_catalog.jsonb_typeof(item.value->'slot_indexes')<>'array',false) or
      exists(select 1 from pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(item.value->'slot_indexes')='array'
          then item.value->'slot_indexes' else '[]'::jsonb end) slot(value)
        where slot.value !~ '^[1-9][0-9]*$')) then
    raise exception 'Select valid Event Officers';
  end if;
  if (select count(*) from pg_catalog.jsonb_array_elements(p_signups)) <>
     (select count(distinct item.value->>'officer_id') from pg_catalog.jsonb_array_elements(p_signups) as item(value)) then
    raise exception 'Select each Officer once';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'officer_id',(item.value->>'officer_id')::bigint,
    'participation_type',item.value->>'participation_type',
    'slot_indexes',coalesce((select pg_catalog.jsonb_agg(slot.value::integer order by slot.value::integer)
      from pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(item.value->'slot_indexes')='array'
          then item.value->'slot_indexes' else '[]'::jsonb end) slot(value)), '[]'::jsonb))
    order by (item.value->>'officer_id')::bigint)
    into normalized from pg_catalog.jsonb_array_elements(p_signups) as item(value);
  if exists(select 1 from pg_catalog.jsonb_array_elements(normalized) item(value)
      where (item.value->>'participation_type')='attendee' and
        pg_catalog.jsonb_array_length(item.value->'slot_indexes')>0) then
    raise exception 'Attend registrations cannot include Time Slots';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(normalized) item(value)
      where (select count(*) from pg_catalog.jsonb_array_elements(item.value->'slot_indexes')) <>
        (select count(distinct slot.value::integer) from pg_catalog.jsonb_array_elements_text(item.value->'slot_indexes') slot(value))) then
    raise exception 'Select each Time Slot once per Officer';
  end if;
  return normalized;
end;
$$;
revoke all on function private.create_event_officer_signups(jsonb) from public,anon,authenticated;

create function private.apply_event_creation_signups(p_event_id bigint,p_signups jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare group_row record; selected_slot_ids bigint[]; slot_count integer;
begin
  select count(*)::integer into slot_count from public.event_time_slots where event_id=p_event_id;
  if slot_count=0 and exists(select 1 from pg_catalog.jsonb_array_elements(p_signups) item(value)
      where pg_catalog.jsonb_array_length(item.value->'slot_indexes')>0) then
    raise exception 'This Event has no Time Slots';
  end if;
  if slot_count>0 and exists(select 1 from pg_catalog.jsonb_array_elements(p_signups) item(value)
      where item.value->>'participation_type'='volunteer' and
        pg_catalog.jsonb_array_length(item.value->'slot_indexes')=0) then
    raise exception 'Select at least one Time Slot for each Volunteer';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_signups) item(value)
      cross join lateral pg_catalog.jsonb_array_elements_text(item.value->'slot_indexes') ix(value)
      where ix.value::integer>slot_count) then
    raise exception 'One or more selected Time Slots do not exist';
  end if;
  for group_row in select item.value->>'participation_type' as participation_type,
      pg_catalog.array_agg((item.value->>'officer_id')::bigint order by (item.value->>'officer_id')::bigint) as officer_ids
    from pg_catalog.jsonb_array_elements(p_signups) item(value)
    where item.value->>'participation_type'='attendee' or slot_count=0
    group by item.value->>'participation_type'
  loop
    perform private.bulk_add_event_officers(p_event_id,group_row.officer_ids,group_row.participation_type);
  end loop;
  if slot_count>0 then
    for group_row in select item.value->'slot_indexes' as slot_indexes,
        pg_catalog.array_agg((item.value->>'officer_id')::bigint order by (item.value->>'officer_id')::bigint) as officer_ids
      from pg_catalog.jsonb_array_elements(p_signups) item(value)
      where item.value->>'participation_type'='volunteer'
      group by item.value->'slot_indexes'
    loop
      select pg_catalog.array_agg(s.id order by s.slot_order) into selected_slot_ids
        from (select id,row_number() over(order by starts_at,id)::integer as slot_order
          from public.event_time_slots where event_id=p_event_id) s
        where s.slot_order=any(array(select value::integer from pg_catalog.jsonb_array_elements_text(group_row.slot_indexes)));
      perform private.bulk_add_event_officers_to_slots(p_event_id,group_row.officer_ids,selected_slot_ids);
    end loop;
  end if;
end;
$$;
revoke all on function private.apply_event_creation_signups(bigint,jsonb) from public,anon,authenticated;

create function private.save_event_with_resources_and_officers(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_signup_sheet_url text,
  p_max_volunteers integer,p_slides_url text,p_meeting_notes_url text,p_time_slots jsonb,
  p_resource_links jsonb,p_officer_signups jsonb,p_roster_scope text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; signups jsonb; group_row record;
begin
  signups:=private.create_event_officer_signups(p_officer_signups);
  if p_roster_scope is null or p_roster_scope not in ('occurrence','series') then raise exception 'Select an Event roster scope'; end if;
  saved_id:=private.save_event_with_resources(p_name,p_description,p_event_type_id,p_location,
    p_event_date,p_starts_at,p_ends_at,p_branch_ids,p_signup_sheet_url,p_max_volunteers,null,
    p_slides_url,p_meeting_notes_url,p_time_slots,p_resource_links);
  perform private.apply_event_creation_signups(saved_id,signups);
  return saved_id;
end;
$$;

create function public.save_event_with_resources_and_officers(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,p_branch_ids bigint[],p_signup_sheet_url text,
  p_max_volunteers integer,p_slides_url text,p_meeting_notes_url text,p_time_slots jsonb,
  p_resource_links jsonb,p_officer_signups jsonb,p_roster_scope text
) returns bigint language sql security invoker set search_path = '' as $$
  select private.save_event_with_resources_and_officers(p_name,p_description,p_event_type_id,
    p_location,p_event_date,p_starts_at,p_ends_at,p_branch_ids,p_signup_sheet_url,p_max_volunteers,
    p_slides_url,p_meeting_notes_url,p_time_slots,p_resource_links,p_officer_signups,p_roster_scope)
$$;
revoke all on function private.save_event_with_resources_and_officers(
  text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,text,text,jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
revoke all on function public.save_event_with_resources_and_officers(
  text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,text,text,jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
grant execute on function private.save_event_with_resources_and_officers(
  text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,text,text,jsonb,jsonb,jsonb,text
) to authenticated;
grant execute on function public.save_event_with_resources_and_officers(
  text,text,bigint,text,date,timestamptz,timestamptz,bigint[],text,integer,text,text,jsonb,jsonb,jsonb,text
) to authenticated;

create function private.create_recurring_event_with_resources_and_officers(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_branch_ids bigint[],
  p_slides_url text,p_meeting_notes_url text,p_signup_sheet_url text,p_max_volunteers integer,
  p_request_key uuid,p_recurrence_rule text,p_event_dates date[],p_starts_at timestamptz[],
  p_ends_at timestamptz[],p_time_slots jsonb,p_resource_links jsonb,p_officer_signups jsonb,
  p_roster_scope text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare first_id bigint; series_id bigint; requested jsonb; event_row record;
  roster_payload jsonb; receipt private.creation_roster_request_receipts%rowtype;
begin
  requested:=private.create_event_officer_signups(p_officer_signups);
  if p_roster_scope is null or p_roster_scope not in ('occurrence','series') then raise exception 'Select an Event roster scope'; end if;
  roster_payload:=pg_catalog.jsonb_build_object('officer_signups',requested,'scope',p_roster_scope);
  first_id:=private.create_recurring_event_with_resources(p_name,p_description,p_event_type_id,
    p_location,p_branch_ids,p_slides_url,p_meeting_notes_url,p_signup_sheet_url,p_max_volunteers,
    p_request_key,p_recurrence_rule,p_event_dates,p_starts_at,p_ends_at,p_time_slots,p_resource_links);
  select * into receipt from private.creation_roster_request_receipts r
    where r.domain='event.create' and r.actor_id=auth.uid() and r.request_key=p_request_key;
  if found then
    if receipt.roster_payload is distinct from roster_payload then
      raise exception 'Recurring Event creation request does not match its original roster selection';
    end if;
    if receipt.result_id is distinct from first_id then raise exception 'Recurring Event creation receipt mismatch'; end if;
    return receipt.result_id;
  end if;
  select recurrence_series_id into series_id from public.events where id=first_id;
  if series_id is null then raise exception 'Recurring Event series not found'; end if;
  for event_row in select id from public.events where recurrence_series_id=series_id and deleted_at is null
      and (p_roster_scope='series' or id=first_id) order by recurrence_key
  loop
    perform private.apply_event_creation_signups(event_row.id,requested);
  end loop;
  insert into private.creation_roster_request_receipts(domain,actor_id,request_key,roster_payload,result_id)
    values('event.create',auth.uid(),p_request_key,roster_payload,first_id);
  return first_id;
end;
$$;

create function public.create_recurring_event_with_resources_and_officers(
  p_name text,p_description text,p_event_type_id bigint,p_location text,p_branch_ids bigint[],
  p_slides_url text,p_meeting_notes_url text,p_signup_sheet_url text,p_max_volunteers integer,
  p_request_key uuid,p_recurrence_rule text,p_event_dates date[],p_starts_at timestamptz[],
  p_ends_at timestamptz[],p_time_slots jsonb,p_resource_links jsonb,p_officer_signups jsonb,
  p_roster_scope text
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_recurring_event_with_resources_and_officers(p_name,p_description,
    p_event_type_id,p_location,p_branch_ids,p_slides_url,p_meeting_notes_url,p_signup_sheet_url,
    p_max_volunteers,p_request_key,p_recurrence_rule,p_event_dates,p_starts_at,p_ends_at,p_time_slots,
    p_resource_links,p_officer_signups,p_roster_scope)
$$;
revoke all on function private.create_recurring_event_with_resources_and_officers(
  text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
revoke all on function public.create_recurring_event_with_resources_and_officers(
  text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
grant execute on function private.create_recurring_event_with_resources_and_officers(
  text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb,jsonb,jsonb,text
) to authenticated;
grant execute on function public.create_recurring_event_with_resources_and_officers(
  text,text,bigint,text,bigint[],text,text,text,integer,uuid,text,date[],timestamptz[],timestamptz[],jsonb,jsonb,jsonb,text
) to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'event.created','event.changed','event.cancelled','event.signup','event.left',
  'task.assigned','task.assignment_removed','task.changed','task.completed','task.completion_rejected',
  'point.changed','warning.changed','warning.threshold','event.reminder','task.reminder'
));

create or replace function private.notify_task_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; target record; changed_kind text; changed_title text;
  changed_message text; changed_key text;
begin
  if tg_op='UPDATE' and old.removed_at is not distinct from new.removed_at then return new; end if;
  select * into task_row from public.tasks where id=new.task_id;
  if tg_op='UPDATE' and new.removed_at is not null then
    perform private.create_notification(new.officer_id,'task.assignment_removed',
      'Task assignment removed: '||task_row.title,
      'You are no longer assigned to this Task.','task',task_row.id,
      '/tasks/'||task_row.id,'important',
      'task.assignment_removed:'||task_row.id||':'||new.officer_id||':'||
        pg_catalog.clock_timestamp()::text);
    return new;
  end if;
  changed_kind:='task.assigned';
  changed_title:='Task assigned: '||task_row.title;
  changed_message:='You have a Task to complete.';
  changed_key:='task.assigned:'||task_row.id||':'||new.officer_id||':'||
    pg_catalog.clock_timestamp()::text;
  for target in
    select distinct o.id from public.officers o where o.status='active' and (
      o.id=new.officer_id or
      exists(select 1 from public.task_notification_targets a where a.task_id=new.task_id and a.all_active) or
      exists(select 1 from public.task_notification_targets a join public.officer_branches ob on ob.branch_id=a.branch_id
        where a.task_id=new.task_id and ob.officer_id=o.id) or
      exists(select 1 from public.task_notification_targets a where a.task_id=new.task_id and a.position_id=o.position_id))
  loop
    perform private.create_notification(target.id,changed_kind,changed_title,
      changed_message,'task',task_row.id,'/tasks/'||task_row.id,'important',
      changed_key||':'||target.id);
  end loop;
  return new;
end;
$$;
revoke all on function private.notify_task_assignment() from public,anon,authenticated;
drop trigger task_assignment_notifications on public.task_officer_assignments;
create trigger task_assignment_notifications after insert or update of removed_at
  on public.task_officer_assignments for each row execute function private.notify_task_assignment();

create or replace function private.notify_event_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor bigint:=private.current_active_officer_id(); event_row public.events; who bigint;
  roster_added boolean; notice_kind text; notice_title text; notice_message text;
  notice_key text; participation text;
begin
  who:=case when tg_op='INSERT' then new.officer_id else old.officer_id end;
  if tg_op='UPDATE' and old.removed_at is not distinct from new.removed_at then return new; end if;
  roster_added:=tg_op='INSERT' or (tg_op='UPDATE' and old.removed_at is not null and new.removed_at is null);
  select * into event_row from public.events where id=case when tg_op='INSERT' then new.event_id else old.event_id end;
  participation:=case when tg_op='INSERT' then new.participation_type else old.participation_type end;
  if actor is not null and actor is distinct from who then
    notice_kind:=case when roster_added then 'event.signup' else 'event.left' end;
    notice_title:=case when roster_added then 'Added to Event: ' else 'Removed from Event: ' end||event_row.name;
    notice_message:=case when roster_added
      then 'A manager added you as '||case when participation='attendee' then 'Attending' else 'Volunteer' end||'.'
      else 'A manager removed your Event registration.' end;
    notice_key:='event.manager_roster:'||event_row.id||':'||who||':'||
      case when roster_added then 'added:' else 'removed:' end||pg_catalog.clock_timestamp()::text;
    perform private.create_notification(who,notice_kind,notice_title,notice_message,
      'event',event_row.id,'/events/'||event_row.id,'confirmation',notice_key);
  elsif actor=who then
    notice_kind:=case when roster_added then 'event.signup' else 'event.left' end;
    notice_title:=case when roster_added then 'Event signup confirmed' else 'Event signup removed' end;
    notice_key:='event.signup:'||event_row.id||':'||who||':'||
      case when roster_added then 'added:' else 'removed:' end||pg_catalog.clock_timestamp()::text;
    perform private.create_notification(who,notice_kind,notice_title,event_row.name,
      'event',event_row.id,'/events/'||event_row.id,'confirmation',notice_key);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.notify_event_signup() from public,anon,authenticated;
