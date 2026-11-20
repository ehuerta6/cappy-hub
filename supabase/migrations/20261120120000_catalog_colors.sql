-- Store one accessible, user-selected color with each supported catalog value.
alter table public.branches
  add column color text not null default '#64748b'
    constraint branches_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.event_types
  add column color text not null default '#64748b'
    constraint event_types_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.task_types
  add column color text not null default '#64748b'
    constraint task_types_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

create function private.create_colored_catalog_value(
  p_catalog text, p_name text, p_color text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare saved_id bigint; normalized_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_name is null or p_name !~ '[^[:space:]]' then
    raise exception 'Catalog name is required';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Color must be a 6-digit HEX value';
  end if;
  normalized_name := pg_catalog.btrim(p_name);
  if p_catalog = 'branch' then
    insert into public.branches(name, color) values (normalized_name, p_color)
      returning id into saved_id;
  elsif p_catalog = 'event_type' then
    insert into public.event_types(name, color) values (normalized_name, p_color)
      returning id into saved_id;
  elsif p_catalog = 'task_type' then
    insert into public.task_types(name, color) values (normalized_name, p_color)
      returning id into saved_id;
  else
    raise exception 'Invalid color catalog';
  end if;
  perform private.write_audit_log('catalog.color_created', p_catalog,
    saved_id::text, pg_catalog.jsonb_build_object('name', normalized_name, 'color', p_color));
  return saved_id;
end;
$$;

create function private.set_catalog_color(
  p_catalog text, p_id bigint, p_color text
) returns void language plpgsql security definer set search_path = '' as $$
declare old_row jsonb; new_row jsonb; record_name text;
begin
  if not private.current_is_admin() then raise exception 'Admin required'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Color must be a 6-digit HEX value';
  end if;
  if p_catalog = 'branch' then
    select pg_catalog.to_jsonb(b), b.name into old_row, record_name
      from public.branches b where b.id = p_id for update;
    if not found then raise exception 'Branch not found'; end if;
    update public.branches set color = p_color where id = p_id returning pg_catalog.to_jsonb(branches) into new_row;
  elsif p_catalog = 'event_type' then
    select pg_catalog.to_jsonb(t), t.name into old_row, record_name
      from public.event_types t where t.id = p_id for update;
    if not found then raise exception 'Event type not found'; end if;
    update public.event_types set color = p_color where id = p_id returning pg_catalog.to_jsonb(event_types) into new_row;
  elsif p_catalog = 'task_type' then
    select pg_catalog.to_jsonb(t), t.name into old_row, record_name
      from public.task_types t where t.id = p_id for update;
    if not found then raise exception 'Task type not found'; end if;
    update public.task_types set color = p_color where id = p_id returning pg_catalog.to_jsonb(task_types) into new_row;
  else
    raise exception 'Invalid color catalog';
  end if;
  if old_row->>'color' is distinct from p_color then
    perform private.write_audit_log('catalog.color_changed', p_catalog,
      p_id::text, pg_catalog.jsonb_build_object('name', record_name,
        'before_color', old_row->>'color', 'after_color', p_color));
  end if;
end;
$$;

revoke all on function private.create_colored_catalog_value(text, text, text) from public, anon, authenticated;
revoke all on function private.set_catalog_color(text, bigint, text) from public, anon, authenticated;
grant execute on function private.create_colored_catalog_value(text, text, text) to authenticated;
grant execute on function private.set_catalog_color(text, bigint, text) to authenticated;

create function public.create_colored_catalog_value(
  p_catalog text, p_name text, p_color text
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_colored_catalog_value(p_catalog, p_name, p_color)
$$;
create function public.set_catalog_color(
  p_catalog text, p_id bigint, p_color text
) returns void language sql security invoker set search_path = '' as $$
  select private.set_catalog_color(p_catalog, p_id, p_color)
$$;
revoke all on function public.create_colored_catalog_value(text, text, text) from public, anon;
revoke all on function public.set_catalog_color(text, bigint, text) from public, anon;
grant execute on function public.create_colored_catalog_value(text, text, text) to authenticated;
grant execute on function public.set_catalog_color(text, bigint, text) to authenticated;
