begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000004301','restore-admin@example.org'),
 ('00000000-0000-4000-8000-000000004302','restore-intro-lead@example.org'),
 ('00000000-0000-4000-8000-000000004303','restore-icpc-lead@example.org'),
 ('00000000-0000-4000-8000-000000004304','restore-officer@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-4301,'Restore Admin','restore-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000004301'),
 (-4302,'Restore Intro Lead','restore-intro-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000004302'),
 (-4303,'Restore ICPC Lead','restore-icpc-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000004303'),
 (-4304,'Restore Officer','restore-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000004304');
insert into officer_branches(officer_id,branch_id)
 select -4302,id from branches where name='intro'
 union all select -4303,id from branches where name='icpc';

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
  slides_url,meeting_notes_url) values
 (-4301,'Restore Future','Keep this description','CCSB 1.0202',
   (select id from event_types where name='Meeting'),'2099-09-20',
   '2099-09-20 09:00-06','2099-09-20 10:00-06','cancelled',
   'https://example.org/slides','https://example.org/notes'),
 (-4302,'Restore Past','Past description','CCSB 1.0202',
   (select id from event_types where name='Workshop'),'2020-09-20',
   '2020-09-20 09:00-06','2020-09-20 10:00-06','cancelled',null,null),
 (-4303,'Restore Out Of Scope','ICPC event','TBA',
   (select id from event_types where name='Meeting'),'2099-09-21',
   '2099-09-21 09:00-06','2099-09-21 10:00-06','cancelled',null,null),
 (-4305,'Restore Intro Out Of Scope','Intro event','TBA',
   (select id from event_types where name='Meeting'),'2099-09-23',
   '2099-09-23 09:00-06','2099-09-23 10:00-06','cancelled',null,null),
 (-4304,'Still Active','Active event','TBA',
   (select id from event_types where name='Meeting'),'2099-09-22',
   '2099-09-22 09:00-06','2099-09-22 10:00-06','upcoming',null,null);
insert into event_branches(event_id,branch_id)
 select -4301,id from branches where name='intro'
 union all select -4302,id from branches where name='intro'
 union all select -4305,id from branches where name='intro'
 union all select -4303,id from branches where name='icpc';
insert into event_officers(event_id,officer_id) values (-4301,-4304),(-4302,-4304);
insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-4304,-4301,2,'Existing manual award','manual');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004301',true);
set local role authenticated;
select lives_ok($$select restore_event(-4301)$$,
  'an admin restores a cancelled Event');
select is((select status from events where id=-4301),'upcoming',
  'a future restored Event is upcoming');
select is((select name from events where id=-4301),'Restore Future',
  'restoration preserves the Event name');
select is((select description from events where id=-4301),'Keep this description',
  'restoration preserves the Event description');
select is((select location from events where id=-4301),'CCSB 1.0202',
  'restoration preserves the Event location');
select is((select event_type_id from events where id=-4301),
  (select id from event_types where name='Meeting'),
  'restoration preserves the Event type');
select is((select event_date from events where id=-4301),'2099-09-20'::date,
  'restoration preserves the Event date');
select is((select starts_at from events where id=-4301),'2099-09-20 09:00-06'::timestamptz,
  'restoration preserves the start time');
select is((select ends_at from events where id=-4301),'2099-09-20 10:00-06'::timestamptz,
  'restoration preserves the end time');
select is((select slides_url from events where id=-4301),'https://example.org/slides',
  'restoration preserves slides metadata');
select is((select meeting_notes_url from events where id=-4301),'https://example.org/notes',
  'restoration preserves meeting notes metadata');
select is((select array_agg(branch_id order by branch_id)::text from event_branches where event_id=-4301),
  (select array_agg(id order by id)::text from branches where name='intro'),
  'restoration preserves Event branches');
select is((select array_agg(officer_id order by officer_id)::text from event_officers where event_id=-4301),
  '{-4304}','restoration preserves signups');
select is((select count(*) from point_transactions where event_id=-4301),1::bigint,
  'restoration preserves existing point history without adding points');
select is((select count(*) from audit_logs where action='event.restored' and entity_id='-4301'),
  1::bigint,'restoration writes one audit entry');
select is((select details->>'new_status' from audit_logs
  where action='event.restored' and entity_id='-4301'),'upcoming',
  'audit entry records the restored status');
select throws_ok($$select restore_event(-4301)$$,'P0001',
  'This event cannot be restored','restoring an already-active Event is rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004302',true);
select lives_ok($$select restore_event(-4302)$$,
  'a Lead restores an Event within their branch scope');
select is((select status from events where id=-4302),'past',
  'a cancelled Event ending in the past restores directly to past');
select is((select count(*) from event_officers where event_id=-4302 and officer_id=-4304),
  1::bigint,'past restoration preserves its signup');
reset role;
select is(private.process_finished_events(),1,
  'the restored past Event is handled by the existing participation lifecycle');
select is(private.process_finished_events(),0,
  'processing the restored Event again does not create duplicate awards');
select is((select count(*) from point_transactions
  where event_id=-4302 and officer_id=-4304 and award_type='participation' and removed_at is null),
  1::bigint,'the restored Event has exactly one participation award');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004303',true);
set local role authenticated;
select throws_ok($$select restore_event(-4302)$$,'P0001',
  'Event outside branch scope','a Lead cannot restore outside their branch scope');
select throws_ok($$select restore_event(-4305)$$,'P0001',
  'Event outside branch scope','a Lead cannot restore an unrelated branch Event');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004304',true);
select throws_ok($$select restore_event(-4303)$$,'P0001',
  'Event outside branch scope','an ordinary officer cannot restore an Event');
select throws_ok($$select restore_event(-4304)$$,'P0001',
  'Event outside branch scope','an ordinary officer cannot restore an active Event');

reset role;
select * from finish();
rollback;
