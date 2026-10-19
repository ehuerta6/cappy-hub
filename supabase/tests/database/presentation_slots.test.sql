begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001401','slots-admin@example.org'),
 ('00000000-0000-4000-8000-000000001402','slots-intro-lead@example.org'),
 ('00000000-0000-4000-8000-000000001403','slots-icpc-lead@example.org'),
 ('00000000-0000-4000-8000-000000001404','slots-officer-a@example.org'),
 ('00000000-0000-4000-8000-000000001405','slots-officer-b@example.org'),
 ('00000000-0000-4000-8000-000000001406','slots-inactive@example.org'),
 ('00000000-0000-4000-8000-000000001407','slots-unlinked@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-1401,'Slots Admin','slots-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000001401'),
 (-1402,'Slots Intro Lead','slots-intro-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000001402'),
 (-1403,'Slots ICPC Lead','slots-icpc-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000001403'),
 (-1404,'Slots Officer A','slots-officer-a@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001404'),
 (-1405,'Slots Officer B','slots-officer-b@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001405'),
 (-1406,'Slots Inactive','slots-inactive@example.org',(select id from positions where name='Officer'),'inactive','officer','00000000-0000-4000-8000-000000001406');
insert into officer_branches(officer_id,branch_id)
select -1402,id from branches where name='intro' union all select -1403,id from branches where name='icpc';
with d as (select (now() at time zone 'America/Denver')::date local_date),
fixtures(id,name,day_offset,status,type_name,branch_name,is_removed) as (values
 (-1401,'Slots Intro session',2,'upcoming','Session','intro',false),
 (-1402,'Slots global session',2,'upcoming','Session',null,false),
 (-1403,'Slots cancelled session',2,'cancelled','Session','intro',false),
 (-1404,'Slots started session',-1,'past','Session','intro',false),
 (-1405,'Slots removed session',2,'upcoming','Session','intro',true),
 (-1406,'Slots workshop',2,'upcoming','Workshop','intro',false),
 (-1407,'Slots meeting',2,'upcoming','Meeting','intro',false),
 (-1408,'Slots social',2,'upcoming','Social','intro',false))
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,deleted_at,deleted_by)
select f.id,f.name,'Test event','TBA',(select id from event_types where lower(trim(name))=lower(f.type_name)),
 d.local_date+f.day_offset,((d.local_date+f.day_offset)::timestamp+time '09:00') at time zone 'America/Denver',
 ((d.local_date+f.day_offset)::timestamp+time '11:00') at time zone 'America/Denver',f.status,
 case when f.is_removed then now() end,case when f.is_removed then '00000000-0000-4000-8000-000000001401'::uuid end
from fixtures f cross join d;
insert into event_branches(event_id,branch_id)
select f.id,b.id from (values (-1401,'intro'),(-1403,'intro'),(-1404,'intro'),(-1405,'intro'),
 (-1406,'intro'),(-1407,'intro'),(-1408,'intro')) f(id,branch_name)
join branches b on b.name=f.branch_name;
-- Closed Sessions retain historical slots; the global Session anchors the type-change guard.
insert into presentation_slots(event_id,position) values(-1402,1),(-1403,1),(-1404,1),(-1405,1);

