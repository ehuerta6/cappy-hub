begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000901','pr10-admin@example.org'),
 ('00000000-0000-4000-8000-000000000902','pr10-lead@example.org'),
 ('00000000-0000-4000-8000-000000000903','pr10-officer@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-901,'PR10 Admin','pr10-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000000901'),
 (-902,'PR10 Lead','pr10-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000000902'),
 (-903,'PR10 Officer','pr10-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000000903');
insert into officer_branches(officer_id,branch_id)
 select -902,id from branches where name='intro';
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-901,'Ended timed','Test event','TBA',(select id from event_types where name='Meeting'),'2020-09-20 09:00-06','2020-09-20 10:00-06');
insert into event_officers(event_id,officer_id) values(-901,-903);
select throws_ok($$insert into events(name,description,location,event_type_id,event_date,starts_at,ends_at)
 values('Too early','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-21',
 '2099-09-21 05:59-06','2099-09-21 06:30-06')$$,'23514',null,
 'database rejects start before 06:00 Denver');
select throws_ok($$insert into events(name,description,location,event_type_id,event_date,starts_at,ends_at)
 values('Wrong day','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-22',
 '2099-09-21 08:00-06','2099-09-21 09:00-06')$$,'23514',null,
 'event date must match scheduled local date');
select throws_ok($$insert into events(name,description,location,event_type_id,event_date,starts_at,ends_at)
 values('Untimed','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-22',null,null)$$,
 '23502',null,'untimed events cannot be inserted');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select save_event_with_links('PR10 meeting','Meeting notes',
 (select id from event_types where name='Meeting'),'TBA','2099-09-21',
 '2099-09-21 09:00-06','2099-09-21 10:00-06',
 array[(select id from branches where name='intro')]::bigint[],null,
 'https://drive.example.org/slides','https://drive.example.org/notes')$$,
 'admin creates timed event with links');
reset role;
select set_config('test.event_id',(select id::text from events where name='PR10 meeting'),true);
select is((select slides_url from events where id=current_setting('test.event_id')::bigint),
 'https://drive.example.org/slides','slides URL is stored');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select throws_ok($$select save_event_with_links('Unauthorized edit','Description',
 (select id from event_types where name='Meeting'),'TBA','2099-09-21',
 '2099-09-21 09:00-06','2099-09-21 10:00-06',
 array[(select id from branches where name='intro')]::bigint[],
 current_setting('test.event_id')::bigint,'https://example.org/changed',null)$$,
 'P0001','Event outside branch scope','ordinary officer cannot edit event links');
select lives_ok(format('select change_event_signup(%s,-903,false)',current_setting('test.event_id')),
 'ordinary officer can self-sign up');
reset role;
select is(private.process_finished_events(),1,'ended timed event processes');
select is((select points from point_transactions where event_id=-901),
  (select participation_points_per_hour_at_end from events where id=-901),
  'scheduled duration awards points');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select save_event_with_links('Edited past event','Metadata changed',
 (select id from event_types where name='Meeting'),'TBA','2020-09-20',
 '2020-09-20 09:00-06','2020-09-20 11:00-06',
 array[(select id from branches where name='intro')]::bigint[],-901,null,null)$$,
 'admin edits processed past event without recalculating award');
select is(remove_event(-901),true,'admin logically removes past event');
select is((select count(*) from event_officers where event_id=-901),1::bigint,
 'removed event retains signup');
reset role;
select * from finish();
rollback;
