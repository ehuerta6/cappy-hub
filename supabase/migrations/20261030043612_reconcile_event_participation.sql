-- New participation uses one Point/hour. Historical rates, amounts and
-- removals are preserved; no inferred intent or production backfill.
alter table public.point_transactions add column participation_superseded_at timestamptz
  constraint point_participation_superseded_shape check (participation_superseded_at is null or
    (award_type='participation' and removed_at is not null));
-- A mechanically suspended participation award has no human remover. Preserve
-- the existing removed_at/remover invariant for every other transaction.
alter table public.point_transactions add column participation_schedule_suspended boolean not null default false;
alter table public.point_transactions drop constraint point_transactions_removed_pair_check;
alter table public.point_transactions add constraint point_transactions_removed_pair_check check (
 (removed_at is null and removed_by is null) or
 (removed_at is not null and removed_by is not null) or
 (removed_at is not null and removed_by is null and award_type='participation' and participation_schedule_suspended)
);
alter table public.point_transactions add constraint point_transactions_schedule_suspension_shape check (
 not participation_schedule_suspended or
 (award_type='participation' and removed_at is not null and removed_by is null and removed_by_officer_id is null)
);

-- Domain-specific eligibility evidence for newly created/reconciled awards.
-- Legacy basis is deliberately unknown until a source correction or explicit
-- Admin confirmation supplies evidence; migration does not reconstruct it.
create table private.event_participation_basis (
  transaction_id bigint primary key references public.point_transactions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at>starts_at),
  schedule_suspended boolean not null default false
);
revoke all on private.event_participation_basis from public,anon,authenticated;

drop index public.one_ordinary_participation_award_per_officer_event;
drop index public.one_participation_award_per_officer_slot;
create unique index one_ordinary_participation_award_per_officer_event
 on public.point_transactions(officer_id,event_id) where award_type='participation'
 and event_time_slot_id is null and participation_superseded_at is null;
create unique index one_participation_award_per_officer_slot
 on public.point_transactions(officer_id,event_time_slot_id) where award_type='participation'
 and event_time_slot_id is not null and participation_superseded_at is null;
-- Active ordinary identity/ordinary-versus-slot guard remain unchanged.

create or replace function private.event_participation_points(
 p_starts_at timestamptz,p_ends_at timestamptz,p_rate numeric
) returns numeric language sql immutable security invoker set search_path='' as $$
 select extract(epoch from (p_ends_at-p_starts_at))::numeric/3600
$$;

create function private.capture_event_participation_basis()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.award_type='participation' then
  insert into private.event_participation_basis(transaction_id,starts_at,ends_at)
  select new.id,coalesce(s.starts_at,e.starts_at),coalesce(s.ends_at,e.ends_at)
  from public.events e left join public.event_time_slots s on s.id=new.event_time_slot_id
  where e.id=new.event_id;
 end if;
 return new;
end;
$$;
revoke all on function private.capture_event_participation_basis() from public,anon,authenticated;
create trigger point_transactions_capture_participation_basis after insert on public.point_transactions
 for each row execute function private.capture_event_participation_basis();

