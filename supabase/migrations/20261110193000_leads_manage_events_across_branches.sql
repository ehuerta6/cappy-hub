-- Keep the existing Event-manager scope for unrelated administration. Leads
-- receive a separate global scope for Event creation and editing workflows.
create or replace function private.can_manage_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_branches(coalesce((select array_agg(branch_id) from public.event_branches
    where event_id=p_event_id),'{}'::bigint[])) and
    exists(select 1 from public.events where id=p_event_id)
$$;
revoke all on function private.can_manage_event(bigint) from public,anon,authenticated;
-- Existing RLS policies use this narrow boolean predicate for scoped reads.
grant execute on function private.can_manage_event(bigint) to authenticated;

create or replace function private.can_edit_event(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_active_officer_id() is not null and
    (private.current_is_admin() or private.current_is_event_executive() or private.current_is_lead()) and
    exists(select 1 from public.events where id=p_event_id)
$$;
revoke all on function private.can_edit_event(bigint) from public,anon,authenticated;

create or replace function private.can_manage_event_branches(p_branch_ids bigint[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_active_officer_id() is not null and
    (private.current_is_admin() or private.current_is_event_executive() or private.current_is_lead())
$$;
revoke all on function private.can_manage_event_branches(bigint[]) from public,anon,authenticated;

-- Recurrence edits use the new Event scope. Remove/cancel operations keep the
-- existing manager scope, as do lifecycle delete and restore RPCs.
create or replace function private.mutate_recurring_event(
  p_selected_id bigint,p_scope text,p_operation text,p_request_key uuid,
  p_series_id bigint,p_revision integer,p_patch jsonb default '{}',p_rule text default null,p_dates date[] default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare selected public.events; r public.events; s public.event_series;
  actor uuid := auth.uid(); payload jsonb; receipt private.recurrence_mutations;
  ids bigint[]; preserved_removed_ids bigint[]; target_series bigint; i integer := 0; day date; previous_day date;
  before_definition jsonb; after_definition jsonb; starts timestamptz; ends timestamptz; branches bigint[]; occurrence_id bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_scope is null or p_scope not in ('occurrence','following','series') or p_operation is null or p_operation not in ('edit','remove','cancel') or p_request_key is null then raise exception 'Invalid recurrence scope or operation'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('name','description','event_type_id','location','slides_url','meeting_notes_url','signup_sheet_url','branch_ids','event_date','start_time','end_time')) or exists(select 1 from jsonb_each(p_patch) where value='null'::jsonb) then raise exception 'Invalid recurrence edit fields'; end if;
  if p_patch ? 'signup_sheet_url' then perform private.normalize_signup_sheet_url(p_patch->>'signup_sheet_url'); end if;
  if (p_operation<>'edit' and (p_patch<>'{}'::jsonb or p_rule is not null or p_dates is not null)) or (p_scope='occurrence' and (p_rule is not null or p_dates is not null)) or (p_scope<>'occurrence' and p_patch ? 'event_date') or ((p_rule is null)<>(p_dates is null)) then raise exception 'Invalid recurrence edit fields'; end if;
  payload := jsonb_build_object('domain','event','selected_id',p_selected_id,'scope',p_scope,'operation',p_operation,'series_id',p_series_id,'revision',p_revision,'patch',p_patch,'rule',p_rule,'dates',p_dates);
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,68));
  select * into receipt from private.recurrence_mutations where request_key=p_request_key;
  if found then if receipt.actor_id is distinct from actor or receipt.payload is distinct from payload then raise exception 'Idempotency key already used'; end if; return receipt.selected_id; end if;
  select * into s from public.event_series where id=p_series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if s.revision is distinct from p_revision or s.retired then raise exception 'Series changed; reload and try again'; end if;
  perform 1 from public.events where recurrence_series_id=s.id order by id for update;
  select * into selected from public.events where id=p_selected_id;
  if not found or selected.recurrence_series_id is distinct from s.id then raise exception 'Occurrence does not belong to this series'; end if;
  if not (private.can_manage_event(p_selected_id) or (p_operation='edit' and private.can_edit_event(p_selected_id))) then raise exception 'Event outside branch scope'; end if;
  if selected.deleted_at is not null and p_operation='edit' then raise exception 'This event cannot be edited'; end if;
  select array_agg(id order by recurrence_key) into ids from public.events where recurrence_series_id=s.id and (recurrence_key<=s.ends_on or p_scope='occurrence') and (p_scope='series' or (p_scope='following' and recurrence_key>=selected.recurrence_key) or id=p_selected_id);
  if ids is null then raise exception 'Occurrence outside active schedule'; end if;
  select coalesce(array_agg(id),'{}'::bigint[]) into preserved_removed_ids from public.events where id=any(ids) and deleted_at is not null;
  before_definition := to_jsonb(s);
  if p_rule is not null then
    perform private.assert_recurrence_dates(p_rule,p_dates);
    if p_scope='following' and p_dates[1]<=coalesce((select max(recurrence_key) from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key),'-infinity'::date) then raise exception 'Future schedule must remain after earlier occurrences'; end if;
    insert into public.event_series(request_key,recurrence_rule,created_by,starts_on,ends_on,parent_series_id) values(p_request_key,p_rule,private.current_active_officer_id(),p_dates[1],p_dates[cardinality(p_dates)],s.id) returning id into target_series;
    select max(recurrence_key) into previous_day from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key;
    if p_scope='following' and previous_day is not null then update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day,revision=revision+1 where id=s.id; else update public.event_series set retired=true,revision=revision+1 where id=s.id; end if;
  end if;
  foreach occurrence_id in array ids loop
    i:=i+1; select * into r from public.events where id=occurrence_id;
    if not (private.can_manage_event(r.id) or (p_operation='edit' and private.can_edit_event(r.id))) then raise exception 'Event outside branch scope'; end if;
    if p_operation='remove' or (p_rule is not null and i>cardinality(p_dates)) then perform private.remove_event(r.id);
    elsif p_operation='cancel' then if r.status<>'cancelled' and r.deleted_at is null then perform private.cancel_event(r.id); end if;
    elsif r.deleted_at is null then
      if p_scope='occurrence' and r.status='cancelled' then raise exception 'This event cannot be edited'; end if;
      day:=case when p_scope='occurrence' then coalesce((p_patch->>'event_date')::date,r.event_date) else r.event_date end; if p_rule is not null then day:=p_dates[i]; end if;
      starts:=(day+coalesce((p_patch->>'start_time')::time,(r.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      ends:=(day+coalesce((p_patch->>'end_time')::time,(r.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver';
      branches:=case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint) else array(select branch_id from public.event_branches where event_id=r.id order by branch_id) end;
      perform private.save_event_fields(coalesce(p_patch->>'name',r.name),coalesce(p_patch->>'description',r.description),coalesce((p_patch->>'event_type_id')::bigint,r.event_type_id),coalesce(p_patch->>'location',r.location),day,starts,ends,branches,r.id,case when p_patch ? 'slides_url' then p_patch->>'slides_url' else r.slides_url end,case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else r.meeting_notes_url end);
      perform private.update_event_signup_sheet_url(r.id,case when p_patch ? 'signup_sheet_url' then p_patch->>'signup_sheet_url' else r.signup_sheet_url end);
    end if;
    if p_rule is not null and i<=cardinality(p_dates) then update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=r.id; end if;
  end loop;
  if p_rule is not null and cardinality(p_dates)>cardinality(ids) then
    for i in cardinality(ids)+1..cardinality(p_dates) loop
      if exists(with recursive ancestors as (select id,parent_series_id from public.event_series where id=s.id union all select a.id,a.parent_series_id from public.event_series a join ancestors b on a.id=b.parent_series_id) select 1 from public.events t join ancestors a on a.id=t.recurrence_series_id where t.deleted_at is not null and t.recurrence_key=p_dates[i]) then raise exception 'Schedule would recreate a removed occurrence'; end if;
      occurrence_id:=private.save_event_fields(coalesce(p_patch->>'name',selected.name),coalesce(p_patch->>'description',selected.description),coalesce((p_patch->>'event_type_id')::bigint,selected.event_type_id),coalesce(p_patch->>'location',selected.location),p_dates[i],(p_dates[i]+coalesce((p_patch->>'start_time')::time,(selected.starts_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',(p_dates[i]+coalesce((p_patch->>'end_time')::time,(selected.ends_at at time zone 'America/Denver')::time)) at time zone 'America/Denver',case when p_patch ? 'branch_ids' then array(select jsonb_array_elements_text(p_patch->'branch_ids')::bigint) else array(select branch_id from public.event_branches where event_id=selected.id) end,null,case when p_patch ? 'slides_url' then p_patch->>'slides_url' else selected.slides_url end,case when p_patch ? 'meeting_notes_url' then p_patch->>'meeting_notes_url' else selected.meeting_notes_url end);
      perform private.update_event_signup_sheet_url(occurrence_id,case when p_patch ? 'signup_sheet_url' then p_patch->>'signup_sheet_url' else selected.signup_sheet_url end);
      update public.events set recurrence_series_id=target_series,recurrence_key=p_dates[i] where id=occurrence_id; ids:=array_append(ids,occurrence_id);
    end loop;
  end if;
  if p_rule is null then
    if p_operation='remove' and p_scope<>'occurrence' then select max(recurrence_key) into previous_day from public.events where recurrence_series_id=s.id and recurrence_key<selected.recurrence_key and recurrence_key<=s.ends_on; if p_scope='following' and previous_day is not null then update public.event_series set recurrence_rule=regexp_replace(recurrence_rule,';(COUNT=[0-9]+|UNTIL=[0-9]{8})$',';UNTIL='||to_char(previous_day,'YYYYMMDD')),ends_on=previous_day where id=s.id; else update public.event_series set retired=true where id=s.id; end if; end if;
    update public.event_series set revision=revision+1 where id=s.id; target_series:=s.id;
  end if;
  select to_jsonb(definition) into after_definition from public.event_series definition where id=target_series;
  perform private.write_audit_log('event.series_'||p_operation,'event_series',s.id::text,jsonb_build_object('selected_occurrence_id',selected.id,'boundary',selected.recurrence_key,'scope',p_scope,'operation',p_operation,'before',before_definition,'after',after_definition,'result_series_id',target_series,'original_series_after',(select to_jsonb(definition) from public.event_series definition where id=s.id),'affected_occurrence_ids',ids,'preserved_removed_occurrence_ids',preserved_removed_ids,'patch',p_patch,'request_key',p_request_key));
  insert into private.recurrence_mutations values(p_request_key,actor,payload,selected.id); return selected.id;
end;
$$;

-- Current Event roster and Time Slot signups use the Event editing scope. Past Events retain the existing manager scope because those operations can affect Points.
create or replace function private.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean,p_participation_type text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  manager boolean; changed_rows integer; award public.point_transactions%rowtype;
  slot_ids bigint[]; slot_selections jsonb; affected_awards bigint[]:='{}'::bigint[];
  removed_participation_type text;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_participation_type not in ('volunteer','attendee') then raise exception 'Select Volunteer or Attend'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  manager:=private.can_manage_event(p_event_id) or (current_event.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id));
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'Signups are closed for this event'; end if;
  if p_officer_id is distinct from actor_id and not manager then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if (current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=pg_catalog.now())
      and not manager then raise exception 'Signups are closed for this event'; end if;
  if not p_remove and exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    if p_participation_type='attendee' then raise exception 'Time Slot signups are for Volunteers'; end if;
    if coalesce(pg_catalog.current_setting('cappy.time_slot_signup',true),'off')<>'on' then
      raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  end if;
  if not p_remove then
    perform 1 from public.officers where id=p_officer_id and status='active' for share;
    if not found then raise exception 'Target officer is not active'; end if;
  end if;
  if p_remove then
    select eo.participation_type into removed_participation_type
      from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=p_officer_id
        and eo.removed_at is null for update;
    if found then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]),
        coalesce(jsonb_agg(to_jsonb(so) order by slot_id),'[]'::jsonb)
        into slot_ids,slot_selections
        from public.event_time_slot_officers so where event_id=p_event_id and officer_id=p_officer_id;
      for award in select p.* from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=p_officer_id and p.award_type='participation'
        and (p.removed_at is null or p.participation_schedule_suspended)
        and p.participation_superseded_at is null order by p.id for update
      loop
        update private.event_participation_basis set schedule_suspended=false where transaction_id=award.id;
        update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid(),
          removed_by_officer_id=actor_id,participation_schedule_suspended=false,
          participation_superseded_at=pg_catalog.clock_timestamp() where id=award.id;
        affected_awards:=pg_catalog.array_append(affected_awards,award.id);
        perform private.write_audit_log('points.participation_removed','point_transaction',award.id::text,
          pg_catalog.jsonb_build_object('transaction_id',award.id,'officer_id',p_officer_id,'event_id',p_event_id,
            'before',pg_catalog.to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
      update public.event_officers set removed_at=pg_catalog.clock_timestamp()
        where event_id=p_event_id and officer_id=p_officer_id and removed_at is null;
      get diagnostics changed_rows=row_count;
    else
      changed_rows:=0;
    end if;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id
      and removed_at is null and participation_type is distinct from p_participation_type) then
    update public.event_officers set participation_type=p_participation_type
      where event_id=p_event_id and officer_id=p_officer_id and removed_at is null
        and participation_type is distinct from p_participation_type;
    get diagnostics changed_rows=row_count;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
    update public.event_officers set removed_at=null,participation_type=p_participation_type
      where event_id=p_event_id and officer_id=p_officer_id and removed_at is not null;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if exists(select 1 from public.event_time_slot_officers x join public.event_time_slots s
          on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=p_event_id
          and x.officer_id=p_officer_id and s.capacity is not null
          and (select count(*) from public.event_time_slot_officers active_x
            join public.event_officers active_eo on active_eo.event_id=active_x.event_id
              and active_eo.officer_id=active_x.officer_id and active_eo.removed_at is null
            where active_x.slot_id=x.slot_id and active_x.officer_id<>p_officer_id)>=s.capacity) then
        raise exception 'A selected Time Slot is full'; end if;
      if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
        perform private.reconcile_event_participation(p_event_id,false);
      else
        perform private.reconcile_event_participation_for_roster(p_event_id,false,array[p_officer_id]);
      end if;
    end if;
  else
    insert into public.event_officers(event_id,officer_id,participation_type)
      values(p_event_id,p_officer_id,p_participation_type) on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
        perform private.reconcile_event_participation(p_event_id,false);
      else
        perform private.reconcile_event_participation_for_roster(p_event_id,false,array[p_officer_id]);
      end if;
    end if;
  end if;
  if changed_rows>0 then
    perform private.write_audit_log(case when p_remove and p_officer_id=actor_id then 'event.signout'
      when p_remove then 'event.officer_removed' when p_officer_id=actor_id then 'event.signup'
      else 'event.officer_assigned' end,'event',p_event_id::text,
      pg_catalog.jsonb_build_object('officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove,
        'participation_type',case when p_remove then removed_participation_type else p_participation_type end,
        'time_slot_ids',case when p_remove then slot_ids else null end,
        'removed_slot_selections',case when p_remove then slot_selections else null end,
        'participation_transaction_ids',case when p_remove then affected_awards else null end));
  end if;
  return not p_remove and changed_rows>0;
end;
$$;
create or replace function private.change_event_time_slot_signup(
  p_event_id bigint,p_officer_id bigint,p_slot_ids bigint[],p_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; actor_id bigint:=private.current_active_officer_id(); target_id bigint;
  slot_ids bigint[]; existing_signup boolean; added_slots bigint[]:='{}'::bigint[];
  removed_slots bigint[]:='{}'::bigint[]; new_signup boolean:=false; award_ids bigint[]:='{}'::bigint[];
  current_count bigint; selected_count bigint; preserve_slot_history boolean:=false; manager boolean;
  award public.point_transactions%rowtype; affected_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_mode not in ('join_selected','join_all','leave_selected','leave_all') then raise exception 'Invalid Time Slot signup mode'; end if;
  target_id:=coalesce(p_officer_id,actor_id);
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  manager:=private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id));
  if target_id<>actor_id and not manager then
    raise exception 'Cannot manage another Officer signup for this Event'; end if;
  preserve_slot_history:=p_mode='leave_all' and private.can_manage_event(p_event_id)
    and (e.ends_at<=pg_catalog.now() or e.participation_points_per_hour_at_end is not null);
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept Time Slot signups'; end if;
  if not exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'This Event has no volunteer Time Slots'; end if;
  if target_id=actor_id and not private.can_manage_event(p_event_id) and
    (e.participation_points_per_hour_at_end is not null or e.ends_at<=pg_catalog.now()) then
    raise exception 'Signups are closed for this Event'; end if;
  if not preserve_slot_history then
    perform 1 from public.officers where id=target_id and status='active' for share;
    if not found then raise exception 'Target Officer is not active'; end if;
  end if;
  existing_signup:=exists(select 1 from public.event_officers where event_id=p_event_id
    and officer_id=target_id and removed_at is null);
  if p_mode in ('join_all','join_selected') then
    if p_mode='join_all' then
      select array_agg(id order by starts_at,id) into slot_ids from public.event_time_slots where event_id=p_event_id;
    else
      if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
        raise exception 'Select at least one Time Slot'; end if;
      select array_agg(id order by id) into slot_ids from (select distinct unnest(p_slot_ids) id) q;
      if exists(select 1 from unnest(slot_ids) x left join public.event_time_slots s
          on s.id=x and s.event_id=p_event_id where s.id is null) then
        raise exception 'One or more Time Slots do not belong to this Event'; end if;
    end if;
    if not existing_signup then
      if exists(select 1 from public.event_officers inactive where inactive.event_id=p_event_id
          and inactive.officer_id=target_id and inactive.removed_at is not null
          and exists(select 1 from public.event_time_slot_officers prior
            where prior.event_id=p_event_id and prior.officer_id=target_id)) then
        raise exception 'This removed Time Slot signup cannot be restored'; end if;
      if e.max_volunteers is not null and (select count(*) from public.event_officers
          where event_id=p_event_id and removed_at is null)>=e.max_volunteers then
        raise exception 'Event capacity has been reached'; end if;
      if exists(select 1 from public.event_time_slot_officers prior
          join public.event_time_slots prior_slot on prior_slot.id=prior.slot_id and prior_slot.event_id=prior.event_id
          where prior.event_id=p_event_id and prior.officer_id=target_id and prior_slot.capacity is not null
            and (select count(*) from public.event_time_slot_officers active
              join public.event_officers active_signup on active_signup.event_id=active.event_id
                and active_signup.officer_id=active.officer_id and active_signup.removed_at is null
              where active.slot_id=prior.slot_id and active.officer_id<>target_id)>=prior_slot.capacity) then
        raise exception 'A selected Time Slot is full'; end if;
      if exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=target_id) then
        update public.event_officers set removed_at=null where event_id=p_event_id and officer_id=target_id;
      else
        insert into public.event_officers(event_id,officer_id) values(p_event_id,target_id);
      end if;
      new_signup:=true;
    end if;
    for current_count in select unnest(slot_ids) loop
      if not exists(select 1 from public.event_time_slot_officers where event_id=p_event_id
          and slot_id=current_count and officer_id=target_id) then
        select capacity into selected_count from public.event_time_slots where id=current_count and event_id=p_event_id for update;
        if selected_count is not null and (select count(*) from public.event_time_slot_officers x
            join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id
              and eo.removed_at is null where x.slot_id=current_count)>=selected_count then
          raise exception 'A selected Time Slot is full; no Time Slot selections were added'; end if;
        insert into public.event_time_slot_officers(event_id,slot_id,officer_id,created_by)
          values(p_event_id,current_count,target_id,auth.uid()) on conflict(slot_id,officer_id) do nothing;
        added_slots:=array_append(added_slots,current_count);
      end if;
    end loop;
    if e.ends_at<=pg_catalog.now() then
      if e.participation_points_per_hour_at_end is null then
        update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
      end if;
      award_ids:=private.award_selected_event_time_slots(p_event_id,array[target_id],'raise');
    end if;
  else
    if p_mode='leave_all' then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]) into slot_ids
        from public.event_time_slot_officers where event_id=p_event_id and officer_id=target_id;
    else
      if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
        raise exception 'Select at least one Time Slot'; end if;
      select array_agg(id order by id) into slot_ids from (select distinct unnest(p_slot_ids) id) q;
      if exists(select 1 from unnest(slot_ids) x left join public.event_time_slots s
          on s.id=x and s.event_id=p_event_id where s.id is null) then
        raise exception 'One or more Time Slots do not belong to this Event'; end if;
    end if;
    if not preserve_slot_history then
      delete from public.event_time_slot_officers where event_id=p_event_id
        and officer_id=target_id and slot_id=any(slot_ids);
      get diagnostics selected_count=row_count;
    else
      selected_count:=cardinality(slot_ids);
    end if;
    removed_slots:=slot_ids;
    if preserve_slot_history or not exists(select 1 from public.event_time_slot_officers
        where event_id=p_event_id and officer_id=target_id) then
      update public.event_officers set removed_at=pg_catalog.clock_timestamp()
        where event_id=p_event_id and officer_id=target_id and removed_at is null;
    end if;
    if preserve_slot_history then
      for award in select p.* from public.point_transactions p
        where p.event_id=p_event_id and p.officer_id=target_id and p.award_type='participation'
          and p.event_time_slot_id=any(slot_ids)
          and (p.removed_at is null or p.participation_schedule_suspended)
          and p.participation_superseded_at is null order by p.id for update
      loop
        update private.event_participation_basis set schedule_suspended=false
          where transaction_id=award.id;
        update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid(),
          removed_by_officer_id=actor_id,participation_schedule_suspended=false,
          participation_superseded_at=pg_catalog.clock_timestamp() where id=award.id;
        affected_awards:=array_append(affected_awards,award.id);
        perform private.write_audit_log('points.participation_removed','point_transaction',award.id::text,
          pg_catalog.jsonb_build_object('transaction_id',award.id,'officer_id',target_id,'event_id',p_event_id,
            'before',to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
    end if;
  end if;
  if new_signup or cardinality(added_slots)>0 or cardinality(removed_slots)>0 then
    perform private.write_audit_log('event.time_slot_signup_changed','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',target_id,'actor_id',actor_id,
        'mode',p_mode,'added_slot_ids',added_slots,'removed_slot_ids',removed_slots,
        'canonical_signup_created',new_signup,'participation_transaction_ids',affected_awards));
  end if;
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'officer_id',target_id,'mode',p_mode,
    'added_slot_ids',added_slots,'removed_slot_ids',removed_slots,'award_transaction_ids',award_ids);
end;
$$;

-- Current manager-added roster operations follow the Event editing scope;
-- past attendance/Point corrections retain the original Branch authorization.
create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[],p_participation_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_targets bigint[];
  target record; award_id bigint; awarded_ids bigint[]:='{}'::bigint[];
  rate numeric; award_points numeric; scheduled_hours numeric;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_participation_type not in ('volunteer','attendee') then raise exception 'Select Volunteer or Attend'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select Time Slots when adding Officers to this Event';
  end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid officer';
  end if;
  select pg_catalog.array_agg(id order by id) into requested_ids
    from (select distinct unnest(p_officer_ids) id) submitted;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not (private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id))) then raise exception 'Event outside branch scope'; end if;
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept signups'; end if;
  if e.participation_points_per_hour_at_end is not null and e.ends_at>pg_catalog.now() then
    raise exception 'Signups are closed for this Event';
  end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active' order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active';
  end if;
  if e.max_volunteers is not null and
    (select count(*) from public.event_officers eo where eo.event_id=p_event_id and eo.removed_at is null)
      +(select count(*) from unnest(requested_ids) id where not exists(
        select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=id and eo.removed_at is null))
      >e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity';
  end if;
  with reactivated as (
    update public.event_officers set participation_type=p_participation_type,removed_at=null
      where event_id=p_event_id and officer_id=any(requested_ids) and removed_at is not null
      returning officer_id
  ), inserted as (
    insert into public.event_officers(event_id,officer_id,participation_type)
    select p_event_id,id,p_participation_type from unnest(requested_ids) submitted(id)
    where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=submitted.id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(pg_catalog.array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids
    from (select officer_id from reactivated union all select officer_id from inserted) changed;
  if e.ends_at<=pg_catalog.now() then
    if e.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=2,
        participation_rate_version='volunteer_attendee' where id=p_event_id;
      select coalesce(pg_catalog.array_agg(officer_id order by officer_id),'{}'::bigint[])
        into award_targets from public.event_officers where event_id=p_event_id and removed_at is null;
    else
      award_targets:=requested_ids;
    end if;
    scheduled_hours:=extract(epoch from (e.ends_at-e.starts_at))::numeric/3600;
    for target in select eo.officer_id,eo.participation_type from public.event_officers eo
      where eo.event_id=p_event_id and eo.officer_id=any(award_targets) and eo.removed_at is null
      order by eo.officer_id
    loop
      rate:=case target.participation_type when 'volunteer' then 2 else 1 end;
      award_points:=private.event_participation_points(e.starts_at,e.ends_at,rate);
      award_id:=null;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
        values(target.officer_id,p_event_id,award_points,'Event participation','participation',null)
        on conflict do nothing returning id into award_id;
      if award_id is not null then
        awarded_ids:=pg_catalog.array_append(awarded_ids,award_id);
        perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
            'officer_id',target.officer_id,'participation_type',target.participation_type,
            'scheduled_hours',scheduled_hours,'rate',rate,'points',award_points));
      end if;
    end loop;
  end if;
  perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
    pg_catalog.jsonb_build_object('event_id',p_event_id,'actor_officer_id',actor_id,
      'officer_ids',added_ids,'participation_type',p_participation_type,
      'participation_awards_created',awarded_ids));
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_point_ids',awarded_ids,'participation_type',p_participation_type);
end;
$$;
create or replace function private.bulk_add_event_officers_to_slots(
  p_event_id bigint,p_officer_ids bigint[],p_slot_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  target_ids bigint[]; selected_slots bigint[]; added_ids bigint[]; award_ids bigint[]:='{}'::bigint[];
  confirmed_count bigint; new_count bigint; slot record; new_for_slot bigint;
  current_rate numeric; snapshot_created boolean:=false;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid Officer'; end if;
  if p_slot_ids is null or cardinality(p_slot_ids)=0 or array_position(p_slot_ids,null) is not null then
    raise exception 'Select at least one Time Slot'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not (private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id))) then
    raise exception 'Event outside branch scope'; end if;
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept attendees'; end if;
  if not exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'This Event has no volunteer Time Slots'; end if;
  select array_agg(id order by id) into target_ids from (select distinct unnest(p_officer_ids) id) q;
  select array_agg(id order by id) into selected_slots from (select distinct unnest(p_slot_ids) id) q;
  if exists(select 1 from unnest(target_ids) x left join public.officers o on o.id=x
      where o.id is null or o.status<>'active') then raise exception 'All target Officers must be active'; end if;
  if exists(select 1 from unnest(selected_slots) x left join public.event_time_slots s
      on s.id=x and s.event_id=p_event_id where s.id is null) then
    raise exception 'One or more Time Slots do not belong to this Event'; end if;
  if exists(select 1 from public.event_officers inactive
      where inactive.event_id=p_event_id and inactive.officer_id=any(target_ids)
        and inactive.removed_at is not null
        and exists(select 1 from public.event_time_slot_officers prior
          where prior.event_id=p_event_id and prior.officer_id=inactive.officer_id)) then
    raise exception 'This removed Time Slot signup cannot be restored'; end if;
  perform 1 from public.officers where id=any(target_ids) order by id for share;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id and removed_at is null);
  new_count:=(select count(*) from unnest(target_ids) x where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=x and eo.removed_at is null));
  if e.max_volunteers is not null and confirmed_count+new_count>e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  for slot in select id,capacity from public.event_time_slots where id=any(selected_slots) order by id for update loop
    new_for_slot:=(select count(*) from unnest(target_ids) x where not exists(
      select 1 from public.event_time_slot_officers so join public.event_officers eo
        on eo.event_id=so.event_id and eo.officer_id=so.officer_id and eo.removed_at is null
      where so.slot_id=slot.id and so.officer_id=x));
    if slot.capacity is not null and (select count(*) from public.event_time_slot_officers so
        join public.event_officers eo on eo.event_id=so.event_id and eo.officer_id=so.officer_id
          and eo.removed_at is null where so.slot_id=slot.id)+new_for_slot>slot.capacity then
      raise exception 'The selected Officers exceed a Time Slot capacity'; end if;
  end loop;
  if exists(select 1 from public.event_time_slot_officers prior
      join public.event_time_slots prior_slot on prior_slot.id=prior.slot_id and prior_slot.event_id=prior.event_id
      where prior.event_id=p_event_id and prior.officer_id=any(target_ids) and prior_slot.capacity is not null
        and exists(select 1 from public.event_officers inactive
          where inactive.event_id=p_event_id and inactive.officer_id=prior.officer_id and inactive.removed_at is not null)
        and (select count(*) from public.event_time_slot_officers active
          join public.event_officers active_signup on active_signup.event_id=active.event_id
            and active_signup.officer_id=active.officer_id and active_signup.removed_at is null
          where active.slot_id=prior.slot_id and active.officer_id<>prior.officer_id)>=prior_slot.capacity) then
    raise exception 'A previously selected Time Slot is full'; end if;
  with reactivated as (
    update public.event_officers set removed_at=null where event_id=p_event_id
      and officer_id=any(target_ids) and removed_at is not null returning officer_id
  ), inserted as (
    insert into public.event_officers(event_id,officer_id)
      select p_event_id,x from unnest(target_ids) x
      where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=x)
      on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids
    from (select officer_id from reactivated union all select officer_id from inserted) changed;
  insert into public.event_time_slot_officers(event_id,slot_id,officer_id,created_by)
    select p_event_id,sid,oid,auth.uid() from unnest(selected_slots) sid cross join unnest(target_ids) oid
    on conflict(slot_id,officer_id) do nothing;
  if e.ends_at<=pg_catalog.now() then
    current_rate:=1;
    if e.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
      snapshot_created:=true;
    end if;
    if snapshot_created then award_ids:=private.award_selected_event_time_slots(p_event_id,null,'raise');
    else award_ids:=private.award_selected_event_time_slots(p_event_id,target_ids,'raise'); end if;
  end if;
  if cardinality(added_ids)>0 or cardinality(award_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'time_slot_ids',selected_slots,'participation_transaction_ids',award_ids,
        'participation_rate',current_rate,'snapshot_created',snapshot_created));
  end if;
  return jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'time_slot_ids',selected_slots,'award_transaction_ids',award_ids,'rate',current_rate);
