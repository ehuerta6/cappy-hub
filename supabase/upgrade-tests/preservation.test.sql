begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);
select results_eq(
  $$select to_jsonb(o)-'auth_user_id'-'application_role' from officers o order by id$$,
  $$select original from upgrade_fixture.officers order by (original->>'id')::bigint$$,
  'all existing officer fields and IDs survive');
select results_eq(
  $$select to_jsonb(e)-'event_type_id'-'participation_points_per_hour_at_end'-'slides_url'-'meeting_notes_url'-'flyer_status'-'flyer_assigned_to' from events e order by id$$,
  $$select original-'type' from upgrade_fixture.events order by (original->>'id')::bigint$$,
  'all event fields except the replaced type survive with unchanged IDs');
select results_eq(
  $$select e.id,lower(trim(t.name)) from events e join event_types t on t.id=e.event_type_id order by e.id$$,
  $$select (original->>'id')::bigint,lower(trim(original->>'type')) from upgrade_fixture.events order by (original->>'id')::bigint$$,
  'custom and seeded historical type meanings survive case/whitespace normalization');
select is((select count(*) from event_types where lower(name)='career fair'),1::bigint,'custom type variants become one catalog entry');
select results_eq(
  $$select to_jsonb(p)-'removed_at'-'removed_by' from point_transactions p order by id$$,
  $$select original from upgrade_fixture.points order by (original->>'id')::bigint$$,
  'point IDs, amounts, timestamps, reasons and nullable/real auth actors survive');
select results_eq($$select * from officer_branches order by officer_id,branch_id$$,
  $$select * from upgrade_fixture.officer_branches order by officer_id,branch_id$$,'officer memberships survive');
select results_eq($$select * from event_branches order by event_id,branch_id$$,
  $$select * from upgrade_fixture.event_branches order by event_id,branch_id$$,'event branch associations survive');
select results_eq($$select * from event_officers order by event_id,officer_id$$,
  $$select * from upgrade_fixture.event_officers order by event_id,officer_id$$,'signups survive without duplication');
select is((select application_role from officers where id=90001),'officer','migration does not invent an admin');
select ok((select auth_user_id is null from officers where id=90001),'migration does not invent an auth link');
select is((select total_points from officer_point_totals where id=90001),1.75::numeric,'historical signed total is preserved');
select is((select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),13::bigint,'final schema has exactly 13 application tables');
select * from finish();
rollback;
