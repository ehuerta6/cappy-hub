begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Issue #442: deferred reconciliation after a future-date correction, and one
-- consistent rate rule across every participation path.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000442001','deferred-admin@example.test'),
 ('00000000-0000-4000-8000-000000442002','deferred-officer@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-442001,'Deferred Admin','deferred-admin@example.test',(select id from positions where code='officer'),'active','admin','00000000-0000-4000-8000-000000442001'),
 (-442002,'Deferred Officer','deferred-officer@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000442002'),
 (-442010,'Deferred Volunteer','deferred-volunteer@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442011,'Deferred Attendee','deferred-attendee@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442012,'Deliberately Removed','deferred-removed@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442013,'Premature Confirmed','deferred-premature@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442014,'Deferred Slot Volunteer','deferred-slot@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442015,'Rate Officer X','rate-x@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442016,'Rate Officer Y','rate-y@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442017,'Rate Officer Z','rate-z@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-442018,'Rate Officer W','rate-w@example.test',(select id from positions where code='officer'),'active','officer',null);

insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status,participation_points_per_hour_at_end) values
 (-442101,'Deferred ordinary','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-01 09:00-07','2020-03-01 11:00-07','past',null),
 (-442102,'Deferred slotted','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-03 09:00-07','2020-03-03 12:00-07','past',null),
 (-442103,'New model roster','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-05 09:00-07','2020-03-05 11:00-07','past',null),
 (-442104,'Legacy roster','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-06 09:00-07','2020-03-06 11:00-07','past',1),
 (-442105,'New model slots','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-07 09:00-07','2020-03-07 12:00-07','past',null);
insert into event_time_slots(id,event_id,starts_at,ends_at) values
 (-44210201,-442102,'2020-03-03 09:00-07','2020-03-03 10:30-07'),
 (-44210202,-442102,'2020-03-03 11:00-07','2020-03-03 12:00-07'),
 (-44210501,-442105,'2020-03-07 09:00-07','2020-03-07 10:30-07'),
 (-44210502,-442105,'2020-03-07 11:00-07','2020-03-07 12:00-07');
insert into event_officers(event_id,officer_id,participation_type) values
 (-442101,-442010,'volunteer'),(-442101,-442011,'attendee'),
 (-442101,-442012,'volunteer'),(-442101,-442013,'volunteer'),
 (-442102,-442014,'volunteer'),
 (-442103,-442015,'volunteer');
insert into event_time_slot_officers(event_id,slot_id,officer_id)
values (-442102,-44210201,-442014),(-442102,-44210202,-442014);

select private.process_finished_events();
select is((select participation_rate_version from events where id=-442104),'legacy',
 'the legacy fixture keeps its stored rate version through processing');

create temp table original_awards as
 select officer_id,event_time_slot_id,id,points from point_transactions
 where event_id in (-442101,-442102) and award_type='participation';
grant select on original_awards to authenticated;
select results_eq($$select officer_id,event_time_slot_id,points from original_awards order by officer_id,event_time_slot_id$$,
 $$values (-442014::bigint,-44210202::bigint,2::numeric),(-442014,-44210201,3),
   (-442013,null,4),(-442012,null,4),(-442011,null,2),(-442010,null,4)$$,
 'initial processing awards Volunteer 2/hour, Attendee 1/hour, and fractional slots without the gap');

------------------------------------------------------------------------
-- Rate consistency on a processed new-model Event.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000442002',true);
set local role authenticated;
select throws_ok($$select public.bulk_add_event_officers(-442103,array[-442018]::bigint[],'volunteer')$$,
 'P0001',null,'an ordinary Officer cannot add historical participants');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000442001',true);
set local role authenticated;
select lives_ok($$select public.change_event_signup(p_event_id=>-442103,p_officer_id=>-442016,
 p_participation_type=>'volunteer',p_remove=>false)$$,'an Admin individually adds a Volunteer to a processed Event');
select lives_ok($$select public.change_event_signup(p_event_id=>-442103,p_officer_id=>-442017,
 p_participation_type=>'attendee',p_remove=>false)$$,'an Admin individually adds an Attendee to a processed Event');
select lives_ok($$select public.bulk_add_event_officers(-442103,array[-442018]::bigint[],'volunteer')$$,
 'an Admin bulk adds a Volunteer to a processed Event');
reset role;
select results_eq($$select officer_id,points from point_transactions where event_id=-442103
 and award_type='participation' and removed_at is null order by officer_id$$,
 $$values (-442018::bigint,4::numeric),(-442017,2),(-442016,4),(-442015,4)$$,
 'scheduled processing, individual add and bulk add award the same new-model amounts');

