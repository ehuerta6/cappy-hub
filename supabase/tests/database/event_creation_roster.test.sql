begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000468101','event-roster-lead@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-46811,'Event Roster Lead','event-roster-lead@example.test',
    (select id from positions where name='Lead'),'active','officer',
    '00000000-0000-4000-8000-000000468101'),
  (-46812,'Unassigned Event Officer','event-roster-unassigned@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-46813,'Other Branch Event Officer','event-roster-other@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-46814,'Inactive Event Officer','event-roster-inactive@example.test',
    (select id from positions where name='Officer'),'inactive','officer',null);
insert into officer_branches(officer_id,branch_id)
  values(-46811,(select id from branches where name='intro')),
        (-46813,(select id from branches where name='icpc'));

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000468101',true);
set local role authenticated;
select set_config('test.event_occurrence_id',public.save_event_with_resources_and_officers(
  'Initial Event roster','Details',(select id from event_types where name='Meeting'),'Campus',
  '2099-11-20','2099-11-20 16:00+00','2099-11-20 17:00+00','{}'::bigint[],null,5,
  null,null,null,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer"},
    {"officer_id":-46813,"participation_type":"attendee"}]'::jsonb,'occurrence')::text,true);
select is((select count(*) from public.event_officers
  where event_id=current_setting('test.event_occurrence_id')::bigint and removed_at is null),2::bigint,
  'initial Event creation registers multiple active Officers with different participation types');
select is((select participation_type from public.event_officers
  where event_id=current_setting('test.event_occurrence_id')::bigint and officer_id=-46812),'volunteer',
  'a selected Officer can be registered as a Volunteer');
select is((select participation_type from public.event_officers
  where event_id=current_setting('test.event_occurrence_id')::bigint and officer_id=-46813),'attendee',
  'a selected Officer can be registered as Attending regardless of Branch membership');
reset role;
select is((select count(*) from public.notifications where kind='event.signup'
  and entity_id=current_setting('test.event_occurrence_id')::bigint
  and recipient_officer_id in (-46812,-46813)),2::bigint,
  'each manager-added Officer receives a personal registration notice independent of audience');
set local role authenticated;

select set_config('test.slotted_event_id',public.save_event_with_resources_and_officers(
  'Initial slotted Event roster','Details',(select id from event_types where name='Meeting'),'Campus',
  '2099-11-21','2099-11-21 16:00+00','2099-11-21 17:00+00','{}'::bigint[],null,0,
  null,null,'[{"start_time":"09:00","end_time":"09:30","capacity":1},
    {"start_time":"09:30","end_time":"10:00","capacity":1}]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer","slot_indexes":[2]}]'::jsonb,
  'occurrence')::text,true);
select is((select count(*) from public.event_time_slot_officers so join public.event_time_slots s
  on s.id=so.slot_id where so.event_id=current_setting('test.slotted_event_id')::bigint
    and so.officer_id=-46812 and s.starts_at='2099-11-21 16:30+00'),1::bigint,
  'initial slotted Event creation maps the selected slot index to its configured slot');
select is((select count(*) from public.event_time_slot_officers so join public.event_time_slots s
  on s.id=so.slot_id where so.event_id=current_setting('test.slotted_event_id')::bigint
    and so.officer_id=-46812 and s.starts_at='2099-11-21 16:00+00'),0::bigint,
  'unselected Time Slots remain unassigned');
select throws_ok($$select public.save_event_with_resources_and_officers(
  'Missing slotted Volunteer choice','Details',(select id from event_types where name='Meeting'),'Campus',
  '2099-11-22','2099-11-22 16:00+00','2099-11-22 17:00+00','{}'::bigint[],null,0,
  null,null,'[{"start_time":"09:00","end_time":"10:00"}]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer"}]'::jsonb,'occurrence')$$,
  'P0001','Select at least one Time Slot for each Volunteer',
  'a slotted Volunteer cannot be registered without a selected Time Slot');
select is((select count(*) from public.events where name='Missing slotted Volunteer choice'),0::bigint,
  'invalid slot selection rolls back the Event creation');

select set_config('test.slotted_series_first_id',public.create_recurring_event_with_resources_and_officers(
  'Recurring slotted Event roster','Details',(select id from event_types where name='Meeting'),'Campus',
  array[(select id from public.branches where name='intro')]::bigint[],null,null,null,0,'00000000-0000-4000-8000-000000004683',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-12-20'::date,'2099-12-21','2099-12-22'],
  array[timestamptz '2099-12-20 16:00Z',timestamptz '2099-12-21 16:00Z',timestamptz '2099-12-22 16:00Z'],
  array[timestamptz '2099-12-20 17:00Z',timestamptz '2099-12-21 17:00Z',timestamptz '2099-12-22 17:00Z'],
  '[{"start_time":"09:00","end_time":"09:30","capacity":1},
    {"start_time":"09:30","end_time":"10:00","capacity":1}]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer","slot_indexes":[2]}]'::jsonb,
  'series')::text,true);
select is((select count(*) from public.event_time_slot_officers so join public.events e on e.id=so.event_id
  join public.event_time_slots s on s.id=so.slot_id where e.recurrence_series_id=
    (select recurrence_series_id from public.events where id=current_setting('test.slotted_series_first_id')::bigint)
    and so.officer_id=-46812 and s.starts_at=e.starts_at+interval '30 minutes'),3::bigint,
  'series slot selection maps the chosen slot ordinal to each occurrence-owned slot');
