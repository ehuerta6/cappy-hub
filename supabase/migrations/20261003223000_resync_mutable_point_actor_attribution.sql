-- updated_by is the latest editor, so its stable Officer snapshot must follow
-- changes to the compatibility UUID. Other actor columns remain set-once
-- historical attribution: an auth_user_id relink does not rewrite them.
create or replace function private.sync_stable_actor_ids() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'audit_logs' then
    if new.actor_officer_id is null and new.actor_id is not null then
      select o.id into new.actor_officer_id from public.officers o
        where o.auth_user_id = new.actor_id;
    end if;
  elsif tg_table_name = 'warning_approvals' then
    if new.approver_officer_id is null then
      select o.id into new.approver_officer_id from public.officers o
        where o.auth_user_id = new.approver_id;
    end if;
  elsif tg_table_name = 'events' then
    if new.deleted_by_officer_id is null and new.deleted_by is not null then
      select o.id into new.deleted_by_officer_id from public.officers o
        where o.auth_user_id = new.deleted_by;
    end if;
  elsif tg_table_name = 'point_transactions' then
    if new.created_by_officer_id is null and new.created_by is not null then
      select o.id into new.created_by_officer_id from public.officers o
        where o.auth_user_id = new.created_by;
    end if;
    if tg_op = 'INSERT' or new.updated_by is distinct from old.updated_by then
      new.updated_by_officer_id := null;
      if new.updated_by is not null then
        select o.id into new.updated_by_officer_id from public.officers o
          where o.auth_user_id = new.updated_by;
      end if;
    elsif new.updated_by_officer_id is null and new.updated_by is not null then
      select o.id into new.updated_by_officer_id from public.officers o
        where o.auth_user_id = new.updated_by;
    end if;
    if new.removed_by_officer_id is null and new.removed_by is not null then
      select o.id into new.removed_by_officer_id from public.officers o
        where o.auth_user_id = new.removed_by;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_stable_actor_ids() from public,anon,authenticated;