-- Legacy Events keep their stored one/hour behavior.
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers(-442104,array[-442015]::bigint[],'volunteer')$$,
 'an Admin bulk adds a Volunteer to a legacy Event');
select lives_ok($$select public.change_event_signup(p_event_id=>-442104,p_officer_id=>-442016,
 p_participation_type=>'volunteer',p_remove=>false)$$,'an Admin individually adds a Volunteer to a legacy Event');
reset role;
select results_eq($$select officer_id,points from point_transactions where event_id=-442104
 and award_type='participation' and removed_at is null order by officer_id$$,
 $$values (-442016::bigint,2::numeric),(-442015,2)$$,
 'legacy Events are not repriced to the new Volunteer rate');
select is((select participation_rate_version from events where id=-442104),'legacy',
 'adding participants does not change a legacy rate version');

-- Selected Volunteer Time Slots on a processed new-model Event.
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers_to_slots(-442105,array[-442015]::bigint[],array[-44210501]::bigint[])$$,
 'an Admin bulk adds a Volunteer to a historical slot');
select lives_ok($$select public.correct_historical_event_time_slots(-442105,-442015,array[-44210501,-44210502]::bigint[])$$,
 'an Admin corrects the historical slot selection');
select lives_ok($$select public.change_event_time_slot_signup(-442105,-442016,array[-44210502]::bigint[],'join_selected')$$,
 'an Admin adds a selected historical slot for another Officer');
reset role;
select results_eq($$select officer_id,event_time_slot_id,points from point_transactions where event_id=-442105
 and award_type='participation' and removed_at is null order by officer_id,event_time_slot_id$$,
 $$values (-442016::bigint,-44210502::bigint,2::numeric),(-442015,-44210502,2),(-442015,-44210501,3)$$,
 'bulk, historical correction and slot signup paths award Volunteer 2/hour by slot duration');

-- First processing through slot paths stamps the new model, not legacy.
insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status,participation_points_per_hour_at_end) values
 (-442106,'First processed by bulk slots','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-08 09:00-07','2020-03-08 10:00-07','past',null),
 (-442107,'First processed by slot correction','Synthetic','Campus',(select id from event_types where name='Meeting'),'2020-03-09 09:00-07','2020-03-09 10:00-07','past',null);
insert into event_time_slots(id,event_id,starts_at,ends_at) values
 (-44210601,-442106,'2020-03-08 09:00-07','2020-03-08 10:00-07'),
 (-44210701,-442107,'2020-03-09 09:00-07','2020-03-09 10:00-07');
-- Historical slot correction requires an existing confirmed Event signup.
insert into event_officers(event_id,officer_id,participation_type) values (-442107,-442017,'volunteer');
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers_to_slots(-442106,array[-442017]::bigint[],array[-44210601]::bigint[])$$,
 'bulk slot addition processes an ended Event for the first time');
select lives_ok($$select public.correct_historical_event_time_slots(-442107,-442017,array[-44210701]::bigint[])$$,
 'historical slot correction processes an ended Event for the first time');
reset role;
select results_eq($$select id,participation_rate_version,participation_points_per_hour_at_end from events
 where id in (-442106,-442107) order by id desc$$,
 $$values (-442106::bigint,'volunteer_attendee'::text,2::numeric),(-442107,'volunteer_attendee',2)$$,
 'first processing through slot paths uses the Volunteer/Attendee model');
select results_eq($$select event_id,points from point_transactions where event_id in (-442106,-442107)
 and award_type='participation' and removed_at is null order by event_id desc$$,
 $$values (-442106::bigint,2::numeric),(-442107,2)$$,
 'first-processed one-hour slots earn the Volunteer rate');

------------------------------------------------------------------------
-- Deferred reconciliation of an ordinary Event.
set local role authenticated;
select ok(public.remove_point_transaction((select id from original_awards where officer_id=-442012)),
 'an Admin deliberately removes one award');
select ok(public.remove_point_transaction((select id from original_awards where officer_id=-442013)),
 'an Admin removes an award that is later confirmed premature');
reset role;
update events set event_date='2099-03-01',starts_at='2099-03-01 09:00-07',ends_at='2099-03-01 12:00-07' where id=-442101;
select is((select count(*) from point_transactions where event_id=-442101 and award_type='participation'
 and removed_at is not null and participation_schedule_suspended),2::bigint,
 'moving the Event into the future suspends the two active awards');
