begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001780','capacity-admin@example.test'),
 ('00000000-0000-4000-8000-000000001781','capacity-viewer@example.test'),
 ('00000000-0000-4000-8000-000000001782','capacity-candidate@example.test'),
 ('00000000-0000-4000-8000-000000001783','capacity-candidate-b@example.test'),
 ('00000000-0000-4000-8000-000000001784','capacity-manager@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-1780,'Capacity Admin','capacity-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000001780'),
 (-1781,'Confirmed A','capacity-a@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1782,'Capacity candidate A','capacity-b@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1783,'Capacity candidate B','capacity-c@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1784,'Capacity candidate C','capacity-d@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-1792,'Count viewer','capacity-viewer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001781'),
 (-1793,'Count viewer A','capacity-candidate@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001782'),
 (-1794,'Count viewer B','capacity-candidate-b@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000001783'),
 (-1795,'Count manager','capacity-manager@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000001784');

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers)
values
 (-1780,'Capacity future','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-01',timestamptz '2099-02-01 16:00Z',timestamptz '2099-02-01 17:00Z','upcoming',1),
 (-1785,'Capacity limited','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-02',timestamptz '2099-02-02 16:00Z',timestamptz '2099-02-02 17:00Z','upcoming',1),
 (-1786,'Capacity reduction','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-03',timestamptz '2099-02-03 16:00Z',timestamptz '2099-02-03 17:00Z','upcoming',2),
 (-1787,'Capacity processed past','Test Event','TBA',(select id from event_types where name='Meeting'),date '2000-02-01',timestamptz '2000-02-01 16:00Z',timestamptz '2000-02-01 17:00Z','past',1),
 (-1788,'Capacity closed','Test Event','TBA',(select id from event_types where name='Meeting'),date '2000-02-02',timestamptz '2000-02-02 16:00Z',timestamptz '2000-02-02 17:00Z','past',1),
 (-1789,'Capacity cancelled','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-04',timestamptz '2099-02-04 16:00Z',timestamptz '2099-02-04 17:00Z','cancelled',1),
 (-1790,'Capacity archived','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-05',timestamptz '2099-02-05 16:00Z',timestamptz '2099-02-05 17:00Z','upcoming',1),
 (-1791,'Capacity signup count','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-06',timestamptz '2099-02-06 16:00Z',timestamptz '2099-02-06 17:00Z','upcoming',1),
 (-1792,'Private signup count','Test Event','TBA',(select id from event_types where name='Meeting'),date '2099-02-07',timestamptz '2099-02-07 16:00Z',timestamptz '2099-02-07 17:00Z','upcoming',1);
update events set deleted_at=pg_catalog.now(),deleted_by='00000000-0000-4000-8000-000000001780' where id=-1790;
insert into event_officers(event_id,officer_id) values
 (-1780,-1781),(-1785,-1781),(-1786,-1781),(-1786,-1783),(-1787,-1781),(-1788,-1781),
 (-1791,-1781),(-1792,-1792);
insert into event_branches(event_id,branch_id) values(-1792,(select min(id) from branches));
insert into officer_branches(officer_id,branch_id) values(-1795,(select min(id) from branches));

select ok((select max_volunteers is null from events where id=-1789)=false,'limited Event stores its optional positive capacity');
select throws_ok($$update events set max_volunteers=0 where id=-1780$$,'23514',null,
  'database rejects a non-positive capacity');
select throws_ok($$insert into event_officers(event_id,officer_id) values(-1780,-1783)$$,
  'P0001','Event capacity has been reached','confirmed roster cannot exceed the capacity even through a direct writer');
select is(to_regclass('public.event_waitlist')::text,null::text,'operational Waitlist table is removed');
select is(to_regclass('public.event_waitlist_fifo_idx')::text,null::text,
  'Waitlist-specific index is removed with its table');
select is(to_regprocedure('public.leave_event_waitlist(bigint,bigint)')::text,null::text,
  'legacy Waitlist RPC is removed');
select is(to_regprocedure('private.promote_event_waitlist(bigint)')::text,null::text,
  'promotion helper is removed');
select is(to_regprocedure('private.leave_event_waitlist(bigint,bigint)')::text,null::text,
  'private legacy Waitlist helper is removed');
select ok(not exists(select 1 from pg_trigger where tgname in (
  'event_officers_no_waitlist_overlap','event_waitlist_no_confirmed_overlap')),
  'Waitlist-specific triggers are removed');
select ok(not exists(select 1 from pg_policies where tablename='event_waitlist'),
  'Waitlist-specific RLS policies are removed');
select is(pg_get_function_result('public.event_signup_counts()'::regprocedure),
  'TABLE(event_id bigint, confirmed_count bigint)',
  'confirmed signup count contract no longer returns a Waitlist field');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select throws_ok($$select change_event_signup(-1780,-1782,false)$$,'P0001','Event capacity has been reached',
  'full self-signup is rejected with a clear capacity message');
