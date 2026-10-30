begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000002951','slot-admin@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-2951,'Slot Admin','slot-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000002951'),
 (-2952,'Slot Officer A','slot-a@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-2953,'Slot Officer B','slot-b@example.test',(select id from positions where name='Officer'),'active','officer',null),
 (-2954,'Slot Officer C','slot-c@example.test',(select id from positions where name='Officer'),'active','officer',null);

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,max_volunteers,
  participation_points_per_hour_at_end)
values
 (-2951,'Automatic slot event','Test','Campus',(select id from event_types where name='Meeting'),date '2020-09-01',
  timestamptz '2020-09-01 09:00-06',timestamptz '2020-09-01 14:00-06','past',4,null),
 (-2952,'Bulk slot event','Test','Campus',(select id from event_types where name='Meeting'),date '2020-09-02',
  timestamptz '2020-09-02 09:00-06',timestamptz '2020-09-02 14:00-06','past',4,null),
 (-2953,'Future slot event','Test','Campus',(select id from event_types where name='Meeting'),date '2099-09-03',
  timestamptz '2099-09-03 09:00-06',timestamptz '2099-09-03 14:00-06','upcoming',2,null),
 (-2954,'Existing signup event','Test','Campus',(select id from event_types where name='Meeting'),date '2099-09-04',
  timestamptz '2099-09-04 09:00-06',timestamptz '2099-09-04 14:00-06','upcoming',4,null),
 (-2955,'Session slot event','Test','Campus',(select id from event_types where lower(name)='session'),date '2099-09-05',
  timestamptz '2099-09-05 09:00-06',timestamptz '2099-09-05 14:00-06','upcoming',4,null);

insert into event_officers(event_id,officer_id) values
 (-2951,-2952),(-2951,-2953),(-2954,-2952);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity) values
 (-295101,-2951,timestamptz '2020-09-01 09:00-06',timestamptz '2020-09-01 11:00-06',2),
 (-295102,-2951,timestamptz '2020-09-01 11:00-06',timestamptz '2020-09-01 13:30-06',2),
 (-295201,-2952,timestamptz '2020-09-02 09:00-06',timestamptz '2020-09-02 11:00-06',1),
 (-295202,-2952,timestamptz '2020-09-02 11:00-06',timestamptz '2020-09-02 13:30-06',2),
 (-295301,-2953,timestamptz '2099-09-03 09:00-06',timestamptz '2099-09-03 11:00-06',1),
 (-295302,-2953,timestamptz '2099-09-03 11:00-06',timestamptz '2099-09-03 13:30-06',2);
select is((select max_volunteers from events where id=-2953),null::integer,
  'configuring Time Slots clears the Event-wide Max volunteers limit');
select is((select details->>'previous_max_volunteers' from audit_logs
  where action='event.capacity_cleared_for_time_slots' and entity_id='-2953'
  order by id desc limit 1),'2',
  'clearing an Event-wide limit records its previous value in the audit history');
update events set max_volunteers=9 where id=-2953;
select is((select max_volunteers from events where id=-2953),null::integer,
  'a slotted Event cannot regain an Event-wide Max volunteers limit');
select is((select max_volunteers from events where id=-2954),4,
  'an Event without Time Slots retains its Event-wide capacity');
insert into event_time_slot_officers(event_id,slot_id,officer_id) values
 (-2951,-295101,-2952),(-2951,-295102,-2952),
 (-2951,-295101,-2953),(-2951,-295102,-2953);
insert into point_transactions(officer_id,event_id,points,reason,award_type) values
 (-2953,-2951,7,'Manager award','manual');
update application_config set participation_points_per_hour=10 where id=1;

select throws_ok($$select private.replace_event_time_slots(-2954,'[{"start_time":"09:00","end_time":"10:00"}]'::jsonb)$$,
  'P0001','Time Slots cannot be enabled after Officers have signed up for this Event',
  'existing signup prevents enabling Time Slots');
select throws_ok($$select private.replace_event_time_slots(-2953,'[{"start_time":"08:59","end_time":"10:00"}]'::jsonb)$$,
  'P0001','Each Time Slot must fit within the Event schedule','slot outside Event boundary is rejected');