end;
$$;

-- Preserve the legacy unslotted roster RPC while applying the current Event
-- scope only to open Events; historical award corrections stay Branch-scoped.
create or replace function private.bulk_add_event_officers_compatible(p_event_id bigint,p_officer_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if not (private.can_manage_event(p_event_id) or (e.ends_at>pg_catalog.now() and private.can_edit_event(p_event_id))) then
    raise exception 'Event outside branch scope'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select Time Slots when adding Officers to this Event';
  end if;
  if e.ends_at>pg_catalog.now() and not private.can_manage_event(p_event_id) then
    return private.bulk_add_event_officers(p_event_id,p_officer_ids,'volunteer');
  end if;
  return private.bulk_add_event_officers(p_event_id,p_officer_ids);
end;
$$;

-- Capacity and legacy resource fields are part of Event editing.
create or replace function private.set_event_capacity(
  p_event_id bigint,p_max_volunteers integer
) returns void language plpgsql security definer set search_path='' as $$
declare event_row public.events%rowtype; confirmed_count bigint;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if p_max_volunteers is not null and p_max_volunteers<=0 then
    raise exception 'Max volunteers must be a positive whole number'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_edit_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id and removed_at is null);
  if p_max_volunteers is not null and p_max_volunteers<confirmed_count then
    raise exception 'Max volunteers cannot be lower than the confirmed signup count'; end if;
  if event_row.max_volunteers is distinct from p_max_volunteers then
    update public.events set max_volunteers=p_max_volunteers where id=p_event_id;
    perform private.write_audit_log('event.capacity_changed','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'before',
        pg_catalog.jsonb_build_object('max_volunteers',event_row.max_volunteers),
        'after',pg_catalog.jsonb_build_object('max_volunteers',p_max_volunteers)));
  end if;
