-- Issue #402: distinguish Volunteer/Attendee signups and connect one-point
-- deductions to automatic, auditable Warnings.

alter table public.event_officers
  add column participation_type text not null default 'volunteer'
    constraint event_officers_participation_type_check
    check (participation_type in ('volunteer','attendee'));
alter table public.events add column participation_rate_version text not null default 'legacy'
  constraint events_participation_rate_version_check
  check (participation_rate_version in ('legacy','volunteer_attendee'));

-- Preserve the one/hour behavior used by existing reconciliation paths while
-- allowing new callers to select the accepted Volunteer/Attendee rate.
create or replace function private.event_participation_points(
  p_starts_at timestamptz,p_ends_at timestamptz,p_rate numeric
) returns numeric language sql immutable security invoker set search_path = '' as $$
  select extract(epoch from (p_ends_at-p_starts_at))::numeric/3600*p_rate
$$;

-- Rate marker 1 denotes legacy one/hour Events; marker 2 denotes the new
-- Volunteer/Attendee model. Reconciliation preserves that distinction.
create or replace function private.reconcile_event_participation(
  p_event_id bigint,p_source_changed boolean default false
) returns bigint[] language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; target record; award public.point_transactions%rowtype;
  basis private.event_participation_basis%rowtype; amount numeric; award_id bigint;
  changed bigint[]:='{}'::bigint[]; prior_points numeric; was_removed boolean; rate numeric;
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
        pg_catalog.jsonb_build_object('transaction_id',award.id,'event_id',e.id,'before',pg_catalog.to_jsonb(award),
          'previous_basis_known',not basis_missing,
          'previous_basis',case when basis_missing then null else pg_catalog.to_jsonb(basis) end,
          'corrected_starts_at',e.starts_at,'corrected_ends_at',e.ends_at,'suspension_source','schedule_correction'));
    end loop;
    return changed;
  end if;
  update public.events set participation_points_per_hour_at_end=coalesce(participation_points_per_hour_at_end,2),
    participation_rate_version=case when participation_points_per_hour_at_end is null
      then 'volunteer_attendee' else participation_rate_version end
    where id=e.id and participation_points_per_hour_at_end is null;
  if e.participation_points_per_hour_at_end is null then e.participation_rate_version:='volunteer_attendee'; end if;
  for target in
    select eo.officer_id,null::bigint slot_id,e.starts_at,e.ends_at,eo.participation_type
      from public.event_officers eo where eo.event_id=e.id and eo.removed_at is null
        and not exists(select 1 from public.event_time_slots s where s.event_id=e.id)
    union all
    select x.officer_id,s.id,s.starts_at,s.ends_at,'volunteer'::text
      from public.event_time_slot_officers x join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id
      join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id and eo.removed_at is null
      where x.event_id=e.id
    order by officer_id,slot_id nulls first
  loop
    rate:=case when e.participation_rate_version='volunteer_attendee'
      then case target.participation_type when 'volunteer' then 2 else 1 end else 1 end;
    amount:=private.event_participation_points(target.starts_at,target.ends_at,rate);
    select * into award from public.point_transactions p where p.event_id=e.id and p.officer_id=target.officer_id
      and p.award_type='participation' and p.event_time_slot_id is not distinct from target.slot_id
      and p.participation_superseded_at is null for update;
    if not found then
      insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type)
        values(target.officer_id,e.id,target.slot_id,amount,
          case when target.slot_id is null then 'Event participation' else 'Event time slot participation' end,'participation')
        returning id into award_id;
      perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
        pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',e.id,'officer_id',target.officer_id,
          'time_slot_id',target.slot_id,'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,
          'scheduled_hours',extract(epoch from(target.ends_at-target.starts_at))::numeric/3600,
          'rate',rate,'participation_type',target.participation_type,'points',amount,
          'supersedes_transaction_id',(select max(p.id) from public.point_transactions p
            where p.event_id=e.id and p.officer_id=target.officer_id
              and p.event_time_slot_id is not distinct from target.slot_id and p.participation_superseded_at is not null)));
      changed:=pg_catalog.array_append(changed,award_id);
    else
      select * into basis from private.event_participation_basis where transaction_id=award.id;
      basis_missing:=not found;
      if award.removed_at is not null and not coalesce(basis.schedule_suspended,false)
          and not award.slot_selection_removed then continue; end if;
      if p_source_changed or coalesce(basis.schedule_suspended,false) or award.slot_selection_removed then
        prior_points:=award.points; was_removed:=award.removed_at is not null;
        update public.point_transactions set points=amount,removed_at=null,removed_by=null,removed_by_officer_id=null,
          participation_schedule_suspended=false,slot_selection_removed=false where id=award.id;
        insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
          values(award.id,target.starts_at,target.ends_at,false)
          on conflict(transaction_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,schedule_suspended=false;
        if prior_points is distinct from amount or was_removed or basis_missing then
          perform private.write_audit_log('points.participation_reconciled','point_transaction',award.id::text,
            pg_catalog.jsonb_build_object('transaction_id',award.id,'event_id',e.id,'officer_id',award.officer_id,
              'before_points',prior_points,'after_points',amount,
              'previous_basis_known',not basis_missing,
              'previous_basis',case when basis_missing then null else pg_catalog.to_jsonb(basis) end,
              'basis_starts_at',target.starts_at,'basis_ends_at',target.ends_at,'rate',rate,
              'participation_type',target.participation_type,'reactivated',was_removed));
          changed:=pg_catalog.array_append(changed,award.id);
        end if;
      end if;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function private.reconcile_event_participation(bigint,boolean) from public,anon,authenticated;

create function private.award_new_finished_event_time_slots(p_event_id bigint)
returns bigint[] language plpgsql security definer set search_path = '' as $$
declare target record; award_id bigint; awarded bigint[]:='{}'::bigint[]; amount numeric;
begin
  for target in select x.officer_id,x.slot_id,s.starts_at,s.ends_at from public.event_time_slot_officers x
    join public.event_time_slots s on s.id=x.slot_id and s.event_id=x.event_id
    join public.event_officers eo on eo.event_id=x.event_id and eo.officer_id=x.officer_id and eo.removed_at is null
    where x.event_id=p_event_id order by x.officer_id,x.slot_id
  loop
    amount:=private.event_participation_points(target.starts_at,target.ends_at,2);
    award_id:=null;
    insert into public.point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type,created_by)
      values(target.officer_id,p_event_id,target.slot_id,amount,'Event time slot participation','participation',null)
      on conflict do nothing returning id into award_id;
    if award_id is not null then
      awarded:=pg_catalog.array_append(awarded,award_id);
      perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
        pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',p_event_id,
          'officer_id',target.officer_id,'time_slot_id',target.slot_id,'participation_type','volunteer',
          'scheduled_hours',extract(epoch from(target.ends_at-target.starts_at))::numeric/3600,
          'rate',2,'points',amount));
    end if;
  end loop;
  return awarded;
