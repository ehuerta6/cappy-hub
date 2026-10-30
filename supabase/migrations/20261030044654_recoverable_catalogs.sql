-- Recoverable removal reuses existing catalog availability states. Legacy
-- retired/unavailable rows keep their IDs and history; no intent is backfilled.
alter table public.event_locations add column is_active boolean not null default true;

create or replace function private.delete_branch(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.branches;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if old_row.is_active is distinct from false then
    update public.branches set is_active=false where id=p_id;
    perform private.write_audit_log('branch.deleted','branch',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.branches r where id=p_id)));
  end if;
end;
$$;

create or replace function private.restore_branch(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.branches;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if old_row.is_active is distinct from true then
    update public.branches set is_active=true where id=p_id;
    perform private.write_audit_log('branch.restored','branch',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.branches r where id=p_id)));
  end if;
end;
$$;
create function public.restore_branch(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.restore_branch(p_id)$$;
revoke all on function private.restore_branch(bigint),public.restore_branch(bigint) from public,anon,authenticated;
grant execute on function private.restore_branch(bigint),public.restore_branch(bigint) to authenticated;

create or replace function private.delete_position(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.positions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_row.code) then raise exception 'Required positions cannot be deleted'; end if;
  if old_row.is_active is distinct from false then
    update public.positions set is_active=false where id=p_id;
    perform private.write_audit_log('position.deleted','position',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.positions r where id=p_id)));
  end if;
end;
$$;

create or replace function private.restore_position(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.positions;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_row.code) then raise exception 'Required positions cannot be deleted'; end if;
  if old_row.is_active is distinct from true then
    update public.positions set is_active=true where id=p_id;
    perform private.write_audit_log('position.restored','position',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.positions r where id=p_id)));
  end if;
end;
$$;
create function public.restore_position(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.restore_position(p_id)$$;
revoke all on function private.restore_position(bigint),public.restore_position(bigint) from public,anon,authenticated;
grant execute on function private.restore_position(bigint),public.restore_position(bigint) to authenticated;

create or replace function private.delete_event_type(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.event_types;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.event_types where id=p_id for update;
  if not found then raise exception 'Event type not found'; end if;
  if old_row.available_for_new_events is distinct from false then
    update public.event_types set available_for_new_events=false where id=p_id;
    perform private.write_audit_log('event_type.deleted','event_type',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.event_types r where id=p_id)));
  end if;
end;
$$;

create or replace function private.restore_event_type(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.event_types;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.event_types where id=p_id for update;
  if not found then raise exception 'Event type not found'; end if;
  if old_row.available_for_new_events is distinct from true then
    update public.event_types set available_for_new_events=true where id=p_id;
    perform private.write_audit_log('event_type.restored','event_type',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.event_types r where id=p_id)));
  end if;
end;
$$;
create function public.restore_event_type(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.restore_event_type(p_id)$$;
revoke all on function private.restore_event_type(bigint),public.restore_event_type(bigint) from public,anon,authenticated;
grant execute on function private.restore_event_type(bigint),public.restore_event_type(bigint) to authenticated;

create or replace function private.delete_event_location(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.event_locations;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.event_locations where id=p_id for update;
  if not found then raise exception 'Location not found'; end if;
  if old_row.is_active is distinct from false then
    update public.event_locations set is_active=false where id=p_id;
    perform private.write_audit_log('event_location.deleted','event_location',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.event_locations r where id=p_id)));
  end if;
end;
$$;

create or replace function private.restore_event_location(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.event_locations;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select * into old_row from public.event_locations where id=p_id for update;
  if not found then raise exception 'Location not found'; end if;
  if old_row.is_active is distinct from true then
    update public.event_locations set is_active=true where id=p_id;
    perform private.write_audit_log('event_location.restored','event_location',p_id::text,
      pg_catalog.jsonb_build_object('name',old_row.name,
        'before',pg_catalog.to_jsonb(old_row),
        'after',(select pg_catalog.to_jsonb(r) from public.event_locations r where id=p_id)));
  end if;
end;
$$;
create function public.restore_event_location(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.restore_event_location(p_id)$$;
revoke all on function private.restore_event_location(bigint),public.restore_event_location(bigint) from public,anon,authenticated;
grant execute on function private.restore_event_location(bigint),public.restore_event_location(bigint) to authenticated;

-- New types must be usable immediately; old availability is unchanged.
create or replace function private.create_event_type(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_name is null or p_name !~ '[^[:space:]]' then raise exception 'Event type name is required'; end if;
  insert into public.event_types(name,available_for_new_events) values(pg_catalog.btrim(p_name),true)
    returning id into saved_id;
  perform private.write_audit_log('event_type.created','event_type',saved_id::text,
    pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name)));
  return saved_id;
end;
$$;
-- These existing RPCs were disabled while Event Types were a fixed catalog.
-- Their private implementations still enforce active Admin authorization.
grant execute on function private.create_event_type(text),private.rename_event_type(bigint,text),private.delete_event_type(bigint),
  public.create_event_type(text),public.rename_event_type(bigint,text),public.delete_event_type(bigint) to authenticated;

-- Free-text locations remain valid. A removed suggestion is never silently
-- restored or attached to a new Event; existing text/FKs remain historical.
create or replace function private.sync_event_location() returns trigger
language plpgsql set search_path = '' as $$
declare saved_location_id bigint; location_active boolean;
begin
  if tg_op='UPDATE' and new.location is not distinct from old.location then
    new.location_id:=old.location_id;
    return new;
  end if;
  insert into public.event_locations(name) values(pg_catalog.btrim(new.location))
    on conflict(normalized_name) do update set name=public.event_locations.name
    returning id,is_active into saved_location_id,location_active;
  new.location_id:=case when location_active then saved_location_id else null end;
  return new;
end;
$$;

create or replace function private.create_event_location(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; normalized text; active boolean;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_name is null or p_name !~ '[^[:space:]]' then raise exception 'Location is required'; end if;
  p_name:=pg_catalog.btrim(p_name);
  normalized:=pg_catalog.lower(pg_catalog.regexp_replace(p_name,'[[:space:]]+',' ','g'));
  insert into public.event_locations(name) values(p_name)
    on conflict(normalized_name) do nothing returning id into saved_id;
  if saved_id is null then
    select id,is_active into saved_id,active from public.event_locations where normalized_name=normalized for update;
    if not active then raise exception 'Location is deleted; restore it instead'; end if;
  else
    perform private.write_audit_log('event_location.created','event_location',saved_id::text,
      pg_catalog.jsonb_build_object('name',p_name));
  end if;
  return saved_id;
end;
$$;
