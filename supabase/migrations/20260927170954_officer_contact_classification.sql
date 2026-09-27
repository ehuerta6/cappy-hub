-- Preserve officer identities and relationships while splitting contact fields.
alter table public.officers drop constraint officers_classification_check;
alter table public.officers alter column classification drop not null;
update public.officers set classification = 'graduate' where classification in ('masters', 'phd');
alter table public.officers add constraint officers_classification_check
  check (classification in ('freshman', 'sophomore', 'junior', 'senior', 'graduate'));

alter table public.officers add column utep_email text;
alter table public.officers add column personal_email text;
-- Existing university addresses remain university contacts; all other addresses
-- remain personal contacts. No officer IDs or membership/history rows change.
update public.officers set
  utep_email = case when lower(trim(email)) like '%@miners.utep.edu' or lower(trim(email)) like '%@utep.edu' then lower(trim(email)) end,
  personal_email = case when lower(trim(email)) not like '%@miners.utep.edu' and lower(trim(email)) not like '%@utep.edu' then lower(trim(email)) end;
alter table public.officers add constraint officers_utep_email_format
  check (utep_email is null or utep_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.officers add constraint officers_personal_email_format
  check (personal_email is null or personal_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
create unique index officers_utep_email_key on public.officers (lower(utep_email));
create unique index officers_personal_email_key on public.officers (lower(personal_email));

-- Remove the old public RPC signature so no stale email API remains.
drop function public.save_officer(text,text,bigint,text,text,bigint[],bigint);
alter table public.officers drop column email;
create function public.save_officer(
  p_name text, p_position_id bigint, p_status text, p_branch_ids bigint[],
  p_officer_id bigint default null, p_utep_email text default null,
  p_personal_email text default null, p_classification text default null
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  saved_id bigint;
  university_email text := nullif(lower(trim(p_utep_email)), '');
  contact_email text := nullif(lower(trim(p_personal_email)), '');
  officer_classification text := nullif(trim(p_classification), '');
begin
  if p_officer_id is null then
    insert into public.officers (name,utep_email,personal_email,position_id,classification,status)
    values (trim(p_name),university_email,contact_email,p_position_id,officer_classification,p_status)
    returning id into saved_id;
  else
    update public.officers set name=trim(p_name),utep_email=university_email,
      personal_email=contact_email,position_id=p_position_id,
      classification=officer_classification,status=p_status
    where id=p_officer_id returning id into saved_id;
    if saved_id is null then raise exception 'Officer not found'; end if;
  end if;
  delete from public.officer_branches where officer_id=saved_id;
  insert into public.officer_branches (officer_id,branch_id)
  select saved_id, branch_id from unnest(p_branch_ids) as branch_id;
  return saved_id;
end;
$$;
revoke all on function public.save_officer(text,bigint,text,bigint[],bigint,text,text,text) from public;
grant execute on function public.save_officer(text,bigint,text,bigint[],bigint,text,text,text) to anon;
