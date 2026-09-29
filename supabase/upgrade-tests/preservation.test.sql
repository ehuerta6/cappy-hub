begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select results_eq(
  $$select id,name,utep_email,personal_email,classification,status,created_at from officers where id between 90001 and 90003 order by id$$,
  $$select (original->>'id')::bigint,original->>'name',original->>'utep_email',original->>'personal_email',original->>'classification',original->>'status',(original->>'created_at')::timestamptz from upgrade_fixture.officers order by (original->>'id')::bigint$$,
  'officer identities, contacts, status and timestamps survive');
select results_eq(
  $$select o.id,p.name from officers o join positions p on p.id=o.position_id where o.id between 90001 and 90003 order by o.id$$,
  $$values (90001::bigint,'Lead'),(90002::bigint,'Secretary'),(90003::bigint,'Lead')$$,
  'detailed positions migrate to generic positions without changing officer IDs');
select ok(exists(select 1 from officer_branches ob join branches b on b.id=ob.branch_id where ob.officer_id=90001 and b.name='icpc'),
  'ICPC Lead retains and gains the intended ICPC membership');
select is((select count(*) from officer_branches where officer_id=90002),0::bigint,
  'global Secretary remains without a branch');
select ok(exists(select 1 from officer_branches ob join branches b on b.id=ob.branch_id where ob.officer_id=90003 and b.name='outreach'),
  'Chief Outreach becomes Lead plus outreach');
select is((select count(*) from branches where name='outreach'),1::bigint,'outreach exists once');
select results_eq(
  $$select id,name,description,location,starts_at,ends_at,status,created_at from events where id between 90001 and 90003 order by id$$,
  $$select (original->>'id')::bigint,original->>'name',original->>'description',original->>'location',(original->>'starts_at')::timestamptz,(original->>'ends_at')::timestamptz,original->>'status',(original->>'created_at')::timestamptz from upgrade_fixture.events order by (original->>'id')::bigint$$,
  'event identities, schedules, statuses and timestamps survive');
select is((select count(*) from event_branches where event_id=90002),0::bigint,
  'historical zero-branch event is global');
select results_eq($$select * from event_branches where event_id=90001 order by branch_id$$,
  $$select * from upgrade_fixture.event_branches order by branch_id$$,
  'historical event branch links survive');
select results_eq($$select * from event_officers where event_id=90001$$,
  $$select * from upgrade_fixture.event_officers$$,'historical signups survive');
select results_eq(
  $$select to_jsonb(p)-'removed_at'-'removed_by'-'updated_at'-'updated_by' from point_transactions p where id between 90001 and 90002 order by id$$,
  $$select original from upgrade_fixture.points order by (original->>'id')::bigint$$,
  'point transaction IDs, values, timestamps and actors survive');
select is((select total_points from officer_point_totals where id=90001),1.75::numeric,
  'historical signed point total survives');
select throws_ok($$insert into officers(name,position_id,personal_email) values
  ('Duplicate historical contact',(select id from positions where name='Officer'),'HISTORY@MINERS.UTEP.EDU')$$,
  '23505',null,'historical UTEP contact is protected across email fields');
select hasnt_column('positions','can_manage_branch_events','obsolete capability flag is gone');
select hasnt_column('events','flyer_status','flyer event column is gone');
select hasnt_column('application_config','flyer_completion_points','flyer configuration is gone');
select is((select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),13::bigint,
  'final schema still contains thirteen application tables');
select * from finish();
rollback;