end;
$$;
revoke all on function private.award_new_finished_event_time_slots(bigint) from public,anon,authenticated;

alter table public.point_transactions
  drop constraint point_transactions_points_check,
  add constraint point_transactions_points_check check (
    points <> 0 and points not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
  ),
  drop constraint point_transactions_award_type_check,
  add constraint point_transactions_award_type_check
    check (award_type in ('participation','task','manual','correction','negative')),
  drop constraint task_award_shape_check,
  add column if not exists task_id bigint references public.tasks(id) on delete restrict,
  add constraint task_award_shape_check check (
    (award_type='task' and task_id is not null and event_id is null and points > 0)
    or (award_type<>'task' and task_id is null)
    or (award_type in ('manual','correction','negative') and task_id is not null and event_id is null)
  ),
  add constraint negative_point_shape_check check (
    (award_type='negative' and points<0)
    or (award_type<>'negative' and true)
  ),
  add constraint participation_positive_check check (
    award_type not in ('participation') or points > 0
  );

alter table public.officer_warnings
  add column origin text not null default 'manual'
    constraint officer_warnings_origin_check check (origin in ('manual','automatic'));

create table public.automatic_warning_point_links (
  warning_id bigint not null references public.officer_warnings(id) on delete cascade,
  point_transaction_id bigint not null references public.point_transactions(id) on delete restrict,
  released_at timestamptz,
  primary key (warning_id,point_transaction_id)
);
create unique index automatic_warning_point_links_one_active_group_idx
  on public.automatic_warning_point_links(point_transaction_id) where released_at is null;
