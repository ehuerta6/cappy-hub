begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000331','bulk-admin@example.org'),
 ('00000000-0000-4000-8000-000000000332','bulk-president@example.org'),
 ('00000000-0000-4000-8000-000000000333','bulk-vp@example.org'),
 ('00000000-0000-4000-8000-000000000334','bulk-intro-lead@example.org'),
 ('00000000-0000-4000-8000-000000000335','bulk-icpc-lead@example.org'),
 ('00000000-0000-4000-8000-000000000336','bulk-officer@example.org'),
 ('00000000-0000-4000-8000-000000000337','bulk-inactive@example.org'),
 ('00000000-0000-4000-8000-000000000340','bulk-academics-vp@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-331,'Bulk Admin','bulk-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000000331'),
 (-332,'Bulk President','bulk-president@example.org',(select id from positions where name='President'),'active','officer','00000000-0000-4000-8000-000000000332'),
 (-333,'Bulk Operations VP','bulk-vp@example.org',(select id from positions where name='Vice President of Operations'),'active','officer','00000000-0000-4000-8000-000000000333'),
 (-334,'Bulk Intro Lead','bulk-intro-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000000334'),
 (-335,'Bulk ICPC Lead','bulk-icpc-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000000335'),
 (-336,'Bulk Officer','bulk-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000000336'),
 (-337,'Bulk Inactive','bulk-inactive@example.org',(select id from positions where name='Officer'),'inactive','officer','00000000-0000-4000-8000-000000000337'),
 (-338,'Bulk Target A','bulk-a@example.org',(select id from positions where name='Officer'),'active','officer',null),
 (-339,'Bulk Target B','bulk-b@example.org',(select id from positions where name='Officer'),'active','officer',null),
 (-340,'Bulk Academics VP','bulk-academics-vp@example.org',(select id from positions where name='Vice President of Academics'),'active','officer','00000000-0000-4000-8000-000000000340');
insert into officer_branches(officer_id,branch_id)
select -334,id from branches where name='intro'
union all select -335,id from branches where name='icpc';
with denver_today as (
  select (now() at time zone 'America/Denver')::date as local_date
), fixtures(id,name,day_offset,start_time,end_time,status,rate,is_removed) as (
  values
    (-331,'Bulk future',1,time '09:00',time '11:00','upcoming',null::numeric,false),
    (-332,'Bulk Intro',1,time '09:00',time '11:00','upcoming',null::numeric,false),
    (-333,'Bulk ICPC',1,time '09:00',time '11:00','upcoming',null::numeric,false),
    (-334,'Bulk processed past',-1,time '09:00',time '10:30','past',4::numeric,false),
    (-335,'Bulk unprocessed past',-1,time '09:00',time '11:00','past',null::numeric,false),
    (-336,'Bulk cancelled',-1,time '09:00',time '10:00','cancelled',null::numeric,false),
    (-337,'Bulk removed',-1,time '09:00',time '10:00','past',null::numeric,true)
)
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status,
 participation_points_per_hour_at_end,deleted_at)
select f.id,f.name,'Test event','TBA',(select id from event_types where name='Meeting'),
  ((d.local_date+f.day_offset)::timestamp+f.start_time) at time zone 'America/Denver',
  ((d.local_date+f.day_offset)::timestamp+f.end_time) at time zone 'America/Denver',
  f.status,f.rate,case when f.is_removed then
    ((d.local_date+f.day_offset)::timestamp+f.end_time) at time zone 'America/Denver' end
from denver_today d cross join fixtures f;
insert into event_branches(event_id,branch_id)
select -332,id from branches where name='intro'
union all select -333,id from branches where name='icpc';
update application_config set participation_points_per_hour=2.5 where id=1;

select ok(not has_function_privilege('anon','public.bulk_add_event_officers(bigint,bigint[])','EXECUTE')
  and has_function_privilege('authenticated','public.bulk_add_event_officers(bigint,bigint[])','EXECUTE')
  and has_function_privilege('authenticated','private.bulk_add_event_officers(bigint,bigint[])','EXECUTE'),
  'only authenticated users can call the guarded public RPC');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-331,array[-338,-339,-338]::bigint[])$$,
  'admin bulk adds multiple active officers and deduplicates submitted IDs');
reset role;
select is((select count(*) from event_officers where event_id=-331),2::bigint,
  'future event has one signup per selected officer');
select is((select count(*) from point_transactions where event_id=-331),0::bigint,
  'future bulk signup creates no participation points');
select ok(exists(select 1 from audit_logs where action='event.officers_bulk_added'
  and entity_id='-331' and actor_id='00000000-0000-4000-8000-000000000331'
  and details->'officer_ids' @> '[-338,-339]'::jsonb),
  'bulk audit records event, actor and newly added officers');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000336',true);
set local role authenticated;
select throws_ok($$select bulk_add_event_officers(-331,array[-338]::bigint[])$$,
  'P0001','Event outside branch scope','normal officer cannot bulk add other officers');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000334',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-332,array[-338,-339]::bigint[])$$,
  'matching branch Lead can bulk add officers');
select throws_ok($$select bulk_add_event_officers(-333,array[-338]::bigint[])$$,
  'P0001','Event outside branch scope','Lead cannot bulk manage an outside branch event');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000335',true);
set local role authenticated;
select throws_ok($$select bulk_add_event_officers(-332,array[-338]::bigint[])$$,
  'P0001','Event outside branch scope','nonmatching branch Lead is rejected');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000332',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-331,array[-338]::bigint[])$$,
  'President can bulk manage an event');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000333',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-331,array[-339]::bigint[])$$,
  'Vice President can bulk manage an event');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000340',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-331,array[-338]::bigint[])$$,
  'Vice President of Academics can bulk manage an event');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
