-- Roster edits reconcile only selected Officers. Keep the existing full-Event
-- reconciler signature intact for schedule corrections and processing.
create function private.reconcile_event_participation_for_roster(
  p_event_id bigint,
  p_source_changed boolean,
  p_officer_ids bigint[]
) returns bigint[] language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
 basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
 changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean;
 basis_missing boolean;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.deleted_at is not null or e.status='cancelled' then return changed; end if;
 if e.ends_at>pg_catalog.now() then
  for award in select p.* from public.point_transactions p where p.event_id=p_event_id
   and (p_officer_ids is null or p.officer_id=any(p_officer_ids))
   and p.award_type='participation' and p.removed_at is null and p.participation_superseded_at is null
   order by p.id for update
  loop
   select * into basis from private.event_participation_basis where transaction_id=award.id;
   basis_missing:=not found;
   insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
    values(award.id,e.starts_at,e.ends_at,true)
    on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=true;
   update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=null,
    removed_by_officer_id=null,participation_schedule_suspended=true where id=award.id;
   perform private.write_audit_log('points.participation_suspended','point_transaction',award.id::text,
    jsonb_build_object('transaction_id',award.id,'event_id',e.id,'before',to_jsonb(award),
     'previous_basis_known',not basis_missing,
     'previous_basis',case when basis_missing then null else to_jsonb(basis) end,
     'corrected_starts_at',e.starts_at,'corrected_ends_at',e.ends_at,'suspension_source','schedule_correction'));
  end loop;
  return changed;
 end if;
 update public.events set participation_points_per_hour_at_end=coalesce(participation_points_per_hour_at_end,1)
  where id=e.id and participation_points_per_hour_at_end is null;
 for target in
  select eo.officer_id,null::bigint slot_id,e.starts_at starts_at,e.ends_at ends_at
   from public.event_officers eo where eo.event_id=e.id
   and (p_officer_ids is null or eo.officer_id=any(p_officer_ids))
   and not exists(select 1 from public.event_time_slots s where s.event_id=e.id)
  union all
  select x.officer_id,s.id,s.starts_at,s.ends_at from public.event_time_slot_officers x
   join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=e.id
   and (p_officer_ids is null or x.officer_id=any(p_officer_ids))
  order by officer_id,slot_id nulls first
 loop
  amount:=private.event_participation_points(target.starts_at,target.ends_at,1);
  select * into award from public.point_transactions p where p.event_id=e.id and p.officer_id=target.officer_id
   and p.award_type='participation' and p.event_time_slot_id is not distinct from target.slot_id
   and p.participation_superseded_at is null for update;
  if not found then
   insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type)
    values(target.officer_id,e.id,target.slot_id,amount,
      case when target.slot_id is null then 'Event participation' else 'Event time slot participation' end,'participation')
    returning id into award_id;
   perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
    jsonb_build_object('transaction_id',award_id,'event_id',e.id,'officer_id',target.officer_id,
     'time_slot_id',target.slot_id,'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,
     'scheduled_hours',extract(epoch from(target.ends_at-target.starts_at))::numeric/3600,
     'rate',1,'points',amount,'supersedes_transaction_id',(select max(p.id) from public.point_transactions p
       where p.event_id=e.id and p.officer_id=target.officer_id and p.event_time_slot_id is not distinct from target.slot_id
       and p.participation_superseded_at is not null)));
   changed:=array_append(changed,award_id);
  else
   select * into basis from private.event_participation_basis where transaction_id=award.id;
   basis_missing:=not found;
   if award.removed_at is not null and not coalesce(basis.schedule_suspended,false)
      and not award.slot_selection_removed then continue; end if;
   if p_source_changed or coalesce(basis.schedule_suspended,false) or award.slot_selection_removed then
    prior_points:=award.points; was_removed:=award.removed_at is not null;
    update public.point_transactions set points=amount,removed_at=null,removed_by=null,removed_by_officer_id=null,
     participation_schedule_suspended=false,slot_selection_removed=false
     where id=award.id;
    insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
     values(award.id,target.starts_at,target.ends_at,false)
     on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=false;
    if prior_points is distinct from amount or was_removed or basis_missing then
     perform private.write_audit_log('points.participation_reconciled','point_transaction',award.id::text,
      jsonb_build_object('transaction_id',award.id,'event_id',e.id,'officer_id',award.officer_id,
       'before_points',prior_points,'after_points',amount,
       'previous_basis_known',not basis_missing,
       'previous_basis',case when basis_missing then null else to_jsonb(basis) end,
       'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,'rate',1,'reactivated',was_removed));
     changed:=array_append(changed,award.id);
    end if;
   end if;
  end if;
 end loop;
 return changed;
end;
$$;
revoke all on function private.reconcile_event_participation_for_roster(bigint,boolean,bigint[]) from public,anon,authenticated;

create or replace function private.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean
) returns void language plpgsql security definer set search_path='' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  manager boolean; changed_rows integer; award public.point_transactions%rowtype;
  slot_ids bigint[]; slot_selections jsonb; affected_awards bigint[]:='{}'::bigint[];
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  manager:=private.can_manage_event(p_event_id);
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'Signups are closed for this event'; end if;
  if p_officer_id is distinct from actor_id and not manager then
    raise exception 'Cannot manage another officer signup for this event'; end if;
  if (current_event.participation_points_per_hour_at_end is not null or current_event.ends_at<=pg_catalog.now())
      and not manager then raise exception 'Signups are closed for this event'; end if;
  if not p_remove and exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  if not p_remove then
    perform 1 from public.officers where id=p_officer_id and status='active' for share;
    if not found then raise exception 'Target officer is not active'; end if;
  end if;
  if p_remove then
    if exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
      select coalesce(array_agg(slot_id order by slot_id),'{}'::bigint[]),
        coalesce(jsonb_agg(to_jsonb(so) order by slot_id),'[]'::jsonb)
        into slot_ids,slot_selections
        from public.event_time_slot_officers so where event_id=p_event_id and officer_id=p_officer_id;
      for award in select p.* from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=p_officer_id and p.award_type='participation'
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
          jsonb_build_object('transaction_id',award.id,'officer_id',p_officer_id,'event_id',p_event_id,
            'before',to_jsonb(award),'removed_by',auth.uid(),'removal_source','event_signup'));
      end loop;
      delete from public.event_officers where event_id=p_event_id and officer_id=p_officer_id;
      get diagnostics changed_rows=row_count;
    else
      changed_rows:=0;
    end if;
  elsif exists(select 1 from public.event_officers where event_id=p_event_id and officer_id=p_officer_id) then
    changed_rows:=0;
  else
    insert into public.event_officers(event_id,officer_id) values(p_event_id,p_officer_id)
      on conflict(event_id,officer_id) do nothing;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      if current_event.ends_at<=pg_catalog.now()
         and current_event.participation_points_per_hour_at_end is null then
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
      jsonb_build_object('officer_id',p_officer_id,'actor_id',actor_id,'removed',p_remove,
        'time_slot_ids',case when p_remove then slot_ids else null end,
        'removed_slot_selections',case when p_remove then slot_selections else null end,
        'participation_transaction_ids',case when p_remove then affected_awards else null end));
  end if;