alter table public.automatic_warning_point_links enable row level security;
revoke all on public.automatic_warning_point_links from public,anon,authenticated;
grant select on public.automatic_warning_point_links to authenticated;
create policy automatic_warning_point_links_admin_read on public.automatic_warning_point_links
  for select to authenticated using ((select private.current_is_admin()));

create or replace function private.create_automatic_warnings_for_officer(p_officer_id bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  point_ids bigint[];
  created_warning_id bigint;
  created_count integer := 0;
begin
  if pg_catalog.current_setting('cappy.seed_loading',true)='on'
    or pg_catalog.current_setting('cappy.warning_points_mutation',true)='on' then
    return 0;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('warning.threshold:'||p_officer_id::text,91));
  perform 1 from public.officers where id=p_officer_id for update;
  loop
    exit when (select count(*) from public.officer_warnings w where w.officer_id=p_officer_id
      and w.status='approved' and w.voided_at is null and w.deleted_at is null) >= 3;
    select pg_catalog.array_agg(candidate.id order by candidate.created_at,candidate.id)
      into point_ids
    from (select p.id,p.created_at from public.point_transactions p
      where p.officer_id=p_officer_id and p.award_type='negative'
        and p.removed_at is null
        and not exists(select 1 from public.automatic_warning_point_links l
          where l.point_transaction_id=p.id and l.released_at is null)
      order by p.created_at,p.id limit 3) candidate;
    exit when coalesce(cardinality(point_ids),0) < 3;
    insert into public.officer_warnings(officer_id,reason,status,origin)
      values(p_officer_id,'Three active negative Points','approved','automatic')
      returning id into created_warning_id;
    insert into public.automatic_warning_point_links(warning_id,point_transaction_id)
      select created_warning_id,unnest(point_ids);
    perform private.write_audit_log('warning.automatic_created','warning',created_warning_id::text,
      pg_catalog.jsonb_build_object('warning_id',created_warning_id,'officer_id',p_officer_id,
        'negative_point_ids',point_ids,'origin','automatic'));
    created_count := created_count+1;
  end loop;
  return created_count;
end;
$$;
revoke all on function private.create_automatic_warnings_for_officer(bigint) from public,anon,authenticated;

create function private.negative_point_grouping_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  group_warning_id bigint;
  actor_id bigint := private.current_active_officer_id();
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  if pg_catalog.current_setting('cappy.seed_loading',true)='on'
    or pg_catalog.current_setting('cappy.warning_points_mutation',true)='on' then
    return new;
  end if;
  if tg_op='INSERT' then
    if new.award_type='negative' and new.removed_at is null then
      perform private.create_automatic_warnings_for_officer(new.officer_id);
    end if;
    return new;
  end if;
  if new.award_type='negative' and old.removed_at is null and new.removed_at is not null then
    select l.warning_id into group_warning_id
      from public.automatic_warning_point_links l
      join public.officer_warnings w on w.id=l.warning_id
      where l.point_transaction_id=new.id and l.released_at is null
        and w.origin='automatic' and w.deleted_at is null and w.voided_at is null
      for update of w;
    if group_warning_id is not null then
      update public.officer_warnings set deleted_at=now_at,deleted_by=coalesce(actor_id,deleted_by)
        where id=group_warning_id;
      update public.automatic_warning_point_links set released_at=now_at
        where warning_id=group_warning_id and released_at is null;
      perform private.write_audit_log('warning.automatic_removed_with_point','warning',group_warning_id::text,
        pg_catalog.jsonb_build_object('warning_id',group_warning_id,'officer_id',new.officer_id,
          'removed_point_id',new.id));
    end if;
  elsif new.award_type='negative' and old.removed_at is not null and new.removed_at is null then
    perform private.create_automatic_warnings_for_officer(new.officer_id);
  end if;
  return new;
