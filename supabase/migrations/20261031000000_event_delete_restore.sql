-- New Event deletion suspends only currently active linked Points. Existing
-- archived Events and their historical Point meaning are left untouched.
alter table public.events
  add column delete_points_suspended boolean not null default false,
  add constraint events_delete_points_suspension_check check (
    not delete_points_suspended or deleted_at is not null
  );

alter table public.point_transactions
  add column event_delete_suspended boolean not null default false,
  add constraint point_transactions_event_delete_suspension_check check (
    not event_delete_suspended or (event_id is not null and removed_at is not null)
  );

create function private.delete_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events%rowtype;
  point_row public.point_transactions%rowtype;
  actor_id bigint := private.current_active_officer_id();
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if event_row.deleted_at is not null then return false; end if;

  update public.events set deleted_at=pg_catalog.clock_timestamp(),deleted_by=auth.uid(),
    delete_points_suspended=true where id=p_event_id;

  for point_row in
    select * from public.point_transactions
    where event_id=p_event_id and removed_at is null order by id for update
  loop
    update public.point_transactions set removed_at=pg_catalog.clock_timestamp(),
      removed_by=auth.uid(),removed_by_officer_id=actor_id,event_delete_suspended=true
      where id=point_row.id;
    perform private.write_audit_log('points.event_delete_suspended','point_transaction',point_row.id::text,
      pg_catalog.jsonb_build_object('transaction_id',point_row.id,'event_id',p_event_id,
        'officer_id',point_row.officer_id,'before',pg_catalog.to_jsonb(point_row),
        'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=point_row.id)));
  end loop;

  perform private.write_audit_log('event.deleted','event',p_event_id::text,
    pg_catalog.jsonb_build_object('before',pg_catalog.to_jsonb(event_row),
      'after',(select pg_catalog.to_jsonb(e) from public.events e where id=p_event_id),
      'signup_count',(select count(*) from public.event_officers where event_id=p_event_id),
      'time_slot_count',(select count(*) from public.event_time_slots where event_id=p_event_id),
      'point_count',(select count(*) from public.point_transactions where event_id=p_event_id),
      'suspended_point_count',(select count(*) from public.point_transactions
        where event_id=p_event_id and event_delete_suspended)));
  return true;
end;
$$;

create function public.delete_event(p_event_id bigint) returns boolean
language sql security invoker set search_path = '' as $$
  select private.delete_event(p_event_id)
$$;

create function private.restore_deleted_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events%rowtype;
  point_row public.point_transactions%rowtype;
  actor_id bigint := private.current_active_officer_id();
  suspended_point_count integer := 0;
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;
  select * into event_row from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not private.can_manage_event(p_event_id) then raise exception 'Event outside branch scope'; end if;
  if event_row.deleted_at is null then return; end if;

  update public.events set deleted_at=null,deleted_by=null,delete_points_suspended=false
    where id=p_event_id;

  if event_row.delete_points_suspended then
    for point_row in
      select * from public.point_transactions
      where event_id=p_event_id and event_delete_suspended order by id for update
    loop
      update public.point_transactions set removed_at=null,removed_by=null,
        removed_by_officer_id=null,event_delete_suspended=false where id=point_row.id;
      suspended_point_count:=suspended_point_count+1;
      perform private.write_audit_log('points.event_delete_restored','point_transaction',point_row.id::text,
        pg_catalog.jsonb_build_object('transaction_id',point_row.id,'event_id',p_event_id,
          'officer_id',point_row.officer_id,'before',pg_catalog.to_jsonb(point_row),
          'after',(select pg_catalog.to_jsonb(p) from public.point_transactions p where id=point_row.id)));
    end loop;

    -- Reconcile against the preserved roster and current schedule. The
    -- reconciler does not revive independently removed awards.
    if event_row.status<>'cancelled' then
      perform private.reconcile_event_participation(p_event_id);
    end if;
  end if;

  perform private.write_audit_log('event.restored','event',p_event_id::text,
    pg_catalog.jsonb_build_object('name',event_row.name,'event_date',event_row.event_date,
      'status',event_row.status,'recurrence_series_id',event_row.recurrence_series_id,
      'recurrence_key',event_row.recurrence_key,'deleted_at',event_row.deleted_at,
      'deleted_by',event_row.deleted_by,'suspended_point_count',suspended_point_count,
      'legacy_archive',not event_row.delete_points_suspended));
end;
$$;

create function public.restore_deleted_event(p_event_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_deleted_event(p_event_id)
$$;

-- Serialize new manual/correction credit with Event deletion so a transaction
-- cannot be inserted after Delete has suspended the existing linked Points.
create or replace function private.add_manual_transaction(
  p_officer_id bigint,p_event_id bigint,p_points numeric,p_reason text,p_award_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  saved_transaction_id bigint;
  event_row public.events%rowtype;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if not exists (select 1 from public.officers where id=p_officer_id and status='active') then
    raise exception 'Target officer is not active';
  end if;
  if p_award_type not in ('manual','correction') or p_award_type is null then
    raise exception 'Invalid award type'; end if;
  if p_points is null or p_points=0 or
    p_points in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Invalid point value'; end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'Reason required'; end if;
  if p_event_id is not null then
    select * into event_row from public.events where id=p_event_id for update;
    if found and event_row.deleted_at is not null then
      raise exception 'Deleted Events cannot receive Point transactions';
    end if;
  end if;
  insert into public.point_transactions(officer_id,event_id,points,reason,award_type,created_by)
    values(p_officer_id,p_event_id,p_points,trim(p_reason),p_award_type,auth.uid())
    returning id into saved_transaction_id;
  perform private.write_audit_log(
    case when p_award_type='correction' then 'points.correction_created'
      else 'points.manual_created' end,
    'point_transaction',saved_transaction_id::text,
    pg_catalog.jsonb_build_object('officer_id',p_officer_id,'event_id',p_event_id,
      'points',p_points,'award_type',p_award_type,'reason',trim(p_reason)));
end;
$$;

-- Keep the established RPC usable for existing callers while routing restore
-- through the compatibility-aware implementation.
create or replace function private.restore_event_archive(p_event_id bigint) returns void
language sql security definer set search_path = '' as $$
  select private.restore_deleted_event(p_event_id)
$$;
create or replace function public.restore_event_archive(p_event_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.restore_deleted_event(p_event_id)
$$;

revoke all on function private.delete_event(bigint),public.delete_event(bigint),
  private.restore_deleted_event(bigint),public.restore_deleted_event(bigint),
  private.restore_event_archive(bigint),public.restore_event_archive(bigint)
  from public,anon,authenticated;
grant execute on function private.delete_event(bigint),private.restore_deleted_event(bigint)
  to authenticated;
grant execute on function public.delete_event(bigint),public.restore_deleted_event(bigint),
  public.restore_event_archive(bigint) to authenticated;
