-- Keep the privileged implementation outside the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- The only identity mutation available to an authenticated caller. All identity
-- inputs come from Supabase Auth, never from RPC arguments or user metadata.
create function private.claim_current_officer_identity()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_uid uuid := auth.uid();
  verified_email text;
  linked_officer public.officers%rowtype;
  matching_ids bigint[];
begin
  if current_uid is null then
    return null;
  end if;

  -- Supabase owns these fields. A caller cannot supply an email or officer ID.
  select lower(trim(u.email)) into verified_email
  from auth.users u
  where u.id = current_uid
    and u.email_confirmed_at is not null
    and u.raw_app_meta_data ->> 'provider' = 'google';
  if verified_email is null or verified_email = '' then
    return null;
  end if;

  select * into linked_officer
  from public.officers o where o.auth_user_id = current_uid;
  if found then
    if linked_officer.status = 'active' then return linked_officer.id; end if;
    return null;
  end if;

  -- Lock the matching row until assignment. The unique auth_user_id constraint
  -- also prevents one account from owning two officer records.
  select array_agg(o.id) into matching_ids
  from public.officers o
  where lower(trim(o.utep_email)) = verified_email
     or lower(trim(o.personal_email)) = verified_email;
  if coalesce(array_length(matching_ids, 1), 0) <> 1 then return null; end if;

  select * into linked_officer
  from public.officers o where o.id = matching_ids[1] for update;
  if linked_officer.status <> 'active' or linked_officer.auth_user_id is not null
    or not (lower(trim(linked_officer.utep_email)) = verified_email
      or lower(trim(linked_officer.personal_email)) = verified_email) then
    return null;
  end if;

  update public.officers set auth_user_id = current_uid where id = linked_officer.id;
  return linked_officer.id;
exception
  when unique_violation then
    -- A concurrent claim of this officer or another link for this account wins.
    return null;
end;
$$;

revoke all on function private.claim_current_officer_identity() from public, anon, authenticated;
grant execute on function private.claim_current_officer_identity() to authenticated;

-- Public API entry point runs as the caller; it exposes no identity selector.
create function public.claim_current_officer_identity()
returns bigint language sql security invoker set search_path = ''
as $$ select private.claim_current_officer_identity(); $$;
revoke all on function public.claim_current_officer_identity() from public, anon, authenticated;
grant execute on function public.claim_current_officer_identity() to authenticated;