set local role authenticated;
select ok(public.confirm_premature_participation((select id from original_awards where officer_id=-442013),
 'Removed before the corrected end'),'an Admin confirms the premature removal before the corrected end');
reset role;
select is((select count(*) from point_transactions where event_id=-442101 and award_type='participation'
 and removed_at is null),0::bigint,'no participation is active before the corrected end');

-- Time passes: the corrected schedule ends without another Event edit.
alter table events disable trigger events_reconcile_participation_schedule;
update events set event_date='2020-03-02',starts_at='2020-03-02 09:00-07',ends_at='2020-03-02 12:00-07' where id=-442101;
alter table events enable trigger events_reconcile_participation_schedule;
select is((select count(*) from point_transactions where event_id=-442101 and award_type='participation'
 and removed_at is null),0::bigint,'suspended awards wait for the scheduled processor');

select ok(private.process_finished_events()>=1,'the processor reconciles the processed Event after its corrected end');
select results_eq($$select p.officer_id,p.points,p.id=o.id from point_transactions p
 join original_awards o on o.officer_id=p.officer_id and o.event_time_slot_id is null
 where p.event_id=-442101 and p.award_type='participation' and p.removed_at is null
   and p.officer_id in (-442010,-442011) order by p.officer_id$$,
 $$values (-442011::bigint,3::numeric,true),(-442010,6,true)$$,
 'suspended Volunteer and Attendee awards reactivate in place at the corrected duration');
select is((select points from point_transactions where event_id=-442101 and officer_id=-442013
 and award_type='participation' and removed_at is null and participation_superseded_at is null),6::numeric,
 'a premature removal confirmed before the corrected end gets one replacement');
select ok((select removed_at is not null and participation_superseded_at is not null from point_transactions
 where id=(select id from original_awards where officer_id=-442013)),'the confirmed premature award stays removed history');
select is((select count(*) from point_transactions where event_id=-442101 and officer_id=-442012
 and award_type='participation' and removed_at is null),0::bigint,'a deliberate removal is never recreated');
select ok(exists(select 1 from audit_logs where action='points.participation_reconciled'
 and details->>'transaction_id'=(select id::text from original_awards where officer_id=-442010)
 and (details->>'reactivated')::boolean),'deferred reactivation is audited');

------------------------------------------------------------------------
-- Deferred reconciliation of selected Volunteer Time Slots. Slots with Point
-- history cannot be rescheduled through the product, so the suspended state is
-- produced directly with the bounds guard disabled.
alter table events disable trigger events_keep_time_slots_valid;
update event_time_slots set starts_at=starts_at+interval '79 years',ends_at=ends_at+interval '79 years' where event_id=-442102;
update events set event_date='2099-03-03',starts_at='2099-03-03 09:00-07',ends_at='2099-03-03 12:00-07' where id=-442102;
select is((select count(*) from point_transactions where event_id=-442102 and award_type='participation'
 and removed_at is not null and participation_schedule_suspended),2::bigint,'both slot awards are suspended');
alter table events disable trigger events_reconcile_participation_schedule;
update event_time_slots set starts_at=starts_at-interval '79 years',ends_at=ends_at-interval '79 years' where event_id=-442102;
update events set event_date='2020-03-03',starts_at='2020-03-03 09:00-07',ends_at='2020-03-03 12:00-07' where id=-442102;
alter table events enable trigger events_reconcile_participation_schedule;
alter table events enable trigger events_keep_time_slots_valid;

select private.process_finished_events();
select results_eq($$select p.event_time_slot_id,p.points,p.id=o.id from point_transactions p
 join original_awards o on o.event_time_slot_id=p.event_time_slot_id
 where p.event_id=-442102 and p.award_type='participation' and p.removed_at is null order by p.event_time_slot_id desc$$,
 $$values (-44210201::bigint,3::numeric,true),(-44210202,2,true)$$,
 'suspended slot awards reactivate in place with fractional duration');

------------------------------------------------------------------------
select is(private.process_finished_events(),0,'repeating the processor has nothing left to reconcile');
select is((select count(*) from point_transactions where event_id in (-442101,-442102)
 and award_type='participation' and removed_at is null),5::bigint,
 'repeated processing never duplicates participation awards');
select is((select count(*) from (select officer_id,event_time_slot_id from point_transactions
 where event_id in (-442101,-442102) and award_type='participation' and participation_superseded_at is null
 group by 1,2 having count(*)>1) duplicates),0::bigint,'each Officer and slot keeps one current automatic award');

select * from finish();
rollback;
