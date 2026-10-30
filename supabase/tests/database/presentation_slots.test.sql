begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001401','slots-admin@example.org'),
 ('00000000-0000-4000-8000-000000001402','slots-intro-lead@example.org'),
 ('00000000-0000-4000-8000-000000001404','slots-officer-a@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-1401,'Slots Admin','slots-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000001401'),
 (-1402,'Slots Intro Lead','slots-intro-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000001402'),
 (-1404,'Slots Officer A','slots-officer-a@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001404');
insert into officer_branches(officer_id,branch_id)
select -1402,id from branches where name='intro';
with d as (select (now() at time zone 'America/Denver')::date local_date),
fixtures(id,name,day_offset,status,type_name,branch_name) as (values
 (-1401,'Slots intro session',2,'upcoming','Session','intro'),
 (-1402,'Slots global session',2,'upcoming','Session',null),
 (-1403,'Slots cancelled session',2,'cancelled','Session','intro'))
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
select f.id,f.name,'Test event','TBA',(select id from event_types where lower(trim(name))=lower(f.type_name)),
 d.local_date+f.day_offset,((d.local_date+f.day_offset)::timestamp+time '09:00') at time zone 'America/Denver',
 ((d.local_date+f.day_offset)::timestamp+time '11:00') at time zone 'America/Denver',f.status
from fixtures f cross join d;
insert into event_branches(event_id,branch_id)
select -1401,id from branches where name='intro' union all
select -1403,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values(-1401,-1404);
insert into presentation_slots(id,event_id,position,officer_id,presentation_title,difficulty,resource_url,prep_notes)
values
 (-14011,-1401,1,-1404,'Historical topic','Medium','https://example.org/talk','Historical notes'),
 (-14021,-1402,1,null,'Unassigned historical topic',null,null,null),
 (-14031,-1403,1,null,null,null,null,null);

select ok(not has_function_privilege('authenticated','public.add_presenter_slot(bigint)','execute'),
  'authenticated cannot execute the public Presenter Slot create RPC');
select ok(not has_function_privilege('authenticated','public.reorder_presenter_slots(bigint,bigint[])','execute'),
  'authenticated cannot execute the public Presenter Slot reorder RPC');
select ok(not has_function_privilege('authenticated','public.remove_presenter_slot(bigint)','execute'),
  'authenticated cannot execute the public Presenter Slot remove RPC');
select ok(not has_function_privilege('authenticated','public.change_presenter_slot(bigint,bigint,boolean)','execute'),
  'authenticated cannot execute the public Presenter Slot assignment RPC');
select ok(not has_function_privilege('authenticated','public.update_presenter_slot_details(bigint,text,text,text,text)','execute'),
  'authenticated cannot execute the public Presenter Slot details RPC');
select ok(not has_function_privilege('authenticated','private.add_presenter_slot(bigint)','execute'),
  'authenticated cannot execute the private Presenter Slot create function');
select ok(not has_function_privilege('authenticated','private.change_presenter_slot(bigint,bigint,boolean)','execute'),
  'authenticated cannot execute the private Presenter Slot assignment function');

set local role anon;
select throws_ok($$select count(*) from presentation_slots$$,'42501',null,'anonymous reads remain denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001404',true);
select is((select count(*) from presentation_slots where event_id=-1401),1::bigint,
  'active Officers retain read access to historical presentation records');
select throws_ok($$insert into presentation_slots(event_id,position) values(-1401,2)$$,
  '42501',null,'direct creation remains denied');
select throws_ok($$update presentation_slots set difficulty='Changed' where id=-14011$$,
  '42501',null,'direct detail changes remain denied');
select throws_ok($$delete from presentation_slots where id=-14011$$,
  '42501',null,'direct historical deletion remains denied');
select throws_ok($$select add_presenter_slot(-1401)$$,'42501',null,'Presenter Slot creation is unavailable');
select throws_ok($$select reorder_presenter_slots(-1401,array[-14011])$$,'42501',null,'Presenter Slot ordering is unavailable');
select throws_ok($$select remove_presenter_slot(-14011)$$,'42501',null,'Presenter Slot removal is unavailable');
select throws_ok($$select change_presenter_slot(-14011,-1404,false)$$,'42501',null,'Presenter assignment is unavailable');
select throws_ok($$select update_presenter_slot_details(-14011,'Changed',null,null,null)$$,'42501',null,
  'presentation details are read-only');
select lives_ok($$select change_event_signup(-1401,-1404,true)$$,
  'ordinary Event signup removal remains available');
select is((select officer_id from presentation_slots where id=-14011),-1404::bigint,
  'signup removal preserves historical assigned Officer');
select is((select presentation_title from presentation_slots where id=-14011),'Historical topic',
  'signup removal preserves historical presentation details');
reset role;
select is((select count(*) from audit_logs where action='presentation.released'
  and entity_id='-1401' and details->>'reason'='signup_removed'),0::bigint,
  'ordinary signup removal does not rewrite or audit a Presenter Slot release');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001401',true);
select lives_ok($$select save_officer('Slots Officer A',(select id from positions where name='Officer'),'inactive',null,-1404,'slots-officer-a@example.org')$$,
  'ordinary Officer deactivation remains available');
select is((select officer_id from presentation_slots where id=-14011),-1404::bigint,
  'Officer deactivation preserves historical assignment');
reset role;
select is((select count(*) from audit_logs where action='presentation.released'
  and entity_id='-1401' and details->>'reason'='officer_deactivated'),0::bigint,
  'Officer deactivation does not rewrite or audit a Presenter Slot release');

select lives_ok($$update events set event_type_id=(select id from event_types where name='Workshop') where id=-1402$$,
  'historical Presenter Slot rows do not block changing an Event type');
select lives_ok($$select private.replace_event_time_slots(-1402,
  '[{"start_time":"09:15","end_time":"09:45","capacity":2}]'::jsonb)$$,
  'historical Presenter Slot rows do not block eligible Volunteer Time Slots');
select is((select count(*) from event_time_slots where event_id=-1402),1::bigint,
  'Volunteer Time Slot creation remains available after preserving presentation history');
select throws_ok($$select private.replace_event_time_slots(-1403,
  '[{"start_time":"09:15","end_time":"09:45"}]'::jsonb)$$,
  'P0001','Time Slots are unavailable for Session Events','Session Events remain ineligible for Volunteer Time Slots');
select lives_ok($$update event_types set name='Session history' where lower(trim(name))='session'$$,
  'historical Presenter Slot rows do not block Event Type edits');
select is((select id from presentation_slots where id=-14011),-14011::bigint,
  'historical Presenter Slot ID remains stable');
select is((select position from presentation_slots where id=-14011),1,
  'historical Presenter Slot order remains stable');
select ok(exists(select 1 from audit_logs where action='presentation.slot_added' and entity_id='-1401'),
  'historical System Log evidence remains readable');

select * from finish();
rollback;