select throws_ok($$select private.replace_event_time_slots(-2953,'[{"start_time":"09:00","end_time":"11:00"},{"start_time":"10:30","end_time":"12:00"}]'::jsonb)$$,
  'P0001','Custom Time Slots cannot overlap','overlapping custom slots are rejected');
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity)
  values (295301,-2953,timestamptz '2099-09-03 13:30-06',timestamptz '2099-09-03 14:00-06',null);
select throws_ok($$select private.replace_event_time_slots(-2953,'[{"id":295301,"start_time":"13:30","end_time":"14:00"},{"id":295301,"start_time":"13:30","end_time":"14:00"}]'::jsonb)$$,
  'P0001','Time Slot IDs cannot be duplicated','a slot cannot appear twice in one submitted configuration');
delete from event_time_slots where id=295301;
select throws_ok($$select private.replace_event_time_slots(-2955,'[{"start_time":"09:00","end_time":"10:00"}]'::jsonb)$$,
  'P0001','Time Slots are unavailable for Session Events','Session Event cannot receive volunteer Time Slots');

select is(private.process_finished_events(),2,'automatic processor handles only the two finished fixture Events');
select is((select count(*) from point_transactions where event_id=-2951 and officer_id=-2952
  and event_time_slot_id is not null and award_type='participation'),2::bigint,
  'automatic processing creates a separate participation transaction for each selected slot');
select is((select points from point_transactions where event_id=-2951 and officer_id=-2952
  and event_time_slot_id=-295101 and award_type='participation'),2::numeric,
  'first slot earns exactly two Points at1/hour');
select is((select points from point_transactions where event_id=-2951 and officer_id=-2952
  and event_time_slot_id=-295102 and award_type='participation'),2.5::numeric,
  'second slot earns exactly2.5 Points at1/hour');
select is((select count(*) from point_transactions where event_id=-2951 and officer_id=-2953
  and award_type='participation'),2::bigint,'independent manual credit does not suppress either slot award');
select is(private.process_finished_events(),0,'automatic slot processing is idempotent');
select throws_ok($$insert into point_transactions(officer_id,event_id,event_time_slot_id,points,reason,award_type)
 values(-2952,-2951,-295101,20,'Duplicate slot','participation')$$,'23505',null,
 'slot automatic identity remains unique');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-2952,-2951,50,'Overlapping ordinary','participation')$$,'23505',null,
 'ordinary automatic participation cannot overlap active slot participation');
select lives_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-2952,-2951,-1,'After slot processing','manual')$$,
 'manual deductions also coexist when slot participation was created first');


select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002951',true);
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers_to_slots(-2952,array[-2952]::bigint[],array[-295201]::bigint[])$$,
  'manager can bulk add a historical signup with an explicit selected slot');
select is((select points from point_transactions where event_id=-2952 and officer_id=-2952
  and event_time_slot_id=-295201 and award_type='participation'),2::numeric,
  'historical bulk addition uses selected slot duration at1/hour');
select is((select count(*) from event_officers where event_id=-2952 and officer_id=-2952),1::bigint,
  'multiple slot awards use one canonical Event signup');
reset role;
insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-2953,-2952,-1,'Independent slot deduction','manual');
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers_to_slots(-2952,array[-2953]::bigint[],array[-295202]::bigint[])$$,
  'later bulk addition awards only its newly selected Officer and slot');
select is((select count(*) from point_transactions where event_id=-2952 and award_type='participation'),2::bigint,
  'bulk processing preserves one transaction per newly selected Officer and slot');
select is((select points from point_transactions where event_id=-2952 and officer_id=-2953
  and event_time_slot_id=-295202 and award_type='participation'),2.5::numeric,
  'bulk award uses the selected 2.5 hour slot duration');
select throws_ok($$select public.bulk_add_event_officers_to_slots(-2952,array[-2954]::bigint[],array[-295201]::bigint[])$$,
  'P0001','The selected Officers exceed a Time Slot capacity','bulk additions enforce per-slot capacity atomically');
