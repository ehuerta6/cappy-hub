-- The prior migrations remain replayable; this migration corrects their final model.
-- Validate old contact data before any destructive change. Email identity must be
-- unambiguous for the later Google account-linking workflow.
do $$
declare conflict_email text;
begin
  if exists (select 1 from public.officers where utep_email is null and personal_email is null) then
    raise exception 'Cannot require an email: existing officer has neither UTEP nor personal email';
  end if;
  select email into conflict_email from (
    select lower(trim(utep_email)) as email from public.officers where utep_email is not null
    union all
    select lower(trim(personal_email)) from public.officers where personal_email is not null
  ) emails group by email having count(*) > 1 limit 1;
  if conflict_email is not null then
    raise exception 'Cannot enforce global officer email uniqueness: duplicate normalized email %', conflict_email;
  end if;
  if exists (select 1 from public.events where
    (starts_at at time zone 'America/Denver')::date <> (ends_at at time zone 'America/Denver')::date) then
    raise exception 'Cannot enforce same-day timed events: historical event crosses an America/Denver calendar day';
  end if;
  if exists (select 1 from public.events where flyer_status is not null or flyer_assigned_to is not null) then
    raise exception 'Cannot remove obsolete flyer fields: event flyer data exists';
  end if;
  if exists (select 1 from public.point_transactions where award_type = 'flyer') then
    raise exception 'Cannot remove flyer award type: historical flyer transactions exist';
  end if;
  if exists (select 1 from public.application_config where flyer_completion_points <> 0) then
    raise exception 'Cannot remove flyer configuration: flyer amount differs from the PR 1 placeholder';
  end if;
  if exists (select 1 from public.officers o join public.positions p on p.id=o.position_id
    where p.name not in (
      'President','Vice President of Operations','Vice President of Academics','Secretary',
      'Lead','Officer','ICPC Lead','Intro Lead','Social Media Lead','Chief Outreach',
      'ICPC/Academic Officer','Intro/CIC Academic Officer','ICPC Officer',
      'Intro Academic Officer','CIC Academic Officer','Outreach Officer','Social Media Officer')) then
    raise exception 'Cannot simplify positions: an officer has an unmapped legacy title';
  end if;
end;
$$;

-- Correct controlled data without changing existing branch IDs or memberships.
insert into public.branches(name) values ('outreach') on conflict (name) do nothing;
insert into public.positions(name) values ('Lead'),('Officer') on conflict (name) do nothing;

-- Preserve existing memberships, adding only the area implied by a legacy title.
-- Slash titles map to both documented areas; global positions gain none.
insert into public.officer_branches(officer_id,branch_id)
select o.id,b.id from public.officers o
join public.positions p on p.id=o.position_id
join lateral (values
  ('ICPC Lead','icpc'),('Intro Lead','intro'),('Social Media Lead','social'),
  ('Chief Outreach','outreach'),('ICPC Officer','icpc'),('Intro Academic Officer','intro'),
  ('CIC Academic Officer','general'),('Outreach Officer','outreach'),
  ('Social Media Officer','social'),('ICPC/Academic Officer','icpc'),
  ('ICPC/Academic Officer','general'),('Intro/CIC Academic Officer','intro'),
  ('Intro/CIC Academic Officer','general')) mapping(old_title,branch_name)
  on mapping.old_title=p.name
join public.branches b on b.name=mapping.branch_name
on conflict (officer_id,branch_id) do nothing;

update public.officers o set position_id = new_position.id
from public.positions old_position, public.positions new_position
where o.position_id=old_position.id
  and new_position.name = case
    when old_position.name in ('ICPC Lead','Intro Lead','Social Media Lead','Chief Outreach') then 'Lead'
    when old_position.name in (
      'ICPC/Academic Officer','Intro/CIC Academic Officer','ICPC Officer',
      'Intro Academic Officer','CIC Academic Officer','Outreach Officer','Social Media Officer') then 'Officer'
    else old_position.name end
  and o.position_id <> new_position.id;
-- Referenced positions would reject deletion; never cascade officer history.
delete from public.positions where name not in (
  'President','Vice President of Operations','Vice President of Academics','Secretary','Lead','Officer');
alter table public.positions drop column can_manage_branch_events;

alter table public.officers add constraint officers_at_least_one_email
  check (utep_email is not null or personal_email is not null);