set local role anon;
select throws_ok($$select count(*) from presentation_slots$$,'42501',null,'anonymous reads are denied');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001407',true);
select is((select count(*) from presentation_slots),0::bigint,'unlinked accounts cannot read slots');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001404',true);
select throws_ok($$insert into presentation_slots(event_id,position) values(-1401,1)$$,'42501',null,'direct inserts are denied');
select throws_ok($$update presentation_slots set difficulty='Hard' where event_id=-1401$$,'42501',null,'direct updates are denied');
select throws_ok($$delete from presentation_slots where event_id=-1401$$,'42501',null,'direct deletes are denied');
select throws_ok($$select add_presenter_slot(-1406)$$,'P0001','Event outside branch scope','ordinary Officers cannot configure slots');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001403',true);
select throws_ok($$select add_presenter_slot(-1401)$$,'P0001','Event outside branch scope','cross-Branch managers are rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001402',true);
select throws_ok($$select add_presenter_slot(-1402)$$,'P0001','Event outside branch scope','Lead cannot configure global Event');
select throws_ok($$select add_presenter_slot(-1406)$$,'P0001','Presenter slots are only allowed for Session Events','Workshop is ineligible');
select throws_ok($$select add_presenter_slot(-1407)$$,'P0001','Presenter slots are only allowed for Session Events','Meeting is ineligible');
select throws_ok($$select add_presenter_slot(-1408)$$,'P0001','Presenter slots are only allowed for Session Events','Social Event is ineligible');
select throws_ok($$select add_presenter_slot(-1403)$$,'P0001','Presenter slots are closed for this event','cancelled Sessions are closed');
select throws_ok($$select add_presenter_slot(-1404)$$,'P0001','Presenter slots are closed for this event','started Sessions are closed');
select throws_ok($$select add_presenter_slot(-1405)$$,'P0001','Presenter slots are closed for this event','removed Sessions are closed');
reset role;
select throws_ok($$update events set event_type_id=(select id from event_types where name='Workshop') where id=-1402$$,
 'P0001','Remove presenter slots before changing this Event from Session type','event type change cannot strand slots');
select throws_ok($$update event_types set name='Club Session' where lower(trim(name))='session'$$,
 'P0001','Cannot rename the Session Event Type while presenter slots exist','canonical Session Event Type cannot be renamed around existing slots');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001402',true);

-- A Session starts with no slots. Add five independently identified records.
select is((select count(*) from presentation_slots where event_id=-1401),0::bigint,'zero slots is valid');
select lives_ok($$select add_presenter_slot(-1401)$$,'manager adds the first slot');
select lives_ok($$select add_presenter_slot(-1401)$$,'manager adds the second slot');
select lives_ok($$select add_presenter_slot(-1401)$$,'manager configures three slots');
select lives_ok($$select add_presenter_slot(-1401)$$,'manager adds a fourth slot');
select lives_ok($$select add_presenter_slot(-1401)$$,'manager adds a fifth slot');
select is((select array_agg(position order by position) from presentation_slots where event_id=-1401),array[1,2,3,4,5],
 'slot positions are consecutive and independent of slot IDs');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Two Sum','https://example.org/two-sum','Medium','Use a hash map.')$$,
 'manager records optional presentation details');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=2),'Interview preparation advice',null,'Medium',null)$$,
 'non-problem talk and repeated difficulty are accepted');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=3),null,null,'Nightmare',null)$$,
 'arbitrary free-text difficulty is accepted');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=4),null,null,'',null)$$,
 'blank difficulty is accepted');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=5),null,null,null,null)$$,
 'all optional presentation fields accept null');
select is((select difficulty from presentation_slots where event_id=-1401 and position=4),'','blank difficulty is stored as an empty value');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),null,'javascript:alert(1)',null,null)$$,
 'P0001','Resource link must be an HTTP(S) URL','unsafe URL scheme is rejected');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Two Sum','http://example.org/resource','Medium','Use a hash map.')$$,
 'HTTP resources are accepted');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Two Sum','http://example.org/resource','Medium','Use a hash map.')$$,
 'saving unchanged details is accepted');

-- Reorder changes only position; IDs and all slot data remain unchanged.
select lives_ok($$select reorder_presenter_slots(-1401,array[(select id from presentation_slots where event_id=-1401 and position=5),(select id from presentation_slots where event_id=-1401 and position=3),(select id from presentation_slots where event_id=-1401 and position=1),(select id from presentation_slots where event_id=-1401 and position=4),(select id from presentation_slots where event_id=-1401 and position=2)])$$,
 'manager reorders all stable slots');
select isnt((select id from presentation_slots where event_id=-1401 and position=1),(select position::bigint from presentation_slots where event_id=-1401 and position=1),'slot IDs do not define slot positions');
select is((select id from presentation_slots where event_id=-1401 and position=3),(select id from presentation_slots where event_id=-1401 and presentation_title='Two Sum'),
 'reorder preserves the slot identity and title');