set local role authenticated;
select throws_ok($$select bulk_add_event_officers(-331,array[-337]::bigint[])$$,
  'P0001','All target officers must be active','inactive target officer is rejected');
select throws_ok($$select bulk_add_event_officers(-331,array[-999999]::bigint[])$$,
  'P0001','All target officers must be active','nonexistent target officer is rejected');
select throws_ok($$select bulk_add_event_officers(-336,array[-338]::bigint[])$$,
  'P0001','This event cannot accept attendees','cancelled event is rejected');
select throws_ok($$select bulk_add_event_officers(-337,array[-338]::bigint[])$$,
  'P0001','This event cannot accept attendees','removed event is rejected');
select throws_ok($$select bulk_add_event_officers(-331,'{}'::bigint[])$$,
  'P0001','Select at least one valid officer','empty target list is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000337',true);
set local role authenticated;
select throws_ok($$select bulk_add_event_officers(-331,array[-338]::bigint[])$$,
  'P0001','Unauthorized','inactive actor cannot bulk manage Events');
reset role;

-- This event's saved historical rate remains authoritative after a config change.
update application_config set participation_points_per_hour=99 where id=1;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
insert into event_officers(event_id,officer_id) values(-334,-338);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-334,array[-338,-339]::bigint[])$$,
  'processed past Event adds attendees and creates participation awards');
reset role;
select is((select count(*) from event_officers where event_id=-334),2::bigint,
  'past attendees are linked to the event');
select is((select count(*) from point_transactions where event_id=-334
  and award_type='participation'),2::bigint,'past bulk creates Event participation awards');
select is((select min(points) from point_transactions where event_id=-334),6::numeric,
  '90 minute duration uses saved 4 point/hour snapshot');
select is((select count(*) from point_transactions where event_id=-334
  and award_type='participation' and event_id=-334 and reason='Event participation'),
  2::bigint,'awards retain participation type, event link and standard reason');
select is((select count(*) from point_transactions where event_id=-334
  and officer_id in (-338,-339)),2::bigint,'first request creates one award per officer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-334,array[-338,-339]::bigint[])$$,
  'repeated past request is idempotent');
reset role;
select is((select count(*) from point_transactions where event_id=-334
  and award_type='participation'),2::bigint,'repeat does not create duplicate awards');
select is((select count(*) from audit_logs where action='event.officers_bulk_added'
  and entity_id='-334'),1::bigint,'no duplicate audit entry is written for a no-op');

-- An unprocessed past Event snapshots the live configured rate once. The
-- automatic processor's existing signups must be awarded in the same pass.
insert into event_officers(event_id,officer_id) values(-335,-339);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-335,array[-338]::bigint[])$$,
  'past unprocessed Event snapshots rate and awards attendees');
reset role;
select is((select count(*) from event_officers where event_id=-335),2::bigint,
  'first processing pass keeps earlier signups and adds selected attendee');
select is((select participation_points_per_hour_at_end from events where id=-335),
  99::numeric,'first bulk operation snapshots the current configured rate');
select is((select min(points) from point_transactions where event_id=-335),198::numeric,
  'two hour Event duration times current saved rate');
select is(private.process_finished_events(),0,
  'automatic processor does not duplicate bulk generated past awards');
select is((select count(*) from point_transactions where event_id=-335
  and award_type='participation'),2::bigint,'awards remain unique after processor run');
update application_config set participation_points_per_hour=77 where id=1;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000331',true);
set local role authenticated;
select lives_ok($$select bulk_add_event_officers(-335,array[-338]::bigint[])$$,
  'repeated unprocessed Event request preserves its first snapshot');
reset role;
select is((select participation_points_per_hour_at_end from events where id=-335),
  99::numeric,'repeat does not resnapshot after the global rate changes');
select is((select count(*) from point_transactions where event_id=-335
  and award_type='participation'),2::bigint,'unprocessed Event repeat does not duplicate awards');
select ok(exists(select 1 from audit_logs where action='event.officers_bulk_added'
  and entity_id='-335' and (details->>'participation_rate')::numeric=99
  and (details->>'points_per_officer')::numeric=198
  and details->'participation_awards_created' @> '[-338,-339]'::jsonb),
  'past operation audit records rate, points and generated awards');
select ok(exists(select 1 from audit_logs where action='points.participation_created'
  and details->>'event_id'='-335' and (details->>'rate')::numeric=99
  and (details->>'points')::numeric=198),
  'each award keeps its standard point creation audit');

with denver_today as (
  select (now() at time zone 'America/Denver')::date as local_date
)
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status)
select -338,'Bulk atomicity','Test event','TBA',(select id from event_types where name='Meeting'),
  ((local_date-1)::timestamp+time '09:00') at time zone 'America/Denver',
  ((local_date-1)::timestamp+time '10:00') at time zone 'America/Denver','past'
from denver_today;
alter table audit_logs add constraint reject_bulk_event_audit
  check (action <> 'event.officers_bulk_added') not valid;
select throws_ok($$select bulk_add_event_officers(-338,array[-338]::bigint[])$$,
  '23514',null,'bulk audit failure aborts the complete transaction');
select is((select count(*) from event_officers where event_id=-338),0::bigint,
  'failed bulk audit rolls back attendee signup');
select is((select count(*) from point_transactions where event_id=-338),0::bigint,
  'failed bulk audit rolls back participation award');
select is((select participation_points_per_hour_at_end from events where id=-338),
  null::numeric,'failed bulk audit rolls back rate snapshot');
alter table audit_logs drop constraint reject_bulk_event_audit;

select * from finish();
rollback;