create function private.reconcile_event_participation(p_event_id bigint,p_source_changed boolean default false)
returns bigint[] language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
 basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
 changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.deleted_at is not null or e.status='cancelled' then return changed; end if;
 -- Pending direct-edit policy: source changes involving independently edited
 -- credit fail atomically, rather than silently overwriting or endorsing it.
 if p_source_changed and exists(select 1 from public.point_transactions p
   left join private.event_participation_basis b on b.transaction_id=p.id
   where p.event_id=p_event_id and p.award_type='participation' and p.participation_superseded_at is null
   and (p.removed_at is null or coalesce(b.schedule_suspended,false))
   and (p.updated_by is not null or p.updated_by_officer_id is not null)) then
  raise exception 'Edited automatic Points need an explicit policy decision before schedule reconciliation';
 end if;
 -- Marker-free legacy rows may contain undocumented direct edits. A missing
 -- basis is explicit unknown evidence, never proof that overwriting is safe.
 if p_source_changed and exists(select 1 from public.point_transactions p
   where p.event_id=p_event_id and p.award_type='participation' and p.removed_at is null
   and not exists(select 1 from private.event_participation_basis b where b.transaction_id=p.id)) then
  raise exception 'Historical participation needs reviewed compatibility handling before schedule reconciliation';
 end if;
 if e.ends_at>pg_catalog.now() then
  for award in select p.* from public.point_transactions p where p.event_id=p_event_id
   and p.award_type='participation' and p.removed_at is null and p.participation_superseded_at is null
   order by p.id for update
  loop
   insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
    values(award.id,e.starts_at,e.ends_at,true)
    on conflict(transaction_id) do update set schedule_suspended=true;
   update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),removed_by=null,
    removed_by_officer_id=null,participation_schedule_suspended=true where id=award.id;
   perform private.write_audit_log('points.participation_suspended','point_transaction',award.id::text,
    jsonb_build_object('transaction_id',award.id,'event_id',e.id,'before',to_jsonb(award),
     'corrected_starts_at',e.starts_at,'corrected_ends_at',e.ends_at,'suspension_source','schedule_correction'));
  end loop;
  return changed;
 end if;
 update public.events set participation_points_per_hour_at_end=coalesce(participation_points_per_hour_at_end,1)
  where id=e.id and participation_points_per_hour_at_end is null;
 for target in
  select eo.officer_id,null::bigint slot_id,e.starts_at starts_at,e.ends_at ends_at
   from public.event_officers eo where eo.event_id=e.id
   and not exists(select 1 from public.event_time_slots s where s.event_id=e.id)
  union all
  select x.officer_id,s.id,s.starts_at,s.ends_at from public.event_time_slot_officers x
   join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id where x.event_id=e.id
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
   if award.removed_at is not null and not coalesce(basis.schedule_suspended,false)
      and not award.slot_selection_removed then continue; end if;
   if (award.updated_by is not null or award.updated_by_officer_id is not null) then
    if coalesce(basis.schedule_suspended,false) then
     raise exception 'Edited automatic Points need an explicit policy decision before schedule reconciliation';
    end if;
    continue;
   end if;
   -- Existing historic rates are evidence, not an invitation to reprice all
   -- processed rows. Only an actual source correction changes existing credit.
   if p_source_changed or coalesce(basis.schedule_suspended,false) or award.slot_selection_removed then
    prior_points:=award.points; was_removed:=award.removed_at is not null;
    update public.point_transactions set points=amount,removed_at=null,removed_by=null,removed_by_officer_id=null,
     participation_schedule_suspended=false,slot_selection_removed=false
     where id=award.id;
    insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
     values(award.id,target.starts_at,target.ends_at,false)
     on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=false;
    if prior_points is distinct from amount or was_removed then
     perform private.write_audit_log('points.participation_reconciled','point_transaction',award.id::text,
      jsonb_build_object('transaction_id',award.id,'event_id',e.id,'officer_id',award.officer_id,
       'before_points',prior_points,'after_points',amount,'previous_basis',to_jsonb(basis),
       'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,'rate',1,'reactivated',was_removed));
     changed:=array_append(changed,award.id);
    end if;
   end if;
  end if;
 end loop;
 return changed;
end;
$$;
revoke all on function private.reconcile_event_participation(bigint,boolean) from public,anon,authenticated;

create function private.reconcile_event_schedule_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at then
  perform private.reconcile_event_participation(new.id,true);
 end if;
 return new;
end;
$$;
revoke all on function private.reconcile_event_schedule_change() from public,anon,authenticated;
create trigger events_reconcile_participation_schedule after update of starts_at,ends_at on public.events
 for each row execute function private.reconcile_event_schedule_change();

create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path='' as $$
declare e public.events%rowtype; processed integer:=0; awards bigint[];
begin
 for e in select * from public.events candidate where candidate.status<>'cancelled' and candidate.deleted_at is null
  and candidate.ends_at<=pg_catalog.now() and (candidate.participation_points_per_hour_at_end is null
   or exists(select 1 from public.point_transactions p join private.event_participation_basis b on b.transaction_id=p.id
      where p.event_id=candidate.id and b.schedule_suspended
       and exists(select 1 from public.event_officers eo where eo.event_id=candidate.id and eo.officer_id=p.officer_id)
       and (p.event_time_slot_id is null or exists(select 1 from public.event_time_slot_officers x
         where x.event_id=candidate.id and x.officer_id=p.officer_id and x.slot_id=p.event_time_slot_id)))
   or exists(select 1 from public.point_transactions p where p.event_id=candidate.id and p.participation_superseded_at is not null
     and exists(select 1 from public.event_officers eo where eo.event_id=candidate.id and eo.officer_id=p.officer_id)
     and (p.event_time_slot_id is null or exists(select 1 from public.event_time_slot_officers x
       where x.event_id=candidate.id and x.officer_id=p.officer_id and x.slot_id=p.event_time_slot_id))
     and not exists(select 1 from public.point_transactions n where n.event_id=candidate.id and n.officer_id=p.officer_id
      and n.event_time_slot_id is not distinct from p.event_time_slot_id and n.award_type='participation'
      and n.participation_superseded_at is null)))
  order by candidate.id for update skip locked
 loop
  awards:=private.reconcile_event_participation(e.id);
  perform private.write_audit_log('event.participation_processed','event',e.id::text,
   jsonb_build_object('rate',1,'scheduled_hours',extract(epoch from(e.ends_at-e.starts_at))::numeric/3600,
    'awards_created',cardinality(awards),'event_kind',case when exists(select 1 from public.event_time_slots where event_id=e.id)
      then 'slotted' else 'timed' end));
  processed:=processed+1;
 end loop;
 return processed;
end;
$$;

create or replace function private.award_selected_event_time_slots(p_event_id bigint,p_officer_ids bigint[] default null,
  p_manual_conflict text default 'skip') returns bigint[]
language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; target record; award_id bigint; award_points numeric;
  awarded bigint[]:='{}'::bigint[]; existing public.point_transactions%rowtype;
  changed boolean; prior_points numeric;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or e.ends_at>pg_catalog.now() or e.participation_points_per_hour_at_end is null then return awarded; end if;
  for target in select x.officer_id,x.slot_id,s.starts_at,s.ends_at
    from public.event_time_slot_officers x join public.event_time_slots s
      on s.id=x.slot_id and s.event_id=x.event_id
    where x.event_id=p_event_id and (p_officer_ids is null or x.officer_id=any(p_officer_ids))
    order by x.officer_id,x.slot_id
  loop
    changed:=false;
    if exists(select 1 from public.point_transactions p where p.event_id=p_event_id
        and p.officer_id=target.officer_id and p.award_type='participation'
        and p.event_time_slot_id is null and p.removed_at is null) then
      if p_manual_conflict='raise' then raise exception 'This Officer already has an active award for this Event.'; end if;
      continue;
    end if;
    award_points:=private.event_participation_points(target.starts_at,target.ends_at,
      1);
    select * into existing from public.point_transactions p where p.officer_id=target.officer_id
      and p.event_time_slot_id=target.slot_id and p.award_type='participation' and p.participation_superseded_at is null for update;
    if found then
      if existing.removed_at is not null and not existing.slot_selection_removed then continue; end if;
      if existing.removed_at is not null then
        update public.point_transactions set removed_at=null,removed_by=null,removed_by_officer_id=null,
          participation_schedule_suspended=false,slot_selection_removed=false
          where id=existing.id returning id into award_id;
        changed:=true;
      else award_id:=existing.id; end if;
      if existing.points is distinct from award_points and existing.updated_by is null
          and exists(select 1 from private.event_participation_basis b where b.transaction_id=existing.id
            and (b.starts_at is distinct from target.starts_at or b.ends_at is distinct from target.ends_at)) then
        prior_points:=existing.points;
        update public.point_transactions set points=award_points where id=award_id;
        changed:=true;
        perform private.write_audit_log('points.transaction_updated','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
            'officer_id',target.officer_id,'time_slot_id',target.slot_id,
            'before_points',prior_points,'after_points',award_points,'updated_by',auth.uid(),
            'update_source','slot_reconciliation'));
      end if;
    else
      insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type,created_by)
        values(target.officer_id,p_event_id,target.slot_id,award_points,'Event time slot participation','participation',null)
        returning id into award_id;
      changed:=true;
    end if;
    if changed then
      perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
        pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
          'officer_id',target.officer_id,'time_slot_id',target.slot_id,
          'scheduled_hours',extract(epoch from (target.ends_at-target.starts_at))::numeric/3600,
          'rate',1,'points',award_points,
          'reactivated',existing.removed_at is not null));
      awarded:=array_append(awarded,award_id);
    end if;
  end loop;
  return awarded;
