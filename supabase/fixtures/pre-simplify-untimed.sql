-- Applied to the local upgrade-test database after all migrations through
-- 20260929135903_event_links and immediately before simplify_events.
insert into public.events(
  id,name,description,event_type_id,location,event_date,starts_at,ends_at,
  fixed_points,status
) values (
  90007,'Untimed legacy work','',
  (select id from public.event_types where name='General'),null,'2026-09-24',
  null,null,2,'past'
);
insert into public.point_transactions(
  id,officer_id,event_id,points,reason,award_type,created_by,removed_at,removed_by
) values (
  90003,90001,90004,1.25,'Removed legacy Event award','participation',
  '20000000-0000-0000-0000-000000000001','2026-09-25 12:00:00+00',
  '20000000-0000-0000-0000-000000000001'
);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,created_by)
  values (90004,90001,90005,1.5,'Active legacy Event award','participation',null);
insert into upgrade_fixture.points select to_jsonb(p) from public.point_transactions p
  where p.id in (90003,90004);
insert into public.event_branches(event_id,branch_id) values (90007,1);
insert into public.event_officers(event_id,officer_id) values (90007,90001);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,created_by)
  values (90005,90001,90007,2,'Untimed legacy award','participation',null);