end;
$$;
-- Event notification settings are part of the Event create/edit save action.
create or replace function private.set_event_notification_settings(
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
  if not private.can_edit_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
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
    if not private.can_edit_event(target_event.id) then
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

create or replace function private.update_event_signup_sheet_url(p_event_id bigint,p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_url text; new_url text := private.normalize_signup_sheet_url(p_url);
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  select signup_sheet_url into old_url from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_edit_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if old_url is distinct from new_url then
    update public.events set signup_sheet_url=new_url where id=p_event_id;
    perform private.write_audit_log('event.links_updated','event',p_event_id::text,
      pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object('signup_sheet_url',old_url),
        'after',pg_catalog.jsonb_build_object('signup_sheet_url',new_url)));
  end if;
end;
$$;

-- Resource links are fields in the Event edit workflow and follow that same scope.
create or replace function private.replace_event_resource_links(p_event_ids bigint[],p_resources jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare event_key bigint; before_links jsonb; after_links jsonb;
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  perform private.assert_resource_links(p_resources,true);
  if p_event_ids is null or cardinality(p_event_ids)=0 or
    cardinality(p_event_ids)<>(select count(distinct id) from unnest(p_event_ids) id) then
    raise exception 'Invalid Event resource scope'; end if;
  for event_key in select unnest(p_event_ids) order by 1 loop
    perform 1 from public.events e where e.id=event_key for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_edit_event(event_key) then raise exception 'Event outside branch scope'; end if;
    if exists(select 1 from public.events e where e.id=event_key and e.deleted_at is not null) then
      raise exception 'This Event cannot be edited'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind',kind,'label',label,'url',url,'legacy_key',legacy_key)
      order by sort_order,id),'[]'::jsonb) into before_links
    from public.resource_links where event_id=event_key;
    delete from public.resource_links where event_id=event_key;
    insert into public.resource_links(event_id,kind,label,url,sort_order,legacy_key)
    select event_key,item->>'kind',item->>'label',pg_catalog.btrim(item->>'url'),
      (row_number() over(order by ordinal))::integer-1,nullif(item->>'legacy_key','')
    from jsonb_array_elements(p_resources) with ordinality as entries(item,ordinal);
    -- Legacy columns remain a compatibility projection. The trigger only
    -- touches rows carrying the corresponding legacy_key.
    update public.events e set
      slides_url=(select r.url from public.resource_links r where r.event_id=event_key and r.legacy_key='slides'),
      meeting_notes_url=(select r.url from public.resource_links r where r.event_id=event_key and r.legacy_key='meeting_notes'),
      signup_sheet_url=(select r.url from public.resource_links r where r.event_id=event_key and r.legacy_key='signup_sheet')
    where e.id=event_key;
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind',kind,'label',label,'url',url,'legacy_key',legacy_key)
      order by sort_order,id),'[]'::jsonb) into after_links
    from public.resource_links where event_id=event_key;
    if before_links is distinct from after_links then
      perform private.write_audit_log('event.resources_updated','event',event_key::text,
        jsonb_build_object('before',before_links,'after',after_links));
    end if;
  end loop;