select is((select count(distinct so.slot_id) from public.event_time_slot_officers so
  join public.events e on e.id=so.event_id where e.recurrence_series_id=
    (select recurrence_series_id from public.events where id=current_setting('test.slotted_series_first_id')::bigint)
    and so.officer_id=-46812),3::bigint,
  'recurring initial registrations never reuse a first-occurrence Time Slot ID');

select set_config('test.event_first_id',public.create_recurring_event_with_resources_and_officers(
  'Recurring Event first only','Details',(select id from event_types where name='Meeting'),'Campus',
  array[(select id from public.branches where name='intro')]::bigint[],null,null,null,5,'00000000-0000-4000-8000-000000004681',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-12-01'::date,'2099-12-02','2099-12-03'],
  array[timestamptz '2099-12-01 16:00Z',timestamptz '2099-12-02 16:00Z',timestamptz '2099-12-03 16:00Z'],
  array[timestamptz '2099-12-01 17:00Z',timestamptz '2099-12-02 17:00Z',timestamptz '2099-12-03 17:00Z'],
  '[]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"attendee"}]'::jsonb,'occurrence')::text,true);
select is((select count(*) from public.event_officers eo join public.events e on e.id=eo.event_id
  where e.recurrence_series_id=(select recurrence_series_id from public.events
    where id=current_setting('test.event_first_id')::bigint) and eo.removed_at is null),1::bigint,
  'default recurrence scope registers Officers to the first Event occurrence only');
select is(public.create_recurring_event_with_resources_and_officers(
  'Recurring Event first only','Details',(select id from event_types where name='Meeting'),'Campus',
  array[(select id from public.branches where name='intro')]::bigint[],null,null,null,5,'00000000-0000-4000-8000-000000004681',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-12-01'::date,'2099-12-02','2099-12-03'],
  array[timestamptz '2099-12-01 16:00Z',timestamptz '2099-12-02 16:00Z',timestamptz '2099-12-03 16:00Z'],
  array[timestamptz '2099-12-01 17:00Z',timestamptz '2099-12-02 17:00Z',timestamptz '2099-12-03 17:00Z'],
  '[]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"attendee"}]'::jsonb,'occurrence'),
  current_setting('test.event_first_id')::bigint,
  'an exact recurring Event roster retry returns its original first occurrence');
select throws_ok($$select public.create_recurring_event_with_resources_and_officers(
  'Recurring Event first only','Details',(select id from event_types where name='Meeting'),'Campus',
  array[(select id from public.branches where name='intro')]::bigint[],null,null,null,5,'00000000-0000-4000-8000-000000004681',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-12-01'::date,'2099-12-02','2099-12-03'],
  array[timestamptz '2099-12-01 16:00Z',timestamptz '2099-12-02 16:00Z',timestamptz '2099-12-03 16:00Z'],
  array[timestamptz '2099-12-01 17:00Z',timestamptz '2099-12-02 17:00Z',timestamptz '2099-12-03 17:00Z'],
  '[]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"attendee"}]'::jsonb,'series')$$,'P0001',
  'Recurring Event creation request does not match its original roster selection',
  'the same recurring Event request cannot change from occurrence to series scope');

select set_config('test.event_series_first_id',public.create_recurring_event_with_resources_and_officers(
  'Recurring Event whole series','Details',(select id from event_types where name='Meeting'),'Campus',
  array[(select id from public.branches where name='intro')]::bigint[],null,null,null,5,'00000000-0000-4000-8000-000000004682',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-12-10'::date,'2099-12-11','2099-12-12'],
  array[timestamptz '2099-12-10 16:00Z',timestamptz '2099-12-11 16:00Z',timestamptz '2099-12-12 16:00Z'],
  array[timestamptz '2099-12-10 17:00Z',timestamptz '2099-12-11 17:00Z',timestamptz '2099-12-12 17:00Z'],
  '[]'::jsonb,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer"},
    {"officer_id":-46813,"participation_type":"attendee"}]'::jsonb,'series')::text,true);
select is((select count(*) from public.event_officers eo join public.events e on e.id=eo.event_id
  where e.recurrence_series_id=(select recurrence_series_id from public.events
    where id=current_setting('test.event_series_first_id')::bigint) and eo.removed_at is null),6::bigint,
  'series scope applies each selected participation type to every Event occurrence');
reset role;
select is((select count(*) from public.notifications where kind='event.signup'
  and entity_id in (select e.id from public.events e where e.recurrence_series_id=
    (select recurrence_series_id from public.events where id=current_setting('test.event_series_first_id')::bigint))
  and recipient_officer_id in (-46812,-46813)),6::bigint,
  'series roster delivery creates one personal notice per Officer and Event occurrence');
set local role authenticated;
select throws_ok($$select public.save_event_with_resources_and_officers(
  'Failed Event roster','Details',(select id from event_types where name='Meeting'),'Campus',
  '2099-12-20','2099-12-20 16:00+00','2099-12-20 17:00+00','{}'::bigint[],null,5,
  null,null,null,'[]'::jsonb,
  '[{"officer_id":-46812,"participation_type":"volunteer"},
    {"officer_id":-46814,"participation_type":"attendee"}]'::jsonb,'occurrence')$$,
  'P0001','All target officers must be active','an inactive selected Event Officer rejects Event creation');
select is((select count(*) from public.events where name='Failed Event roster'),0::bigint,
  'a failed Event registration leaves no partial Event');
reset role;

select * from finish();
rollback;
