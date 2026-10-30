-- A missing basis is expected for participation rows created before the basis
-- table existed. A source correction supplies the current basis; it cannot
-- reconstruct the schedule that originally produced the historical amount.
create or replace function private.reconcile_event_participation(p_event_id bigint,p_source_changed boolean default false)
returns bigint[] language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
 basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
 changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean;
 basis_missing boolean;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.deleted_at is not null or e.status='cancelled' then return changed; end if;
 if e.ends_at>pg_catalog.now() then
  for award in select p.* from public.point_transactions p where p.event_id=p_event_id
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
   basis_missing:=not found;
   if award.removed_at is not null and not coalesce(basis.schedule_suspended,false)
      and not award.slot_selection_removed then continue; end if;
   -- Existing history is not repriced by retries. A source correction may
   -- replace an edited amount and establish current basis without guessing the
   -- unknown schedule behind a legacy transaction.
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
revoke all on function private.reconcile_event_participation(bigint,boolean) from public,anon,authenticated;
