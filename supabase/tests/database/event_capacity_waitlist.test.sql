begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001780','capacity-admin@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-1780,'Capacity Admin','capacity-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000001780'),
 (-1781,'Confirmed A','capacity-a@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1782,'Waitlisted inactive','capacity-b@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1783,'Waitlisted B','capacity-c@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1784,'Waitlisted C','capacity-d@example.test',(select id from positions where name='Officer'),'active','officer',null);

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
values
 (-1780,'Capacity future','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-01',timestamptz '2099-02-01 16:00Z',timestamptz '2099-02-01 17:00Z','upcoming',1),
 (-1785,'Capacity limited','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-02',timestamptz '2099-02-02 16:00Z',timestamptz '2099-02-02 17:00Z','upcoming',1),
 (-1786,'Capacity reduction','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-03',timestamptz '2099-02-03 16:00Z',timestamptz '2099-02-03 17:00Z','upcoming',2),
 (-1787,'Capacity processed past','Test Event','TBA',(select id from event_types where name='Meeting'),date '2000-02-01',timestamptz '2000-02-01 16:00Z',timestamptz '2000-02-01 17:00Z','past',1),
 (-1788,'Capacity closed','Test Event','TBA',(select id from event_types where name='Meeting'),date '2000-02-02',timestamptz '2000-02-02 16:00Z',timestamptz '2000-02-02 17:00Z','past',1),
 (-1789,'Capacity cancelled','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-04',timestamptz '2099-02-04 16:00Z',timestamptz '2099-02-04 17:00Z','cancelled',1),
 (-1790,'Capacity archived','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-05',timestamptz '2099-02-05 16:00Z',timestamptz '2099-02-05 17:00Z','upcoming',1),
 (-1791,'Capacity leave waitlist','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-06',timestamptz '2099-02-06 16:00Z',timestamptz '2099-02-06 17:00Z','upcoming',1);
update events set deleted_at=pg_catalog.now(),deleted_by='00000000-0000-4000-8000-000000001780' where id=-1790;
insert into event_officers(event_id,officer_id) values
 (-1780,-1781),(-1785,-1781),(-1786,-1781),(-1786,-1783),(-1787,-1781),(-1788,-1781),(-1791,-1781);

select ok((select max_volunteers is null from events where id=-1789)=false,'limited Event stores its optional positive capacity');
select throws_ok($$update events set max_volunteers=0 where id=-1780$$,'23514',null,
  'database rejects a non-positive capacity');
select throws_ok($$insert into event_officers(event_id,officer_id) values(-1780,-1783)$$,
  'P0001','Event capacity has been reached','confirmed roster cannot exceed the capacity even through a direct writer');
select throws_ok($$insert into event_waitlist(event_id,officer_id) values(-1780,-1781)$$,
  'P0001','Officer is already confirmed for this Event','confirmed and waitlisted membership cannot overlap');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select lives_ok($$select change_event_signup(-1780,-1782,false)$$,'full Event routes signup to waitlist');
select lives_ok($$select change_event_signup(-1780,-1783,false)$$,'later signup joins behind the first waitlisted Officer');
select lives_ok($$select change_event_signup(-1791,-1784,false)$$,'Officer can join a separate Event waitlist');
select lives_ok($$select leave_event_waitlist(-1791,-1784)$$,'Officer can leave the waitlist');
select is((select count(*) from event_waitlist where event_id=-1791),0::bigint,'leaving removes only the waitlist entry');
select is((select count(*) from event_officers where event_id=-1780),1::bigint,'full Event remains at capacity');
select is((select officer_id from event_waitlist where event_id=-1780 order by joined_at,id limit 1),-1782::bigint,'waitlist uses FIFO order');
select is((select count(*) from event_waitlist where event_id=-1780 and officer_id=-1782),1::bigint,'waitlist prevents duplicate entries');
select throws_ok($$select bulk_add_event_officers(-1780,array[-1784]::bigint[])$$,'P0001','The selected Officers exceed the Event capacity',
  'manager bulk addition cannot bypass a full Event capacity');
reset role;

-- An Officer can become ineligible after joining; promotion drops that row and
-- continues to the next eligible FIFO candidate.
update officers set status='inactive' where id=-1782;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select lives_ok($$select change_event_signup(-1780,-1781,true)$$,'leaving confirmed signup opens a spot');
reset role;
select is((select officer_id from event_officers where event_id=-1780),-1783::bigint,
  'inactive first candidate is skipped and the next eligible Officer is promoted');
select is((select count(*) from event_waitlist where event_id=-1780),0::bigint,
  'inactive skipped candidate is removed without blocking FIFO');
select is((select count(*) from point_transactions where event_id=-1780),0::bigint,
  'future waitlist transitions do not create participation Points');
select ok(exists(select 1 from audit_logs where action='event.waitlist_joined' and entity_id='-1780'),
  'waitlist joining is audited');
select ok(exists(select 1 from audit_logs where action='event.waitlist_promoted' and entity_id='-1780'),
  'waitlist promotion is audited');

-- Capacity increases promote one FIFO entry; unlimited promotes all remaining.
update officers set status='active' where id=-1782;
insert into event_waitlist(event_id,officer_id) values(-1785,-1782),(-1785,-1783);
reset role;
select lives_ok($$select private.set_event_capacity(-1785,2)$$,'increase capacity succeeds');
select is((select officer_id from event_officers where event_id=-1785 and officer_id=-1782),-1782::bigint,
  'capacity increase promotes FIFO first');
select lives_ok($$select private.set_event_capacity(-1785,null)$$,'limited Event can become unlimited');
select is((select count(*) from event_officers where event_id=-1785),3::bigint,
  'unlimited transition promotes all remaining eligible waitlist entries');
select is((select count(*) from event_waitlist where event_id=-1785),0::bigint,
  'unlimited transition leaves no active waitlist entries');
select is((select count(*) from audit_logs where action='event.capacity_changed' and entity_id='-1785'),2::bigint,
  'capacity changes are audited');

update officers set status='inactive' where id=-1782;

reset role;
select throws_ok($$select private.set_event_capacity(-1786,1)$$,'P0001',
  'Max volunteers cannot be lower than the confirmed signup count','lowering capacity below current roster is rejected');
select is((select max_volunteers from events where id=-1786),2,'rejected capacity decrease leaves the old limit unchanged');
select is((select count(*) from event_officers where event_id=-1786),2::bigint,'rejected decrease retains every confirmed Officer');

insert into event_waitlist(event_id,officer_id) values(-1788,-1784);
reset role;
select lives_ok($$select private.set_event_capacity(-1788,null)$$,
  'manager can edit a closed unprocessed Event capacity');
select is((select count(*) from event_officers where event_id=-1788),1::bigint,
  'ended Event capacity edit does not promote its closed waitlist');
select is((select count(*) from event_waitlist where event_id=-1788 and officer_id=-1784),1::bigint,
  'ended Event waitlist remains preserved after capacity edit');

set local role authenticated;
select throws_ok($$select change_event_signup(-1788,-1784,false)$$,'P0001','Signups are closed for this event','closed Event rejects signup');
select throws_ok($$select change_event_signup(-1789,-1784,false)$$,'P0001','Signups are closed for this event','cancelled Event rejects signup');
select throws_ok($$select change_event_signup(-1790,-1784,false)$$,'P0001','Signups are closed for this event','archived Event rejects signup');
select throws_ok($$select change_event_signup(-1780,-1782,false)$$,'P0001','Target officer is not active','inactive Officer cannot join waitlist');
reset role;
select is((select count(*) from event_officers where event_id=-1787),1::bigint,'past Event starts with its confirmed roster');

-- The scheduled processor reads only confirmed event_officers. A waitlisted
-- Officer on a completed Event receives no participation transaction.
insert into event_waitlist(event_id,officer_id) values(-1787,-1784);
select private.process_finished_events();
select is((select count(*) from point_transactions where event_id=-1787 and award_type='participation'),1::bigint,
  'only the confirmed Officer receives participation Points');
select is((select count(*) from point_transactions where event_id=-1787 and officer_id=-1784),0::bigint,
  'waitlisted Officer receives no participation Points');
reset role;
select lives_ok($$select private.set_event_capacity(-1787,null)$$,
  'manager may edit capacity on a past Event');
select is((select count(*) from event_officers where event_id=-1787),1::bigint,
  'past capacity edit does not change the historical confirmed roster');
select is((select count(*) from event_waitlist where event_id=-1787 and officer_id=-1784),1::bigint,
  'closed waitlist entry is preserved when a past Event capacity changes');
select is((select count(*) from point_transactions where event_id=-1787 and officer_id=-1784),0::bigint,
  'past capacity edit does not award participation to a waitlisted Officer');

-- Recurring creation applies capacity to every materialized occurrence. A
-- scoped edit changes only its requested occurrence range.
select set_config('test.capacity_series_first',public.create_recurring_event_with_capacity(
  'Capacity recurrence','Test Event',(select id from event_types where name='Meeting'),'TBA',
  '{}'::bigint[],null,null,null,2,'00000000-0000-4000-8000-000000001791',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-05-01'::date,'2099-05-02','2099-05-03'],
  array['2099-05-01 16:00Z'::timestamptz,'2099-05-02 16:00Z','2099-05-03 16:00Z'],
  array['2099-05-01 17:00Z'::timestamptz,'2099-05-02 17:00Z','2099-05-03 17:00Z'])::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select is(public.create_recurring_event_with_capacity(
  'Capacity recurrence','Test Event',(select id from event_types where name='Meeting'),'TBA',
  '{}'::bigint[],null,null,null,2,'00000000-0000-4000-8000-000000001791',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-05-01'::date,'2099-05-02','2099-05-03'],
  array['2099-05-01 16:00Z'::timestamptz,'2099-05-02 16:00Z','2099-05-03 16:00Z'],
  array['2099-05-01 17:00Z'::timestamptz,'2099-05-02 17:00Z','2099-05-03 17:00Z']),
  current_setting('test.capacity_series_first')::bigint,'recurring creation retry returns its original occurrence');
reset role;
select is((select count(*) from events where recurrence_series_id=(select recurrence_series_id
  from events where id=current_setting('test.capacity_series_first')::bigint) and max_volunteers=2),
  3::bigint,'recurring creation applies capacity to each occurrence');
select set_config('test.capacity_series_id',(select recurrence_series_id::text from events
  where id=current_setting('test.capacity_series_first')::bigint),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select lives_ok($$select mutate_recurring_event_with_capacity(
  (select id from events where recurrence_series_id=current_setting('test.capacity_series_id')::bigint and recurrence_key='2099-05-02'),
  'occurrence','edit','00000000-0000-4000-8000-000000001792',
  current_setting('test.capacity_series_id')::bigint,
  (select revision from event_series where id=current_setting('test.capacity_series_id')::bigint),
  '{}'::jsonb,null,null,true,3)$$,'occurrence capacity edit succeeds');
reset role;
select is((select max_volunteers from events where recurrence_series_id=current_setting('test.capacity_series_id')::bigint
  and recurrence_key='2099-05-01'),2,'occurrence capacity edit leaves its earlier sibling unchanged');
select is((select max_volunteers from events where recurrence_series_id=current_setting('test.capacity_series_id')::bigint
  and recurrence_key='2099-05-02'),3,'occurrence capacity edit changes only the selected occurrence');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select lives_ok($$select mutate_recurring_event_with_capacity(
  (select id from events where recurrence_series_id=current_setting('test.capacity_series_id')::bigint and recurrence_key='2099-05-02'),
  'following','edit','00000000-0000-4000-8000-000000001793',
  current_setting('test.capacity_series_id')::bigint,
  (select revision from event_series where id=current_setting('test.capacity_series_id')::bigint),
  '{}'::jsonb,null,null,true,4)$$,'following capacity edit succeeds');
reset role;
select is((select count(*) from events where recurrence_series_id=current_setting('test.capacity_series_id')::bigint
  and recurrence_key>='2099-05-02' and max_volunteers=4),2::bigint,
  'following capacity edit changes the selected and later occurrences');

-- Schedule extensions inherit the selected occurrence's capacity without
-- overwriting independent capacities already stored on materialized rows.
select set_config('test.inherit_first',public.create_recurring_event_with_capacity(
  'Capacity inheritance','Test Event',(select id from event_types where name='Meeting'),'TBA',
  '{}'::bigint[],null,null,null,6,'00000000-0000-4000-8000-000000001794',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
  array['2099-06-10'::date,'2099-06-11','2099-06-12'],
  array['2099-06-10 16:00Z'::timestamptz,'2099-06-11 16:00Z','2099-06-12 16:00Z'],
  array['2099-06-10 17:00Z'::timestamptz,'2099-06-11 17:00Z','2099-06-12 17:00Z'])::text,true);
select set_config('test.inherit_series',(select recurrence_series_id::text from events
  where id=current_setting('test.inherit_first')::bigint),true);
select set_config('test.inherit_selected_id',(select id::text from events where recurrence_series_id=current_setting('test.inherit_series')::bigint
  and recurrence_key='2099-06-11'),true);
select set_config('test.inherit_later_id',(select id::text from events where recurrence_series_id=current_setting('test.inherit_series')::bigint
  and recurrence_key='2099-06-12'),true);
select set_config('test.inherit_revision',(select revision::text from event_series
  where id=current_setting('test.inherit_series')::bigint),true);
select private.set_event_capacity(current_setting('test.inherit_selected_id')::bigint,9);
select private.set_event_capacity(current_setting('test.inherit_later_id')::bigint,12);
set local role authenticated;
select lives_ok($$select mutate_recurring_event_with_capacity(
  current_setting('test.inherit_selected_id')::bigint,
  'following','edit','00000000-0000-4000-8000-000000001795',
  current_setting('test.inherit_series')::bigint,
  current_setting('test.inherit_revision')::integer,
  '{}'::jsonb,'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4',
  array['2099-06-11'::date,'2099-06-12','2099-06-13','2099-06-14'],false,0)$$,
  'following schedule extension without a capacity edit succeeds');
select lives_ok($$select mutate_recurring_event_with_capacity(
  current_setting('test.inherit_selected_id')::bigint,
  'following','edit','00000000-0000-4000-8000-000000001795',
  current_setting('test.inherit_series')::bigint,
  current_setting('test.inherit_revision')::integer,
  '{}'::jsonb,'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4',
  array['2099-06-11'::date,'2099-06-12','2099-06-13','2099-06-14'],false,0)$$,
  'exact schedule extension retry succeeds without resetting inherited capacities');
reset role;
select is((select max_volunteers from events where id=current_setting('test.inherit_first')::bigint),6,
  'following schedule extension leaves the earlier occurrence capacity unchanged');
select set_config('test.inherit_child',(select recurrence_series_id::text from events
  where id=current_setting('test.inherit_selected_id')::bigint),true);
select is((select max_volunteers from events where id=current_setting('test.inherit_selected_id')::bigint),9,
  'following schedule edit preserves selected occurrence capacity');
select is((select max_volunteers from events where id=current_setting('test.inherit_later_id')::bigint),12,
  'following schedule edit preserves an existing independent override');
select is((select count(*) from events where recurrence_series_id=current_setting('test.inherit_child')::bigint
  and recurrence_key in ('2099-06-13','2099-06-14')
  and max_volunteers=9),2::bigint,'new following occurrences inherit the selected occurrence capacity');
select private.set_event_capacity((select id from events where recurrence_series_id=current_setting('test.inherit_child')::bigint
  and recurrence_key='2099-06-13'),15);
set local role authenticated;
select lives_ok($$select mutate_recurring_event_with_capacity(
  (select id from events where recurrence_series_id=current_setting('test.inherit_child')::bigint and recurrence_key='2099-06-11'),
  'series','edit','00000000-0000-4000-8000-000000001796',
  current_setting('test.inherit_child')::bigint,
  (select revision from event_series where id=current_setting('test.inherit_child')::bigint),
  '{}'::jsonb,'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=5',
  array['2099-06-11'::date,'2099-06-12','2099-06-13','2099-06-14','2099-06-15'],false,0)$$,
  'all-occurrence schedule extension without a capacity edit succeeds');
reset role;
select set_config('test.inherit_series_after_all',(select recurrence_series_id::text from events
  where id=current_setting('test.inherit_selected_id')::bigint),true);
select is((select max_volunteers from events where recurrence_series_id=current_setting('test.inherit_series_after_all')::bigint
  and recurrence_key='2099-06-13'),15,
  'all-occurrence schedule edit preserves an independent capacity override');
select is((select max_volunteers from events where recurrence_series_id=current_setting('test.inherit_series_after_all')::bigint
  and recurrence_key='2099-06-15'),9,
  'new all-occurrence schedule rows inherit the selected occurrence capacity');
select is((select max_volunteers from events where id=-1780),1,
  'recurring capacity edits do not alter unrelated Events');

select * from finish();
rollback;
