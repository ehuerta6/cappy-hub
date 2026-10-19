-- The waitlist-retirement migration must archive pending rows without
-- changing confirmed participation, Point history, or prior audit records.
insert into public.officers(id,name,utep_email,position_id,status,application_role)
values
  (92201,'Waitlist retirement confirmed A','waitlist-retirement-a@example.test',(select id from public.positions where name='Officer'),'active','officer'),
  (92202,'Waitlist retirement confirmed B','waitlist-retirement-b@example.test',(select id from public.positions where name='Officer'),'active','officer'),
  (92203,'Waitlist retirement pending A','waitlist-retirement-c@example.test',(select id from public.positions where name='Officer'),'active','officer'),
  (92204,'Waitlist retirement pending B','waitlist-retirement-d@example.test',(select id from public.positions where name='Officer'),'active','officer');

insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
values (92201,'Waitlist retirement fixture','Historical migration fixture','TBA',
  (select id from public.event_types where name='Meeting'),'2099-07-01',
  '2099-07-01 17:00:00+00','2099-07-01 18:00:00+00','upcoming',2);
insert into public.event_officers(event_id,officer_id)
values (92201,92201),(92201,92202);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type)
values (92201,92201,92201,7.5,'Waitlist retirement preservation fixture','manual');
insert into public.event_waitlist(id,event_id,officer_id,joined_at)
values
  (92211,92201,92203,'2099-06-01 12:34:56+00'),
  (92212,92201,92204,'2099-06-02 12:34:56+00');
insert into public.audit_logs(id,action,entity_type,entity_id,details)
values
  (92201,'event.waitlist_joined','event','92201','{"event_id":92201,"officer_id":92203,"waitlist_id":92211}'::jsonb),
  (92202,'event.waitlist_left','event','92201','{"event_id":92201,"officer_id":92204,"waitlist_id":92212}'::jsonb),
  (92203,'event.waitlist_promoted','event','92201','{"event_id":92201,"officer_id":92203,"waitlist_id":92211}'::jsonb);

create table upgrade_fixture.pre_event_waitlist as
  select id,event_id,officer_id,joined_at from public.event_waitlist where event_id=92201;
create table upgrade_fixture.pre_event_officers as
  select event_id,officer_id from public.event_officers where event_id=92201;
create table upgrade_fixture.pre_event_points as
  select to_jsonb(p) as original from public.point_transactions p where event_id=92201;
create table upgrade_fixture.pre_event_waitlist_audit as
  select to_jsonb(a) as original from public.audit_logs a
  where entity_id='92201' and action in (
    'event.waitlist_joined','event.waitlist_left','event.waitlist_promoted'
  );