end;
$$;

create or replace function private.bulk_add_event_officers(
  p_event_id bigint,p_officer_ids bigint[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; actor_id bigint := private.current_active_officer_id();
  requested_ids bigint[]; added_ids bigint[]; award_targets bigint[];
  awarded_ids bigint[] := '{}'::bigint[]; target_id bigint; current_rate numeric;
  award_points numeric; scheduled_hours numeric; award_id bigint; snapshot_created boolean := false;
  confirmed_count bigint; new_count bigint;
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
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active'
    order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target officers must be active'; end if;
  confirmed_count := (select count(*) from public.event_officers where event_id=p_event_id);
  new_count := (select count(*) from unnest(requested_ids) id where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=id));
  if current_event.max_volunteers is not null and confirmed_count+new_count>current_event.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  with inserted as (
    insert into public.event_officers(event_id,officer_id)
    select p_event_id,id from unnest(requested_ids) submitted(id)
    on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids from inserted;
  if current_event.ends_at<=pg_catalog.now() then
    current_rate := 1;
    if current_event.participation_points_per_hour_at_end is null then
      update public.events set participation_points_per_hour_at_end=1 where id=p_event_id;
      snapshot_created := true;
    end if;
    scheduled_hours := extract(epoch from (current_event.ends_at-current_event.starts_at))::numeric/3600;
    award_points := private.event_participation_points(current_event.starts_at,current_event.ends_at,current_rate);
    if snapshot_created then
      select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into award_targets
        from public.event_officers where event_id=p_event_id;
    else award_targets := requested_ids; end if;
    foreach target_id in array award_targets loop
      award_id := null;
      insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
      values(target_id,p_event_id,award_points,'Event participation','participation',null)
      on conflict do nothing returning id into award_id;
      if award_id is not null then
        awarded_ids := pg_catalog.array_append(awarded_ids,target_id);
        perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
          pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,'officer_id',target_id,
            'scheduled_hours',scheduled_hours,'rate',current_rate,'points',award_points));
      end if;
    end loop;
  end if;
  if cardinality(added_ids)>0 or cardinality(awarded_ids)>0 or snapshot_created then
    perform private.write_audit_log('event.officers_bulk_added','event',p_event_id::text,
      pg_catalog.jsonb_build_object('event_id',p_event_id,'actor_id',actor_id,'officer_ids',added_ids,
        'participation_awards_created',awarded_ids,'participation_rate',current_rate,
        'points_per_officer',award_points,'scheduled_hours',scheduled_hours));
  end if;
  return pg_catalog.jsonb_build_object('event_id',p_event_id,'added_officer_ids',added_ids,
    'awarded_officer_ids',awarded_ids,'rate',current_rate,'points_per_officer',award_points);