select is((select count(*) from event_officers where event_id=-2952 and officer_id=-2954),0::bigint,
  'failed capacity check leaves no canonical partial signup');
select lives_ok($$select public.change_event_time_slot_signup(-2953,-2952,array[-295301]::bigint[],'join_selected')$$,
  'manager can assign one slot on a future Event');
select lives_ok($$select public.change_event_time_slot_signup(-2953,-2953,array[-295302]::bigint[],'join_selected')$$,
  'a second Officer can join the available slot');
select lives_ok($$select public.change_event_time_slot_signup(-2953,-2954,array[-295302]::bigint[],'join_selected')$$,
  'a third Officer can join another available place on the same slot');
select is((select count(*) from event_officers where event_id=-2953),3::bigint,
  'per-slot capacities allow more confirmed Officers than the former Event-wide limit');
select throws_ok($$select public.change_event_time_slot_signup(-2953,-2951,array[-295301,-295302]::bigint[],'join_all')$$,
  'P0001','A selected Time Slot is full; no Time Slot selections were added','join all fails atomically when one required slot is full');
select is((select count(*) from event_time_slot_officers where event_id=-2953 and officer_id=-2951),0::bigint,
  'failed join all adds no partial slot selection');
select lives_ok($$select public.change_event_time_slot_signup(-2953,-2952,array[-295301]::bigint[],'leave_selected')$$,
  'manager can remove one selected slot');
select is((select count(*) from event_officers where event_id=-2953 and officer_id=-2952
  and removed_at is null),0::bigint,
  'leaving the final slot also removes the canonical Event signup');
select ok((select removed_at is not null from event_officers where event_id=-2953 and officer_id=-2952),
  'leaving the final slot preserves the signup identity as inactive history');
select ok((select count(*)=2 from event_time_slots where event_id=-2953),
  'authenticated roster readers can see the slot rows');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002951',true);
set local role authenticated;
select lives_ok($$select public.update_point_transaction((select id from point_transactions
  where event_id=-2951 and officer_id=-2952 and event_time_slot_id=-295101),22)$$,
  'administrator correction updates an individual slot transaction');
reset role;
delete from event_time_slot_officers where event_id=-2951 and slot_id=-295101 and officer_id=-2952;
select is((select slot_selection_removed from point_transactions where event_id=-2951
  and officer_id=-2952 and event_time_slot_id=-295101),true,
  'removing a slot selection logically removes its automatic award with selection provenance');
insert into event_time_slot_officers(event_id,slot_id,officer_id) values(-2951,-295101,-2952);
select lives_ok($$select private.award_selected_event_time_slots(-2951,array[-2952]::bigint[],'raise')$$,
  'restoring a slot selection reconciles its prior transaction');
select is((select points from point_transactions where event_id=-2951 and officer_id=-2952
  and event_time_slot_id=-295101),22::numeric,
  'reconciliation preserves an independent manager Point correction');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002951',true);
set local role authenticated;
select is(public.remove_point_transaction((select id from point_transactions where event_id=-2951
  and officer_id=-2952 and event_time_slot_id=-295101)),true,
  'administrator can intentionally remove one slot transaction');
reset role;
delete from event_time_slot_officers where event_id=-2951 and slot_id=-295101 and officer_id=-2952;
insert into event_time_slot_officers(event_id,slot_id,officer_id) values(-2951,-295101,-2952);
select is(cardinality(private.award_selected_event_time_slots(-2951,array[-2952]::bigint[],'raise')),0,
  'intentionally removed Point award remains a tombstone after its selection returns');
select is((select slot_selection_removed from point_transactions where event_id=-2951
  and officer_id=-2952 and event_time_slot_id=-295101),false,
  'administrative removal provenance stays distinct from selection removal');