end;
$$;

create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_event public.events%rowtype; actor_id bigint:=private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_transaction_ids bigint[]:='{}'::bigint[];
  awarded_ids bigint[]:='{}'::bigint[]; point_values numeric[]:='{}'::numeric[];
  snapshot_created boolean:=false; confirmed_count bigint; new_count bigint;
  current_rate numeric; award_points numeric; scheduled_hours numeric;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  if p_officer_ids is null or cardinality(p_officer_ids)=0 or array_position(p_officer_ids,null) is not null then
    raise exception 'Select at least one valid officer'; end if;
  select array_agg(id order by id) into requested_ids from
    (select distinct unnest(p_officer_ids) as id) submitted;
  select * into current_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if current_event.deleted_at is not null or current_event.status='cancelled' then
    raise exception 'This event cannot accept attendees'; end if;
  if exists(select 1 from public.event_time_slots where event_id=p_event_id) then
    raise exception 'Select one or more Time Slots to sign up for this Event'; end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active'
    order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active'; end if;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id);
  new_count:=(select count(*) from unnest(requested_ids) as requested(officer_id) where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=requested.officer_id));
  if current_event.max_volunteers is not null and confirmed_count+new_count>current_event.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  with inserted as (
    insert into public.event_officers(event_id,officer_id)
    select p_event_id,requested.officer_id from unnest(requested_ids) as requested(officer_id)
    where not exists(select 1 from public.event_officers eo where eo.event_id=p_event_id
      and eo.officer_id=requested.officer_id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids from inserted;
  if current_event.ends_at<=pg_catalog.now() and current_event.participation_points_per_hour_at_end is null then
    update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
    snapshot_created:=true;
  end if;
  if current_event.ends_at<=pg_catalog.now() then
    current_rate:=1;
    scheduled_hours:=extract(epoch from(current_event.ends_at-current_event.starts_at))::numeric/3600;
    award_points:=private.event_participation_points(current_event.starts_at,current_event.ends_at,current_rate);
  end if;
  if current_event.ends_at<=pg_catalog.now() then
    award_transaction_ids:=case when snapshot_created
      then private.reconcile_event_participation(p_event_id,false)
      else private.reconcile_event_participation_for_roster(p_event_id,false,requested_ids)
    end;
    select coalesce(array_agg(distinct p.officer_id order by p.officer_id),'{}'::bigint[]),
      coalesce(array_agg(distinct p.points order by p.points),'{}'::numeric[])
      into awarded_ids,point_values from public.point_transactions p
      where p.id=any(award_transaction_ids) and p.award_type='participation';
  end if;
  if cardinality(added_ids)>0 or cardinality(award_transaction_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'participation_transaction_ids',award_transaction_ids,
        'participation_awards_created',awarded_ids,'participation_rate',current_rate,
        'points_per_officer',award_points,'scheduled_hours',scheduled_hours,
        'snapshot_created',snapshot_created));
  end if;
  return jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_officer_ids',awarded_ids,'points_per_officer',point_values[1]);
end;
$$;