end;
$$;
revoke all on function private.negative_point_grouping_trigger() from public,anon,authenticated;
create trigger negative_point_grouping
  after insert or update of removed_at on public.point_transactions
  for each row execute function private.negative_point_grouping_trigger();

create or replace function private.add_negative_point(
  p_officer_id bigint,p_event_id bigint default null,p_task_id bigint default null,p_reason text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if not exists(select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active';
  end if;
  if p_event_id is not null and p_task_id is not null then
    raise exception 'A negative Point can link to an Event or a Task, not both';
  end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'Reason required'; end if;
  if p_event_id is not null and not exists(select 1 from public.events where id=p_event_id) then
    raise exception 'Event not found';
  end if;
  if p_task_id is not null and not exists(select 1 from public.tasks where id=p_task_id) then
    raise exception 'Task not found';
  end if;
  insert into public.point_transactions(officer_id,event_id,task_id,points,reason,award_type,created_by)
    values(p_officer_id,p_event_id,p_task_id,-1,pg_catalog.btrim(p_reason),'negative',auth.uid())
    returning id into saved_id;
  perform private.write_audit_log('points.negative_created','point_transaction',saved_id::text,
    pg_catalog.jsonb_build_object('transaction_id',saved_id,'officer_id',p_officer_id,
      'event_id',p_event_id,'task_id',p_task_id,'points',-1,'reason',pg_catalog.btrim(p_reason)));
  return saved_id;
end;
$$;
revoke all on function private.add_negative_point(bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function private.add_negative_point(bigint,bigint,bigint,text) to authenticated;
create function public.add_negative_point(p_officer_id bigint,p_event_id bigint default null,
  p_task_id bigint default null,p_reason text default null)
returns bigint language sql security invoker set search_path = '' as $$
  select private.add_negative_point($1,$2,$3,$4)
$$;
revoke all on function public.add_negative_point(bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.add_negative_point(bigint,bigint,bigint,text) to authenticated;

create or replace function private.create_warning(p_officer_id bigint,p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; target public.officers;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'Warning reason is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warning.threshold:'||p_officer_id::text,91));
  select * into target from public.officers where id=p_officer_id for update;
  if not found then raise exception 'Officer not found'; end if;
  if (select count(*) from public.officer_warnings w where w.officer_id=p_officer_id
      and w.status='approved' and w.voided_at is null and w.deleted_at is null) >= 3 then
    raise exception 'Officer already has 3 active Warnings';
  end if;
  insert into public.officer_warnings(officer_id,reason,status,origin)
    values(p_officer_id,pg_catalog.btrim(p_reason),'approved','manual') returning id into saved_id;
  perform private.write_audit_log('warning.created','warning',saved_id::text,
    pg_catalog.jsonb_build_object('warning_id',saved_id,'officer_id',p_officer_id,
      'officer_name',target.name,'reason',pg_catalog.btrim(p_reason),'status','approved',
      'management','direct_admin','origin','manual'));
  return saved_id;
end;
$$;

-- The #403 notice threshold follows the active Warning definition: approved,
-- not voided, and not deleted. Pending/rejected legacy rows do not count.
create or replace function private.notify_warning_changes() returns trigger
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
  perform private.create_notification(target_id,
    'warning.changed',
    case when tg_op='DELETE' or new.voided_at is not null or new.deleted_at is not null
      then 'Warning removed' else 'Warning updated' end,
    case when tg_op='DELETE' or new.voided_at is not null or new.deleted_at is not null
      then 'A Warning was removed from your record.' else 'A Warning on your record changed.' end,
    'warning',warning_id,'/officers/'||target_id,'important',key||':'||target_id);
  if (tg_op='INSERT' or tg_op='UPDATE') and new.status='approved'
    and new.voided_at is null and new.deleted_at is null
    and (tg_op='INSERT' or old.status<>'approved' or old.voided_at is not null or old.deleted_at is not null) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('warning.threshold:'||target_id::text,91));
    if tg_op='INSERT' then
      select count(*) filter (where w.status='approved'),
        count(*) filter (where w.status='approved' and w.id<new.id)
        into count_active,prior_active from public.officer_warnings w
        where w.officer_id=target_id and w.voided_at is null and w.deleted_at is null;
    else
      select count(*) filter (where w.status='approved'),
        count(*) filter (where w.status='approved' and w.id<>new.id)
        into count_active,prior_active from public.officer_warnings w
        where w.officer_id=target_id and w.voided_at is null and w.deleted_at is null;
    end if;
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

create or replace function private.delete_warning(p_warning_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare warning public.officer_warnings; actor_id bigint:=private.current_active_officer_id();
  delete_time timestamptz:=pg_catalog.clock_timestamp(); point_ids bigint[];
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if actor_id is null then raise exception 'Active Admin required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warning.threshold:'||
    (select w.officer_id::text from public.officer_warnings w where w.id=p_warning_id),91));
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found then raise exception 'Warning not found'; end if;
  if warning.deleted_at is not null then raise exception 'Warning is already deleted'; end if;
  select coalesce(pg_catalog.array_agg(point_transaction_id order by point_transaction_id),'{}'::bigint[])
    into point_ids from public.automatic_warning_point_links
    where warning_id=p_warning_id and released_at is null;
  update public.officer_warnings set deleted_at=delete_time,deleted_by=actor_id where id=p_warning_id;
  if warning.origin='automatic' then
    perform pg_catalog.set_config('cappy.warning_points_mutation','on',true);
    update public.point_transactions set removed_at=delete_time,removed_by=auth.uid(),
      removed_by_officer_id=actor_id where id=any(point_ids) and removed_at is null;
    update public.automatic_warning_point_links set released_at=delete_time
      where warning_id=p_warning_id and released_at is null;
    perform pg_catalog.set_config('cappy.warning_points_mutation','off',true);
  end if;
  perform private.write_audit_log('warning.deleted','warning',p_warning_id::text,
    pg_catalog.jsonb_build_object('warning_id',p_warning_id,'officer_id',warning.officer_id,
      'status',warning.status,'origin',warning.origin,'actor_officer_id',actor_id,
      'deleted_at',delete_time,'negative_point_ids',point_ids));
end;
$$;

-- Restoring a deleted automatic Warning is safe only while its original three
-- Points remain removed and are not part of a newer active Warning.
create or replace function private.restore_warning(p_warning_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare warning public.officer_warnings; actor_id bigint:=private.current_active_officer_id();
  restore_time timestamptz:=pg_catalog.clock_timestamp(); point_ids bigint[];
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if actor_id is null then raise exception 'Active Admin required'; end if;
  select * into warning from public.officer_warnings where id=p_warning_id;
  if not found then raise exception 'Warning not found'; end if;
  if warning.deleted_at is null then raise exception 'Warning is not deleted'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warning.threshold:'||warning.officer_id::text,91));
  select * into warning from public.officer_warnings where id=p_warning_id for update;
  if not found or warning.deleted_at is null then raise exception 'Warning is not deleted'; end if;
  if warning.status='approved' and warning.voided_at is null
     and (select count(*) from public.officer_warnings w where w.officer_id=warning.officer_id
      and w.status='approved' and w.voided_at is null and w.deleted_at is null) >= 3 then
    raise exception 'Officer already has 3 active Warnings';
  end if;
  select coalesce(pg_catalog.array_agg(l.point_transaction_id order by l.point_transaction_id),'{}'::bigint[])
    into point_ids from public.automatic_warning_point_links l
    where l.warning_id=p_warning_id and l.released_at is not null
      and not exists(select 1 from public.automatic_warning_point_links active
        where active.point_transaction_id=l.point_transaction_id and active.released_at is null);
  if warning.origin='automatic' and cardinality(point_ids)<>3 then
    raise exception 'This automatic Warning can no longer be restored because its linked Points have changed';
  end if;
  update public.officer_warnings set deleted_at=null,deleted_by=null where id=p_warning_id;
  if warning.origin='automatic' then
    perform pg_catalog.set_config('cappy.warning_points_mutation','on',true);
    update public.point_transactions set removed_at=null,removed_by=null,removed_by_officer_id=null
      where id=any(point_ids);
    update public.automatic_warning_point_links set released_at=null
      where warning_id=p_warning_id and point_transaction_id=any(point_ids);
    perform pg_catalog.set_config('cappy.warning_points_mutation','off',true);
  end if;
  perform private.write_audit_log('warning.restored','warning',p_warning_id::text,
    pg_catalog.jsonb_build_object('warning_id',p_warning_id,'officer_id',warning.officer_id,
      'status',warning.status,'origin',warning.origin,'actor_officer_id',actor_id,
      'deleted_at',warning.deleted_at,'deleted_by',warning.deleted_by,'restored_at',restore_time,
      'negative_point_ids',point_ids));
end;
$$;

-- The existing notification trigger on officer_warnings owns #403 delivery.
-- Event rates are selected by signup type only for future processing. The
-- event snapshot field remains historical evidence and is not rewritten.
create or replace function private.process_finished_events() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  finished_event public.events%rowtype; signup record; award_id bigint;
  award_points numeric; award_count integer; event_count integer:=0;
  slot_awards bigint[];
begin
  for finished_event in select * from public.events
    where status<>'cancelled' and deleted_at is null and ends_at<=pg_catalog.now()
      and participation_points_per_hour_at_end is null
    order by id for update skip locked
  loop
    update public.events set participation_points_per_hour_at_end=2,
      participation_rate_version='volunteer_attendee' where id=finished_event.id;
    award_count:=0;
    if exists(select 1 from public.event_time_slots where event_id=finished_event.id) then
      slot_awards:=private.award_new_finished_event_time_slots(finished_event.id);
      award_count:=cardinality(slot_awards);
    else
      for signup in select officer_id,participation_type from public.event_officers
        where event_id=finished_event.id and removed_at is null order by officer_id
      loop
        award_points:=private.event_participation_points(finished_event.starts_at,finished_event.ends_at,
          case signup.participation_type when 'volunteer' then 2 else 1 end);
        award_id:=null;
        insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
          values(signup.officer_id,finished_event.id,award_points,'Event participation','participation',null)
          on conflict do nothing returning id into award_id;
        if award_id is not null then
          award_count:=award_count+1;
          perform private.write_audit_log('points.participation_created','point_transaction',award_id::text,
            pg_catalog.jsonb_build_object('transaction_id',award_id,'event_id',finished_event.id,
              'officer_id',signup.officer_id,'participation_type',signup.participation_type,
              'scheduled_hours',extract(epoch from (finished_event.ends_at-finished_event.starts_at))::numeric/3600,
              'rate',case signup.participation_type when 'volunteer' then 2 else 1 end,
              'points',award_points));
        end if;
      end loop;
    end if;
    perform private.write_audit_log('event.participation_processed','event',finished_event.id::text,
      pg_catalog.jsonb_build_object('awards_created',award_count,'participation_rate','volunteer:2,attendee:1'));
    event_count:=event_count+1;
  end loop;
  return event_count;
end;
$$;

create or replace function public.academic_period_point_summary(p_period_id bigint)
returns table(net_points numeric, ranking jsonb)
language sql stable security invoker set search_path = '' as $$
  with selected_period as (
    select starts_on,ends_on from public.academic_periods where id=p_period_id
  ), officer_totals as (
    select h.officer_id,h.officer_name,
      coalesce(pg_catalog.sum(h.points) filter(where h.points>0),0::numeric) as normal_points,
      coalesce(-pg_catalog.sum(h.points) filter(where h.points<0),0::numeric) as negative_points,
      coalesce(pg_catalog.sum(h.points),0::numeric) as points
    from public.point_history h cross join selected_period p
    where h.activity_date between p.starts_on and p.ends_on and h.removed_at is null
    group by h.officer_id,h.officer_name
  )
  select coalesce((select pg_catalog.sum(t.points) from officer_totals t),0::numeric),
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'officer_id',t.officer_id,'officer_name',t.officer_name,'points',t.points,
      'normal_points',t.normal_points,'negative_points',t.negative_points
    ) order by t.points desc,t.officer_name) from officer_totals t),'[]'::jsonb)