select is((select difficulty from presentation_slots where event_id=-1401 and position=3),'Medium','reorder preserves difficulty');
select lives_ok($$select reorder_presenter_slots(-1401,array[(select id from presentation_slots where event_id=-1401 and position=1),(select id from presentation_slots where event_id=-1401 and position=2),(select id from presentation_slots where event_id=-1401 and position=3),(select id from presentation_slots where event_id=-1401 and position=4),(select id from presentation_slots where event_id=-1401 and position=5)])$$,
 'a repeated ordering is a no-op');
select throws_ok($$select reorder_presenter_slots(-1401,array[(select id from presentation_slots where event_id=-1401 and position=1)])$$,
 'P0001','Reorder must include every presenter slot exactly once','partial reorders are rejected');
reset role;
select is((select count(*) from audit_logs where action='presentation.slots_reordered' and entity_id='-1401'),1::bigint,
 'no-op reorders do not duplicate audit entries');

-- Self claims sign up and the same Officer may claim multiple slots.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001404',true);
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1404)$$,'Officer claims a slot');
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=2),-1404)$$,'one Officer may claim multiple slots');
select is((select count(*) from event_officers where event_id=-1401 and officer_id=-1404),1::bigint,'claim creates one confirmed signup');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Officer A talk','https://example.org/a','Nightmare','My notes')$$,
 'assigned Officer can edit their own slot details without manager rights');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=2),'Second talk',null,null,null)$$,
 'an Officer can edit a second slot they hold');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=3),'Not mine',null,null,null)$$,
 'P0001','Cannot manage another officer presenter slot for this event','Officer cannot edit another presenter slot');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=4),'Unclaimed',null,null,null)$$,
 'P0001','Cannot manage another officer presenter slot for this event','Officer cannot edit an empty slot');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001405',true);
select lives_ok($$select change_event_signup(-1401,-1405,false)$$,'existing signup can be made before a claim');
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=3),-1405)$$,'existing signup is reused for a claim');
select is((select count(*) from event_officers where event_id=-1401 and officer_id=-1405),1::bigint,'signup is not duplicated');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=3),'Officer B talk',null,'Medium',null)$$,
 'second assigned Officer can edit their own slot');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001403',true);
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=3),'Outside scope',null,null,null)$$,
 'P0001','Cannot manage another officer presenter slot for this event','Lead outside the Event Branch cannot edit presentation details');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001405',true);
select throws_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1405)$$,
 'P0001','Presenter slot is already taken','a slot cannot have two presenters');
select throws_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4),-1404)$$,
 'P0001','Cannot manage another officer presenter slot for this event','ordinary Officers cannot assign others');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001402',true);
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4),-1405)$$,'same-Branch Lead can assign a presenter');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=3),'Manager edit',null,null,null)$$,
 'same-Branch manager can edit another presenter''s slot');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=5),null,null,null,null)$$,
 'manager can edit an empty slot and save optional fields blank');
select throws_ok($$select remove_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4))$$,
 'P0001','Remove the presenter before removing their slot','populated slot deletion is rejected');
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4),-1405,true)$$,'manager can unassign a presenter');
select lives_ok($$select remove_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4))$$,'empty slot can be removed');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001404',true);
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1404,true)$$,'presenter can release one slot');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Former presentation',null,null,null)$$,
 'P0001','Cannot manage another officer presenter slot for this event','former presenter loses edit access after stepping down');
select is((select count(*) from presentation_slots where event_id=-1401 and officer_id=-1404),1::bigint,'releasing one slot leaves the other assigned');
select is((select count(*) from event_officers where event_id=-1401 and officer_id=-1404),1::bigint,'releasing a slot preserves Event signup');
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1404)$$,'Officer can reclaim a released slot');
select is((select count(*) from presentation_slots where event_id=-1401 and officer_id=-1404),2::bigint,'one Officer can hold two slots before signup removal');
select lives_ok($$select change_event_signup(-1401,-1404,true)$$,'signup removal is still supported');
select is((select count(*) from presentation_slots where event_id=-1401 and officer_id=-1404),0::bigint,'signup removal frees every slot held by that Officer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001401',true);
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1405)$$,'manager can claim on behalf of an active Officer');
select lives_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=1),'Admin edit',null,null,null)$$,
 'Admin retains edit access to an assigned presenter slot');