end;
$$;

create or replace function private.bulk_add_event_officers_to_slots(
  p_event_id bigint,p_officer_ids bigint[],p_slot_ids bigint[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
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
  perform 1 from public.officers where id=any(target_ids) order by id for share;
  confirmed_count:=(select count(*) from public.event_officers where event_id=p_event_id);
  new_count:=(select count(*) from unnest(target_ids) x where not exists(
    select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=x));
  if e.max_volunteers is not null and confirmed_count+new_count>e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity'; end if;
  for slot in select id,capacity from public.event_time_slots where id=any(selected_slots) order by id for update loop
    new_for_slot:=(select count(*) from unnest(target_ids) x where not exists(
      select 1 from public.event_time_slot_officers so where so.slot_id=slot.id and so.officer_id=x));
    if slot.capacity is not null and (select count(*) from public.event_time_slot_officers where slot_id=slot.id)+new_for_slot>slot.capacity then
      raise exception 'The selected Officers exceed a Time Slot capacity'; end if;
  end loop;
  with inserted as (
    insert into public.event_officers(event_id,officer_id)
      select p_event_id,x from unnest(target_ids) x on conflict(event_id,officer_id) do nothing returning officer_id
  ) select coalesce(array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids from inserted;
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

-- Confirmation is evidence supplied by an Admin for one specific removal;
-- chronology, Event identity and missing audit markers never imply intent.
create function private.confirm_premature_participation(p_transaction_id bigint,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare award public.point_transactions%rowtype; e public.events%rowtype;
 basis private.event_participation_basis%rowtype; target_event bigint;
begin
 if not private.current_is_admin() then raise exception 'Admin required'; end if;
 if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'Reason required'; end if;
 select event_id into target_event from public.point_transactions where id=p_transaction_id;
 if not found then raise exception 'Point transaction not found'; end if;
 select * into e from public.events where id=target_event for update;
 select * into award from public.point_transactions where id=p_transaction_id for update;
 select * into basis from private.event_participation_basis where transaction_id=award.id;
 if award.award_type<>'participation' or award.removed_at is null or award.slot_selection_removed
   or coalesce(basis.schedule_suspended,false) then
  raise exception 'Only an independently removed participation award can be confirmed premature';
 end if;
 if award.participation_superseded_at is not null then return false; end if;
 if award.updated_by is not null or award.updated_by_officer_id is not null then
  raise exception 'Edited automatic Points need an explicit policy decision before schedule reconciliation';
 end if;
 if e.deleted_at is not null or e.status='cancelled' then raise exception 'Event unavailable'; end if;
 if basis.transaction_id is not null and basis.starts_at=coalesce((select starts_at from public.event_time_slots where id=award.event_time_slot_id),e.starts_at)
   and basis.ends_at=coalesce((select ends_at from public.event_time_slots where id=award.event_time_slot_id),e.ends_at) then
  raise exception 'Correct the Event schedule before confirming a premature award';
 end if;
 update public.point_transactions set participation_superseded_at=pg_catalog.clock_timestamp() where id=award.id;
 perform private.write_audit_log('points.premature_participation_confirmed','point_transaction',award.id::text,
  jsonb_build_object('transaction_id',award.id,'event_id',e.id,'officer_id',award.officer_id,
   'reason',btrim(p_reason),'removed_award',to_jsonb(award),'previous_basis',to_jsonb(basis),
   'previous_basis_known',basis.transaction_id is not null,
   'corrected_starts_at',e.starts_at,'corrected_ends_at',e.ends_at));
 perform private.reconcile_event_participation(e.id);
 return true;
end;
$$;
create function public.confirm_premature_participation(p_transaction_id bigint,p_reason text)
returns boolean language sql security invoker set search_path='' as $$
 select private.confirm_premature_participation(p_transaction_id,p_reason)
$$;
revoke all on function private.confirm_premature_participation(bigint,text),
 public.confirm_premature_participation(bigint,text) from public,anon,authenticated;
grant execute on function private.confirm_premature_participation(bigint,text),
 public.confirm_premature_participation(bigint,text) to authenticated;

create or replace function private.remove_point_transaction(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_row public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  perform 1 from public.events where id=(select event_id from public.point_transactions where id=p_transaction_id) for update;
  select * into old_row from public.point_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if old_row.removed_at is not null and not exists(select 1 from private.event_participation_basis
    where transaction_id=p_transaction_id and schedule_suspended) then return false; end if;
  update private.event_participation_basis set schedule_suspended=false where transaction_id=p_transaction_id;
  update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
    removed_by=auth.uid(),removed_by_officer_id=private.current_active_officer_id(),
    participation_schedule_suspended=false where id=p_transaction_id;
  perform private.write_audit_log('points.transaction_removed','point_transaction',
    p_transaction_id::text,pg_catalog.jsonb_build_object(
      'before',pg_catalog.to_jsonb(old_row),'removed_by',auth.uid()));
  return true;
end;
$$;

create or replace function private.remove_participation_award(p_transaction_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare award public.point_transactions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  perform 1 from public.events where id=(select event_id from public.point_transactions where id=p_transaction_id) for update;
  select * into award from public.point_transactions
    where id=p_transaction_id for update;
  if not found then raise exception 'Point transaction not found'; end if;
  if award.award_type <> 'participation' then
    raise exception 'Only participation awards can be removed';
  end if;
  if award.removed_at is not null and not exists(select 1 from private.event_participation_basis
    where transaction_id=p_transaction_id and schedule_suspended) then return false; end if;
  update private.event_participation_basis set schedule_suspended=false where transaction_id=p_transaction_id;
  update public.point_transactions
    set removed_at=pg_catalog.clock_timestamp(),removed_by=auth.uid(),removed_by_officer_id=private.current_active_officer_id(),
      participation_schedule_suspended=false
    where id=p_transaction_id;
  perform private.write_audit_log('points.participation_removed',
    'point_transaction',p_transaction_id::text,pg_catalog.jsonb_build_object(
      'transaction_id',award.id,'officer_id',award.officer_id,
      'event_id',award.event_id,'points',award.points,'reason',award.reason,
      'created_at',award.created_at,'created_by',award.created_by,
      'removed_by',auth.uid()));
  return true;
end;
$$;

create or replace view public.point_history with (security_invoker=true) as
  select p.id,p.officer_id,p.event_id,p.points,p.reason,p.award_type,
    p.created_by,p.created_at,p.removed_at,p.removed_by,p.updated_at,p.updated_by,p.task_id,
    o.name as officer_name,e.name as event_name,
    creator.name as created_by_name,remover.name as removed_by_name,
    t.title as task_title,
    pg_catalog.concat_ws(' ',o.name,p.reason,e.name,t.title) as search_text,
    e.event_date as event_date,
    case
      when e.id is not null then e.event_date
      else (p.created_at at time zone 'America/Denver')::date
    end as activity_date,
    p.created_by_officer_id,p.updated_by_officer_id,p.removed_by_officer_id,
    updater.name as updated_by_name,p.participation_superseded_at,
    (p.removed_at is not null and not p.slot_selection_removed and p.award_type='participation'
      and p.participation_superseded_at is null
      and (p.removed_by is not null or p.removed_by_officer_id is not null)) as premature_confirmation_available
  from public.point_transactions p
  join public.officers o on o.id=p.officer_id
  left join public.events e on e.id=p.event_id
  left join public.tasks t on t.id=p.task_id
  left join public.officers creator on creator.id=p.created_by_officer_id
    or (p.created_by_officer_id is null and creator.auth_user_id=p.created_by)
  left join public.officers remover on remover.id=p.removed_by_officer_id
    or (p.removed_by_officer_id is null and remover.auth_user_id=p.removed_by)
  left join public.officers updater on updater.id=p.updated_by_officer_id
    or (p.updated_by_officer_id is null and updater.auth_user_id=p.updated_by);
