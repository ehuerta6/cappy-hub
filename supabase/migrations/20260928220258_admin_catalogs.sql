-- Admin-only catalog operations. Client roles retain SELECT only on these tables.
-- The six organizational positions are required product values. In particular,
-- authorization resolves Lead by its canonical name.
alter table public.branches add constraint branches_name_not_blank check (length(trim(name)) > 0);

create function private.required_position(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name = any(array['President','Vice President of Operations',
    'Vice President of Academics','Secretary','Lead','Officer']::text[])
$$;
revoke all on function private.required_position(text) from public,anon,authenticated;

create function private.create_position(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Position name is required'; end if;
  insert into public.positions(name) values(p_name) returning id into saved_id;
  perform private.write_audit_log('position.created','position',saved_id::text,
    pg_catalog.jsonb_build_object('name',p_name));
  return saved_id;
end;
$$;
create function private.rename_position(p_id bigint,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Position name is required'; end if;
  select name into old_name from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_name) then raise exception 'Required positions cannot be renamed'; end if;
  if old_name is distinct from p_name then
    update public.positions set name=p_name where id=p_id;
    perform private.write_audit_log('position.renamed','position',p_id::text,
      pg_catalog.jsonb_build_object('old_name',old_name,'new_name',p_name));
  end if;
end;
$$;
create function private.delete_position(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name into old_name from public.positions where id=p_id for update;
  if not found then raise exception 'Position not found'; end if;
  if private.required_position(old_name) then raise exception 'Required positions cannot be deleted'; end if;
  if exists(select 1 from public.officers where position_id=p_id) then
    raise exception 'This position cannot be deleted because officers are using it';
  end if;
  begin
    delete from public.positions where id=p_id;
  exception when foreign_key_violation then
    raise exception 'This position cannot be deleted because officers are using it';
  end;
  perform private.write_audit_log('position.deleted','position',p_id::text,
    pg_catalog.jsonb_build_object('name',old_name));
end;
$$;

create function private.create_branch(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Branch name is required'; end if;
  insert into public.branches(name) values(p_name) returning id into saved_id;
  perform private.write_audit_log('branch.created','branch',saved_id::text,
    pg_catalog.jsonb_build_object('name',p_name));
  return saved_id;
end;
$$;
create function private.rename_branch(p_id bigint,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Branch name is required'; end if;
  select name into old_name from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if old_name is distinct from p_name then
    update public.branches set name=p_name where id=p_id;
    perform private.write_audit_log('branch.renamed','branch',p_id::text,
      pg_catalog.jsonb_build_object('old_name',old_name,'new_name',p_name));
  end if;
end;
$$;
create function private.delete_branch(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name into old_name from public.branches where id=p_id for update;
  if not found then raise exception 'Branch not found'; end if;
  if exists(select 1 from public.officer_branches where branch_id=p_id)
    or exists(select 1 from public.event_branches where branch_id=p_id) then
    raise exception 'This branch cannot be deleted because officers or events are using it';
  end if;
  begin
    delete from public.branches where id=p_id;
  exception when foreign_key_violation then
    raise exception 'This branch cannot be deleted because officers or events are using it';
  end;
  perform private.write_audit_log('branch.deleted','branch',p_id::text,
    pg_catalog.jsonb_build_object('name',old_name));
end;
$$;

create function private.create_event_type(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare saved_id bigint;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Event type name is required'; end if;
  insert into public.event_types(name) values(p_name) returning id into saved_id;
  perform private.write_audit_log('event_type.created','event_type',saved_id::text,
    pg_catalog.jsonb_build_object('name',p_name));
  return saved_id;
end;
$$;
create function private.rename_event_type(p_id bigint,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  p_name := pg_catalog.btrim(p_name);
  if p_name is null or p_name = '' then raise exception 'Event type name is required'; end if;
  select name into old_name from public.event_types where id=p_id for update;
  if not found then raise exception 'Event type not found'; end if;
  if old_name is distinct from p_name then
    update public.event_types set name=p_name where id=p_id;
    perform private.write_audit_log('event_type.renamed','event_type',p_id::text,
      pg_catalog.jsonb_build_object('old_name',old_name,'new_name',p_name));
  end if;
end;
$$;
create function private.delete_event_type(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  select name into old_name from public.event_types where id=p_id for update;
  if not found then raise exception 'Event type not found'; end if;
  if exists(select 1 from public.events where event_type_id=p_id) then
    raise exception 'This event type cannot be deleted because events are using it';
  end if;
  begin
    delete from public.event_types where id=p_id;
  exception when foreign_key_violation then
    raise exception 'This event type cannot be deleted because events are using it';
  end;
  perform private.write_audit_log('event_type.deleted','event_type',p_id::text,
    pg_catalog.jsonb_build_object('name',old_name));
end;
$$;

-- The public API exposes nine named, constrained operations. Each private
-- implementation rechecks active-admin status using the caller's JWT.
create function public.create_position(p_name text) returns bigint
language sql security invoker set search_path = '' as $$select private.create_position(p_name)$$;
create function public.rename_position(p_id bigint,p_name text) returns void
language sql security invoker set search_path = '' as $$select private.rename_position(p_id,p_name)$$;
create function public.delete_position(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.delete_position(p_id)$$;
create function public.create_branch(p_name text) returns bigint
language sql security invoker set search_path = '' as $$select private.create_branch(p_name)$$;
create function public.rename_branch(p_id bigint,p_name text) returns void
language sql security invoker set search_path = '' as $$select private.rename_branch(p_id,p_name)$$;
create function public.delete_branch(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.delete_branch(p_id)$$;
create function public.create_event_type(p_name text) returns bigint
language sql security invoker set search_path = '' as $$select private.create_event_type(p_name)$$;
create function public.rename_event_type(p_id bigint,p_name text) returns void
language sql security invoker set search_path = '' as $$select private.rename_event_type(p_id,p_name)$$;
create function public.delete_event_type(p_id bigint) returns void
language sql security invoker set search_path = '' as $$select private.delete_event_type(p_id)$$;

revoke all on function private.create_position(text),private.rename_position(bigint,text),private.delete_position(bigint),
  private.create_branch(text),private.rename_branch(bigint,text),private.delete_branch(bigint),
  private.create_event_type(text),private.rename_event_type(bigint,text),private.delete_event_type(bigint)
  from public,anon,authenticated;
revoke all on function public.create_position(text),public.rename_position(bigint,text),public.delete_position(bigint),
  public.create_branch(text),public.rename_branch(bigint,text),public.delete_branch(bigint),
  public.create_event_type(text),public.rename_event_type(bigint,text),public.delete_event_type(bigint)
  from public,anon,authenticated;
grant execute on function private.create_position(text),private.rename_position(bigint,text),private.delete_position(bigint),
  private.create_branch(text),private.rename_branch(bigint,text),private.delete_branch(bigint),
  private.create_event_type(text),private.rename_event_type(bigint,text),private.delete_event_type(bigint)
  to authenticated;
grant execute on function public.create_position(text),public.rename_position(bigint,text),public.delete_position(bigint),
  public.create_branch(text),public.rename_branch(bigint,text),public.delete_branch(bigint),
  public.create_event_type(text),public.rename_event_type(bigint,text),public.delete_event_type(bigint)
  to authenticated;