select lives_ok($$select save_officer('Slots Officer B',(select id from positions where name='Officer'),'inactive',null,-1405,'slots-officer-b@example.org')$$,'deactivation releases future slots');
select is((select count(*) from presentation_slots where event_id=-1401 and officer_id=-1405),0::bigint,'deactivation releases all future assignments');
select ok(exists(select 1 from event_officers where event_id=-1401 and officer_id=-1405),'deactivation preserves existing Event signup');
select throws_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=1),-1406)$$,
 'P0001','Target officer is not active','inactive Officers cannot be assigned');
select throws_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1403 and position=1),-1404)$$,
 'P0001','Presenter slots are closed for this event','cancelled Sessions reject mutations');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1403 and position=1),'Closed',null,null,null)$$,
 'P0001','Presenter slots are closed for this event','cancelled Sessions reject detail edits');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1404 and position=1),'Started',null,null,null)$$,
 'P0001','Presenter slots are closed for this event','started Sessions reject detail edits');
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1405 and position=1),'Removed',null,null,null)$$,
 'P0001','Presenter slots are closed for this event','removed Sessions reject detail edits');
reset role;
-- Model a stale assignment and confirm inactive Auth identities still cannot use self-edit.
insert into event_officers(event_id,officer_id) values(-1401,-1406);
update presentation_slots set officer_id=-1406 where event_id=-1401 and position=4;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001406',true);
select throws_ok($$select update_presenter_slot_details((select id from presentation_slots where event_id=-1401 and position=4),'Inactive',null,null,null)$$,
 'P0001','Unauthorized','inactive Officer cannot edit even a currently assigned slot');
reset role;
update presentation_slots set officer_id=null where event_id=-1401 and position=4 and officer_id=-1406;
delete from event_officers where event_id=-1401 and officer_id=-1406;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001401',true);
select ok(exists(select 1 from audit_logs where action='presentation.details_updated' and entity_id='-1401'),'detail edits are audited');
select ok(exists(select 1 from audit_logs where action='presentation.slot_added' and entity_id='-1401'),'slot creation is audited');
select ok(exists(select 1 from audit_logs where action='presentation.slot_removed' and entity_id='-1401'),'slot removal is audited');
select is((select count(*) from audit_logs where action='presentation.claimed' and entity_id='-1401' and details->>'officer_id'='-1404'),3::bigint,'a repeated claim does not duplicate its audit entry');
select ok(exists(select 1 from audit_logs where action='presentation.unassigned' and entity_id='-1401'),'manager unassignment is audited');
select ok(exists(select 1 from audit_logs where action='presentation.released' and entity_id='-1401' and details->>'reason'='signup_removed'),'signup release reason is audited');

-- Capacity checks count confirmed Officers, not the number of slots.
select lives_ok($$select save_officer('Slots Officer B',(select id from positions where name='Officer'),'active',null,-1405,'slots-officer-b@example.org')$$,'reactivate synthetic Officer for capacity coverage');
update events set max_volunteers=(select count(*) from event_officers where event_id=-1401) where id=-1401;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001404',true);
select throws_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4),-1404)$$,
 'P0001','Event capacity has been reached','full Session rejects new attendee presenter');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001405',true);
select lives_ok($$select change_presenter_slot((select id from presentation_slots where event_id=-1401 and position=4),-1405)$$,'full Session allows already-confirmed Officer another slot');
reset role;

-- Constraints, rather than client behavior, own Session eligibility and signup integrity.
select throws_ok($$insert into presentation_slots(event_id,position) values(-1406,1)$$,'P0001','Presenter slots are only allowed for Session Events','direct trusted insert still enforces Session type');
select throws_ok($$insert into presentation_slots(event_id,position,officer_id) values(-1401,99,-1403)$$,'23503',null,'assigned presenters require confirmed Event signup');

select * from finish();
rollback;