-- Existing column indexes only compare each field separately. Keep them for
-- efficient lookups and add a trigger for the cross-column invariant.
drop index public.officers_utep_email_key;
drop index public.officers_personal_email_key;
create unique index officers_utep_email_key on public.officers(lower(trim(utep_email)));
create unique index officers_personal_email_key on public.officers(lower(trim(personal_email)));

create function public.check_officer_email_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare candidate text;
begin
  if new.utep_email is not null and new.personal_email is not null
    and lower(trim(new.utep_email)) = lower(trim(new.personal_email)) then
    raise exception 'UTEP and personal email must be different' using errcode = '23505';
  end if;
  -- Lock both normalized addresses in a stable order. Two concurrent writes
  -- cannot pass the cross-column check before either one commits.
  for candidate in
    select distinct lower(trim(address)) from (values (new.utep_email),(new.personal_email)) x(address)
    where address is not null order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate,0));
    if exists (select 1 from public.officers o where o.id <> new.id and
      (lower(trim(o.utep_email)) = candidate or lower(trim(o.personal_email)) = candidate)) then
      raise exception 'Officer email address already belongs to another officer: %', candidate
        using errcode = '23505';
    end if;
  end loop;
  return new;
end;
$$;
create trigger officers_email_identity before insert or update of utep_email,personal_email
  on public.officers for each row execute function public.check_officer_email_identity();
revoke all on function public.check_officer_email_identity() from public, anon, authenticated;

alter table public.events add constraint events_same_denver_date_check
  check ((starts_at at time zone 'America/Denver')::date =
         (ends_at at time zone 'America/Denver')::date);

-- The new brief removes the PR 1 flyer subsystem. Preflight above prevents
-- loss of historical flyer records and changed configuration values.
drop index public.one_flyer_award;
alter table public.point_transactions drop constraint point_transactions_flyer_event_required;
alter table public.point_transactions drop constraint point_transactions_award_type_check;
alter table public.point_transactions add constraint point_transactions_award_type_check
  check (award_type in ('participation','manual','correction'));
alter table public.events drop column flyer_status, drop column flyer_assigned_to;
alter table public.application_config drop column flyer_completion_points;

-- A missing branch collection means a valid global officer/event. The row and
-- its relationship replacement still run atomically in the caller transaction.
create or replace function public.save_officer(
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
    insert into public.officers (name,utep_email,personal_email,position_id,classification)
    values (trim(p_name),university_email,contact_email,p_position_id,officer_classification)
    returning id into saved_id;
  else
    update public.officers set name=trim(p_name),utep_email=university_email,
      personal_email=contact_email,position_id=p_position_id,
      classification=officer_classification,status=p_status
    where id=p_officer_id returning id into saved_id;
    if saved_id is null then raise exception 'Officer not found'; end if;
  end if;
  delete from public.officer_branches where officer_id=saved_id;
  insert into public.officer_branches(officer_id,branch_id)
    select saved_id, branch_id from unnest(coalesce(p_branch_ids,'{}'::bigint[])) as branch_id;
  return saved_id;
end;
$$;

create or replace function public.save_event(
  p_name text, p_description text, p_event_type_id bigint, p_location text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_branch_ids bigint[], p_event_id bigint default null
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare saved_id bigint; current_event public.events;
begin
  if p_event_id is null then
    insert into public.events(name,description,event_type_id,location,starts_at,ends_at)
    values(trim(p_name),p_description,p_event_type_id,nullif(trim(p_location),''),p_starts_at,p_ends_at)
    returning id into saved_id;
  else
    select * into current_event from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found'; end if;
    if current_event.starts_at<=now() or current_event.status='cancelled' then
      raise exception 'Only upcoming events can be edited'; end if;
    update public.events set name=trim(p_name),description=p_description,event_type_id=p_event_type_id,
      location=nullif(trim(p_location),''),starts_at=p_starts_at,ends_at=p_ends_at
      where id=p_event_id returning id into saved_id;
  end if;
  delete from public.event_branches where event_id=saved_id;
  insert into public.event_branches(event_id,branch_id)
    select saved_id,branch_id from unnest(coalesce(p_branch_ids,'{}'::bigint[])) as branch_id;
  return saved_id;
end;
$$;
