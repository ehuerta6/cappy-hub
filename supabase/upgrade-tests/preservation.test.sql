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
  $$select (original->>'id')::bigint,original->>'name',case when original->>'description'='' then 'Description unavailable' else original->>'description' end,coalesce(original->>'location','TBA'),(original->>'starts_at')::timestamptz,(original->>'ends_at')::timestamptz,original->>'status',(original->>'created_at')::timestamptz from upgrade_fixture.events where (original->>'id')::bigint between 90001 and 90003 order by (original->>'id')::bigint$$,
  'event identities, schedules, statuses and timestamps survive');
select results_eq(
  $$select e.id,e.name,t.name,e.starts_at,e.ends_at,e.description,e.location from events e join event_types t on t.id=e.event_type_id where e.id between 90004 and 90006 order by e.id$$,
  $$select (original->>'id')::bigint,original->>'name',original->>'type',(original->>'starts_at')::timestamptz,(original->>'ends_at')::timestamptz,case when original->>'description'='' then 'Description unavailable' else original->>'description' end,coalesce(original->>'location','TBA') from upgrade_fixture.events where (original->>'id')::bigint between 90004 and 90006 order by (original->>'id')::bigint$$,
  'timed General, Intro and ICPC Events retain their IDs, schedules and historical type labels');
select is((select count(*) from event_branches where event_id=90002),0::bigint,
  'historical zero-branch event is global');
select results_eq($$select * from event_branches where event_id=90001 order by branch_id$$,
  $$select * from upgrade_fixture.event_branches where event_id=90001 order by branch_id$$,
  'historical event branch links survive');
select results_eq($$select * from event_branches where event_id between 90004 and 90006 order by event_id,branch_id$$,
  $$select * from upgrade_fixture.event_branches where event_id between 90004 and 90006 order by event_id,branch_id$$,
  'timed legacy Event branch links survive');
select results_eq($$select * from event_officers where event_id=90001$$,
  $$select * from upgrade_fixture.event_officers where event_id=90001$$,'historical signups survive');
select results_eq($$select * from event_officers where event_id between 90004 and 90006 order by event_id,officer_id$$,
  $$select * from upgrade_fixture.event_officers where event_id between 90004 and 90006 order by event_id,officer_id$$,
  'timed legacy Event officer participation survives');
select results_eq(
  $$select to_jsonb(p)-'removed_at'-'removed_by'-'updated_at'-'updated_by'-'task_id' from point_transactions p where id between 90001 and 90002 order by id$$,
  $$select original from upgrade_fixture.points where (original->>'id')::bigint between 90001 and 90002 order by (original->>'id')::bigint$$,
  'point transaction IDs, values, timestamps and actors survive');
select results_eq(
  $$select to_jsonb(p)-'task_id' from point_transactions p where id in (90003,90004) order by id$$,
  $$select original from upgrade_fixture.points where (original->>'id')::bigint in (90003,90004) order by (original->>'id')::bigint$$,
  'active and removed legacy Event transactions retain their IDs, associations, values, actors and timestamps');
select is((select count(*) from point_transactions where id=90003),1::bigint,
  'removed historical transaction is not duplicated');
select is((select count(*) from point_transactions where event_id=90004 and award_type='participation'),1::bigint,
  'removed participation history is not recreated under another transaction ID');
select isnt((select removed_at from point_transactions where id=90003),null::timestamptz,
  'removed historical transaction remains removed');
select is((select removed_at from point_transactions where id=90004),null::timestamptz,
  'active historical transaction remains active');
select is((select count(*) from point_transactions where id=90005),0::bigint,
  'participation transaction for a truly untimed legacy Event is removed');
select is((select count(*) from event_officers where event_id=90007),0::bigint,
  'officer participation for a truly untimed legacy Event is removed');
select is((select count(*) from event_branches where event_id=90007),0::bigint,
  'branch links for a truly untimed legacy Event are removed');
select is((select count(*) from events where id=90007),0::bigint,
  'truly untimed legacy Event is removed separately from timed historical types');
select is((select count(*) from event_types where name in ('General','Intro','ICPC')),3::bigint,
  'referenced legacy Event Type catalog values remain readable');

insert into auth.users(id) values ('20000000-0000-0000-0000-000000000002');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
  (-90010,'Upgrade test admin','upgrade-admin@example.org',(select id from positions where name='Officer'),'active','admin',
    '20000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select throws_ok($$select save_event_with_links('Rejected General','Description',
  (select id from event_types where name='General'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects General for new Events');
select throws_ok($$select save_event_with_links('Rejected Intro','Description',
  (select id from event_types where name='Intro'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects Intro for new Events');
select throws_ok($$select save_event_with_links('Rejected ICPC','Description',
  (select id from event_types where name='ICPC'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects ICPC for new Events');
select lives_ok($$select save_event_with_links('Accepted Meeting','Description',
  (select id from event_types where name='Meeting'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Meeting');
select lives_ok($$select save_event_with_links('Accepted Social','Description',
  (select id from event_types where name='Social'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Social');
select lives_ok($$select save_event_with_links('Accepted Workshop','Description',
  (select id from event_types where name='Workshop'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Workshop');
reset role;
select private.process_finished_events();
select is((select total_points from officer_point_totals where id=90001),4.25::numeric,
  'historical signed point total includes active legacy Event history, excluding the removed award');
select throws_ok($$insert into officers(name,position_id,personal_email) values
  ('Duplicate historical contact',(select id from positions where name='Officer'),'HISTORY@MINERS.UTEP.EDU')$$,
  '23505',null,'historical UTEP contact is protected across email fields');
select hasnt_column('positions','can_manage_branch_events','obsolete capability flag is gone');
select hasnt_column('events','flyer_status','flyer event column is gone');
select hasnt_column('application_config','flyer_completion_points','flyer configuration is gone');
select is((select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),15::bigint,
  'final schema contains Events and Tasks tables');
select * from finish();
rollback;