$$;

-- The existing summary RPC is part of the authenticated product boundary.
revoke all on function public.academic_period_point_summary(bigint) from public,anon;
grant execute on function public.academic_period_point_summary(bigint) to authenticated;

-- Change signup only through the trusted existing RPC. A Time Slot signup is
-- always a Volunteer; regular signup switches atomically between the choices.
drop function public.change_event_signup(bigint,bigint,boolean);
drop function private.change_event_signup(bigint,bigint,boolean);
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
  manager:=private.can_manage_event(p_event_id);
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
revoke all on function private.change_event_signup(bigint,bigint,boolean,text) from public,anon,authenticated;
grant execute on function private.change_event_signup(bigint,bigint,boolean,text) to authenticated;
create or replace function public.change_event_signup(
  p_event_id bigint,p_officer_id bigint,p_remove boolean,p_participation_type text
) returns boolean language sql security invoker set search_path = '' as $$
  select private.change_event_signup($1,$2,$3,$4)
$$;
revoke all on function public.change_event_signup(bigint,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.change_event_signup(bigint,bigint,boolean,text) to authenticated;

create function public.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean default false)
returns void language sql security invoker set search_path = '' as $$
  select public.change_event_signup($1,$2,$3,'volunteer')
$$;
revoke all on function public.change_event_signup(bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.change_event_signup(bigint,bigint,boolean) to authenticated;

-- Existing Time Slot helpers call the private three-argument form; preserve
-- that internal contract and make those signups Volunteers by definition.
create function private.change_event_signup(p_event_id bigint,p_officer_id bigint,p_remove boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare result boolean;
begin
  perform pg_catalog.set_config('cappy.time_slot_signup','on',true);
  result:=private.change_event_signup($1,$2,$3,'volunteer');
  perform pg_catalog.set_config('cappy.time_slot_signup','off',true);
  return result;
end;
$$;
revoke all on function private.change_event_signup(bigint,bigint,boolean) from public,anon,authenticated;

-- Manager-added unslotted signups select the same participation type as a
-- self-signup. Preserve the established two-argument internal helper used by
-- Time Slot operations above.
create function private.bulk_add_event_officers(
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
    raise exception 'Select at least one valid Officer';
  end if;
  select pg_catalog.array_agg(id order by id) into requested_ids
    from (select distinct unnest(p_officer_ids) id) submitted;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if e.deleted_at is not null or e.status='cancelled' then raise exception 'This Event cannot accept signups'; end if;
  if e.participation_points_per_hour_at_end is not null and e.ends_at>pg_catalog.now() then
    raise exception 'Signups are closed for this Event';
  end if;
  perform o.id from public.officers o where o.id=any(requested_ids) and o.status='active' order by o.id for share;
  if (select count(*) from public.officers o where o.id=any(requested_ids) and o.status='active')<>cardinality(requested_ids) then
    raise exception 'All target Officers must be active';
  end if;
  if e.max_volunteers is not null and
    (select count(*) from public.event_officers eo where eo.event_id=p_event_id and eo.removed_at is null)
      +(select count(*) from unnest(requested_ids) id where not exists(
        select 1 from public.event_officers eo where eo.event_id=p_event_id and eo.officer_id=id and eo.removed_at is null))
      >e.max_volunteers then
    raise exception 'The selected Officers exceed the Event capacity';
  end if;
  with inserted as (
    insert into public.event_officers(event_id,officer_id,participation_type)
    select p_event_id,id,p_participation_type from unnest(requested_ids) submitted(id)
    on conflict(event_id,officer_id) do update set participation_type=excluded.participation_type,
      removed_at=null
    where public.event_officers.removed_at is not null
    returning officer_id
  ) select coalesce(pg_catalog.array_agg(officer_id order by officer_id),'{}'::bigint[]) into added_ids from inserted;
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
revoke all on function private.bulk_add_event_officers(bigint,bigint[],text) from public,anon,authenticated;
grant execute on function private.bulk_add_event_officers(bigint,bigint[],text) to authenticated;
create function public.bulk_add_event_officers(p_event_id bigint,p_officer_ids bigint[],p_participation_type text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.bulk_add_event_officers($1,$2,$3)
$$;
revoke all on function public.bulk_add_event_officers(bigint,bigint[],text) from public,anon,authenticated;
grant execute on function public.bulk_add_event_officers(bigint,bigint[],text) to authenticated;