select throws_ok($$select change_event_signup(-1780,-1783,false)$$,'P0001','Event capacity has been reached',
  'later full self-signup is also rejected');
select is((select count(*) from event_officers where event_id=-1780),1::bigint,'full Event remains at capacity');
select is((select count(*) from event_officers where event_id=-1780 and officer_id in (-1782,-1783)),0::bigint,
  'full self-signup creates no confirmed signup');
select throws_ok($$select bulk_add_event_officers(-1780,array[-1784]::bigint[])$$,'P0001','The selected Officers exceed the Event capacity',
  'manager bulk addition cannot bypass full Event capacity');
select is((select confirmed_count from event_signup_counts() where event_id=-1792),1::bigint,
  'signup count response retains the confirmed count field used by the app');
select is((select count(*) from event_officers where event_id=-1780),1::bigint,
  'full signup failures do not create confirmed signups');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001781',true);
set local role authenticated;
select is((select confirmed_count from event_signup_counts() where event_id=-1792),1::bigint,
  'ordinary active Officer retains access to confirmed signup counts');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
update officers set status='inactive' where id=-1782;
select lives_ok($$select change_event_signup(-1780,-1781,true)$$,'confirmed Officer can leave an Event');
select is((select count(*) from event_officers where event_id=-1780),0::bigint,
  'leaving a confirmed signup does not promote anyone');
select is((select count(*) from point_transactions where event_id=-1780),0::bigint,
  'leaving a future Event does not create participation Points');
select lives_ok($$select private.set_event_capacity(-1785,2)$$,'capacity can increase');
select is((select count(*) from event_officers where event_id=-1785),1::bigint,
  'capacity increase does not promote anyone');
select lives_ok($$select private.bulk_add_event_officers(-1785,array[-1784]::bigint[])$$,
  'manager can explicitly confirm an Officer when capacity is available');
select is((select count(*) from event_officers where event_id=-1785),2::bigint,
  'manager confirmation adds only the explicitly selected Officer');
select lives_ok($$select private.set_event_capacity(-1785,null)$$,'limited Event can become unlimited');
select is((select count(*) from event_officers where event_id=-1785),2::bigint,
  'unlimited capacity does not promote anyone');
select lives_ok($$select private.set_event_capacity(-1791,2)$$,
  'capacity increase on a separate Event succeeds');
select is((select count(*) from event_officers where event_id=-1791),1::bigint,
  'capacity increase changes no confirmed signup');
select is((select count(*) from audit_logs where action='event.capacity_changed' and entity_id='-1785'),2::bigint,
  'capacity changes are audited');
select throws_ok($$select private.set_event_capacity(-1786,1)$$,'P0001',
  'Max volunteers cannot be lower than the confirmed signup count','lowering capacity below current roster is rejected');
select is((select max_volunteers from events where id=-1786),2,'rejected capacity decrease leaves the old limit unchanged');
select is((select count(*) from event_officers where event_id=-1786),2::bigint,'rejected decrease retains every confirmed Officer');

select lives_ok($$select private.set_event_capacity(-1788,null)$$,
  'manager can edit a closed unprocessed Event capacity');
select is((select count(*) from event_officers where event_id=-1788),1::bigint,
  'ended Event capacity edit does not change its historical roster');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001781',true);
set local role authenticated;
select throws_ok($$select change_event_signup(-1788,-1792,false)$$,'P0001','Signups are closed for this event','ordinary Officer self-signup is closed after an Event ends');
select throws_ok($$select change_event_signup(-1789,-1792,false)$$,'P0001','Signups are closed for this event','ordinary Officer self-signup is closed for a cancelled Event');
select throws_ok($$select change_event_signup(-1790,-1792,false)$$,'P0001','Signups are closed for this event','ordinary Officer self-signup is closed for an archived Event');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001780',true);
set local role authenticated;
select throws_ok($$select change_event_signup(-1780,-1782,false)$$,'P0001','Target officer is not active','inactive Officers cannot sign up');
reset role;
select is((select count(*) from event_officers where event_id=-1787),1::bigint,'past Event starts with its confirmed roster');

-- The scheduled processor awards only the confirmed roster.
select private.process_finished_events();
select is((select count(*) from point_transactions where event_id=-1787 and award_type='participation'),1::bigint,
  'only the confirmed Officer receives participation Points');
select is((select count(*) from point_transactions where event_id=-1787 and officer_id=-1784),0::bigint,
  'an unconfirmed Officer receives no participation Points');
reset role;
select lives_ok($$select private.set_event_capacity(-1787,null)$$,
  'manager may edit capacity on a past Event');
select is((select count(*) from event_officers where event_id=-1787),1::bigint,
  'past capacity edit does not change the historical confirmed roster');
select is((select count(*) from point_transactions where event_id=-1787 and officer_id=-1784),0::bigint,
  'past capacity edit does not award participation to an unconfirmed Officer');

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