select lives_ok($$select public.create_recurring_event_with_capacity_and_time_slots(
  'Recurring slot fixture','Details',(select id from event_types where name='Meeting'),'Campus','{}'::bigint[],
  null,null,null,3,'00000000-0000-4000-8000-000000002959',
  'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-10-01'::date,'2099-10-02','2099-10-03'],
  array[timestamptz '2099-10-01 09:00-06',timestamptz '2099-10-02 09:00-06',timestamptz '2099-10-03 09:00-06'],
  array[timestamptz '2099-10-01 11:00-06',timestamptz '2099-10-02 11:00-06',timestamptz '2099-10-03 11:00-06'],
  '[{"start_time":"09:00","end_time":"10:00","capacity":1},{"start_time":"10:00","end_time":"11:00","capacity":2}]'::jsonb)$$,
  'recurring Event creation copies configured Time Slots to each occurrence');
select is((select count(*) from event_time_slots s join events e on e.id=s.event_id
  where e.name='Recurring slot fixture'),6::bigint,
  'each of three occurrences owns two slot records');
select is((select count(distinct s.id) from event_time_slots s join events e on e.id=s.event_id
  where e.name='Recurring slot fixture'),6::bigint,
  'recurring Event slots have independent record identities');
select lives_ok($$select public.change_event_time_slot_signup(
  (select min(e.id) from events e where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-02'),
  -2951,array[(select min(s.id) from event_time_slots s join events e on e.id=s.event_id
    where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-02')]::bigint[],'join_selected')$$,
  'an occurrence keeps its own slot signup');
select lives_ok($$select public.mutate_recurring_event_with_capacity_and_time_slots(
  (select e.id from events e where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-02'),
  'following','edit','00000000-0000-4000-8000-000000002958',
  (select recurrence_series_id from events where name='Recurring slot fixture' limit 1),
  (select revision from event_series where id=(select recurrence_series_id from events where name='Recurring slot fixture' limit 1)),
  '{"time_slots":[{"start_time":"09:30","end_time":"10:30","capacity":2},{"start_time":"10:30","end_time":"11:00","capacity":2}]}'::jsonb,
  null,null,false,0)$$,
  'This and following propagates configured Time Slot changes');
select is((select min(s.starts_at at time zone 'America/Denver')::time from event_time_slots s
  join events e on e.id=s.event_id where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-01'),
  time '09:00','earlier occurrence keeps its independent Time Slot schedule');
select is((select min(s.starts_at at time zone 'America/Denver')::time from event_time_slots s
  join events e on e.id=s.event_id where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-02'),
  time '09:30','selected occurrence receives the scoped Time Slot change');
select is((select count(*) from event_time_slot_officers so join events e on e.id=so.event_id
  where e.name='Recurring slot fixture' and e.recurrence_key='2099-10-02' and so.officer_id=-2951),
  1::bigint,'scoped slot propagation preserves independent Officer selections');

select is((select count(*) from point_transactions where event_id=-2952 and award_type='participation'),2::bigint,
  'a repeated processor run does not replace manager-created slot awards');

-- A manager correction on a historical slotted Event preserves the legacy slot
-- relationship and Point transaction. Active self-service leave above retains
-- its established behavior.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002951',true);
select lives_ok($$select public.change_event_time_slot_signup(-2952,-2952,'{}'::bigint[],'leave_all')$$,
  'manager can remove a historical slotted roster member through the existing leave-all action');
reset role;
select ok((select removed_at is not null from event_officers where event_id=-2952 and officer_id=-2952),
  'historical leave-all correction marks the canonical signup inactive');
select is((select count(*) from event_time_slot_officers where event_id=-2952 and officer_id=-2952),1::bigint,
  'historical leave-all correction preserves the slot relationship');
select is((select removed_at from point_transactions where event_id=-2952 and officer_id=-2952
  and event_time_slot_id=-295201 and award_type='participation'),null::timestamptz,
  'historical leave-all correction leaves the slot-linked Point transaction unchanged');
set local role authenticated;
select throws_ok($$select public.change_event_time_slot_signup(-2952,-2952,array[-295201]::bigint[],'join_selected')$$,
  'P0001','This removed Time Slot signup cannot be restored',
  'retained historical slot selections cannot implicitly reactivate a removed roster row');
reset role;
select * from finish();
rollback;