end;
$$;

-- The shared saver is private and is called only by the trusted Event wrapper.
-- Keep its existing validations, audit history, and mutation shape while
-- applying the Event-specific role scope to the selected Branches.
create or replace function private.save_event_fields(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,
  p_branch_ids bigint[],p_event_id bigint,p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; before_details jsonb; old_event public.events;
  branches bigint[] := coalesce(p_branch_ids,'{}'::bigint[]);
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_event_branches(branches) then raise exception 'Event outside branch scope'; end if;
  if cardinality(branches) <> (select count(distinct id) from unnest(branches) b(id)) then
    raise exception 'Duplicate branches'; end if;
  if exists(select 1 from unnest(branches) x(id) join public.branches b on b.id=x.id
      where not b.is_active and (p_event_id is null or not exists(
        select 1 from public.event_branches eb where eb.event_id=p_event_id and eb.branch_id=x.id))) then
    raise exception 'Invalid or retired branch'; end if;
  if nullif(pg_catalog.btrim(p_name),'') is null or nullif(pg_catalog.btrim(p_description),'') is null
    or nullif(pg_catalog.btrim(p_location),'') is null then
    raise exception 'Name, description and location are required'; end if;
  if not exists(select 1 from public.event_types where id=p_event_type_id and available_for_new_events)
    and not (p_event_id is not null and exists(select 1 from public.events where id=p_event_id and event_type_id=p_event_type_id)) then
    raise exception 'Invalid event type'; end if;
  if p_event_date is null or p_starts_at is null or p_ends_at is null or
    p_ends_at<=p_starts_at or
    (p_starts_at at time zone 'America/Denver')::date<>p_event_date or
    (p_ends_at at time zone 'America/Denver')::date<>p_event_date or
    (p_starts_at at time zone 'America/Denver')::time<time '06:00' or
    (p_ends_at at time zone 'America/Denver')::time>time '23:59' then
    raise exception 'Events need one date and a valid time from 06:00 through 23:59'; end if;
  if nullif(pg_catalog.btrim(p_slides_url),'') is not null and
    pg_catalog.btrim(p_slides_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Slides link must be an HTTP(S) URL'; end if;
  if nullif(pg_catalog.btrim(p_meeting_notes_url),'') is not null and
    pg_catalog.btrim(p_meeting_notes_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Meeting notes link must be an HTTP(S) URL'; end if;
  if p_event_id is null then
    insert into public.events(name,description,event_type_id,location,event_date,starts_at,ends_at,
      slides_url,meeting_notes_url)
    values(pg_catalog.btrim(p_name),pg_catalog.btrim(p_description),p_event_type_id,
      pg_catalog.btrim(p_location),p_event_date,p_starts_at,p_ends_at,
      nullif(pg_catalog.btrim(p_slides_url),''),nullif(pg_catalog.btrim(p_meeting_notes_url),''))
    returning id into saved_id;
  else
    select * into old_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_edit_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if old_event.deleted_at is not null then raise exception 'This event cannot be edited'; end if;
    if not private.can_manage_event(p_event_id) and
       (old_event.event_date is distinct from p_event_date or
        old_event.starts_at is distinct from p_starts_at or old_event.ends_at is distinct from p_ends_at) and
       exists(select 1 from public.point_transactions p where p.event_id=p_event_id) then
      raise exception 'Event outside branch scope';
    end if;
    before_details := pg_catalog.to_jsonb(old_event) || pg_catalog.jsonb_build_object(
      'branch_ids',(select coalesce(array_agg(branch_id order by branch_id),'{}'::bigint[])
        from public.event_branches where event_id=p_event_id));
    update public.events set name=pg_catalog.btrim(p_name),description=pg_catalog.btrim(p_description),
      event_type_id=p_event_type_id,location=pg_catalog.btrim(p_location),event_date=p_event_date,
      starts_at=p_starts_at,ends_at=p_ends_at,slides_url=nullif(pg_catalog.btrim(p_slides_url),''),
      meeting_notes_url=nullif(pg_catalog.btrim(p_meeting_notes_url),'')
    where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id)
    select saved_id,id from unnest(branches) b(id);
  if p_event_id is null or before_details is distinct from
    ((select to_jsonb(e) from public.events e where id=saved_id) ||
      pg_catalog.jsonb_build_object('branch_ids',branches)) then
    perform private.write_audit_log(case when p_event_id is null then 'event.created' else 'event.updated' end,
      'event',saved_id::text,pg_catalog.jsonb_build_object('before',before_details,
        'after',(select to_jsonb(e) from public.events e where id=saved_id) ||
          pg_catalog.jsonb_build_object('branch_ids',branches)));
  end if;
  if p_event_id is not null and (old_event.slides_url is distinct from nullif(pg_catalog.btrim(p_slides_url),'')
      or old_event.meeting_notes_url is distinct from nullif(pg_catalog.btrim(p_meeting_notes_url),'')) then
    perform private.write_audit_log('event.links_updated','event',saved_id::text,
      pg_catalog.jsonb_build_object('before',pg_catalog.jsonb_build_object(
        'slides_url',old_event.slides_url,'meeting_notes_url',old_event.meeting_notes_url),
        'after',pg_catalog.jsonb_build_object('slides_url',nullif(pg_catalog.btrim(p_slides_url),''),
          'meeting_notes_url',nullif(pg_catalog.btrim(p_meeting_notes_url),''))));
  end if;
  return saved_id;
end;
$$;

create or replace function private.save_event_with_links(
  p_name text,p_description text,p_event_type_id bigint,p_location text,
  p_event_date date,p_starts_at timestamptz,p_ends_at timestamptz,
  p_branch_ids bigint[],p_event_id bigint,p_slides_url text,p_meeting_notes_url text
) returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if private.current_active_officer_id() is null then raise exception 'Unauthorized'; end if;
  if not private.can_manage_event_branches(coalesce(p_branch_ids,'{}'::bigint[])) then
    raise exception 'Event outside branch scope'; end if;
  if p_event_id is not null then
    perform 1 from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if not private.can_edit_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
    if exists(select 1 from public.events where id=p_event_id and status='cancelled') then
      raise exception 'This event cannot be edited'; end if;
  end if;
  return private.save_event_fields(p_name,p_description,p_event_type_id,p_location,p_event_date,p_starts_at,p_ends_at,
    p_branch_ids,p_event_id,p_slides_url,p_meeting_notes_url);
end;
$$;
