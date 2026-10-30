begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000032901','roster-admin@example.test'),
 ('00000000-0000-4000-8000-000000032902','roster-lead@example.test'),
 ('00000000-0000-4000-8000-000000032903','roster-officer@example.test'),
 ('00000000-0000-4000-8000-000000032904','roster-inactive@example.test'),
 ('00000000-0000-4000-8000-000000032905','roster-other-lead@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-32901,'Roster Admin','roster-admin@example.test',(select id from positions where code='officer'),'active','admin','00000000-0000-4000-8000-000000032901'),
 (-32902,'Roster Lead','roster-lead@example.test',(select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000032902'),
 (-32903,'Roster Officer','roster-officer@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000032903'),
 (-32904,'Inactive Roster Officer','roster-inactive@example.test',(select id from positions where code='officer'),'inactive','officer','00000000-0000-4000-8000-000000032904'),
 (-32905,'Other Branch Lead','roster-other-lead@example.test',(select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000032905'),
 (-32906,'New Roster Officer','roster-new@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-32907,'Preexisting Roster Officer','roster-existing@example.test',(select id from positions where code='officer'),'active','officer',null);
insert into officer_branches(officer_id,branch_id)
select -32902,id from branches where name='intro'
union all select -32905,id from branches where name='icpc';

insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status,
 participation_points_per_hour_at_end,max_volunteers)
values
 (-32901,'Historical roster correction','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-01 09:00-07','2020-01-01 11:00-07','past',1,null),
 (-32902,'Historical slot compatibility','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-02 09:00-07','2020-01-02 11:00-07','past',1,null),
 (-32903,'Other branch roster','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-03 09:00-07','2020-01-03 11:00-07','past',1,null),
 (-32910,'Historical first processing','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-04 09:00-07','2020-01-04 11:00-07','past',null,null);
insert into event_branches(event_id,branch_id)
select -32901,id from branches where name='intro'
union all select -32902,id from branches where name='intro'
union all select -32903,id from branches where name='icpc';
insert into event_branches(event_id,branch_id)
select -32910,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values
 (-32901,-32903),(-32901,-32904),(-32902,-32903),(-32910,-32903),(-32910,-32907);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity)
values(-329201,-32902,'2020-01-02 09:00-07','2020-01-02 10:00-07',null);
insert into event_time_slot_officers(event_id,slot_id,officer_id,created_by)
values(-32902,-329201,-32903,'00000000-0000-4000-8000-000000032901');
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,created_by,
 removed_at,participation_schedule_suspended)
values
 (-329101,-32903,-32901,7.5,'Event participation','participation',null,null,false),
 (-329102,-32904,-32901,2,'Event participation','participation',null,pg_catalog.now(),true),
 (-329103,-32903,-32901,3,'Independent manual adjustment','manual','00000000-0000-4000-8000-000000032901',null,false);
insert into private.event_participation_basis(transaction_id,starts_at,ends_at,schedule_suspended)
values(-329102,'2020-01-01 09:00-07','2020-01-01 11:00-07',true);
insert into point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type,created_by)
values(-329201,-32903,-32902,-329201,1,'Event time slot participation','participation',null);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032903',true);
set local role authenticated;
select throws_ok($$select public.change_event_signup(-32901,-32903,true)$$,
 'P0001','Signups are closed for this event','an Officer cannot correct a historical roster through self-signup');
select throws_ok($$select public.change_event_signup(-32901,-32906,false)$$,
 'P0001','Cannot manage another officer signup for this event','an Officer cannot add someone else to a historical roster');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select throws_ok($$select public.change_event_signup(-32903,-32906,false)$$,
 'P0001','Cannot manage another officer signup for this event',
 'Lead cannot correct a roster outside managed branches');
select throws_ok($$select public.bulk_add_event_officers(-32903,array[-32906]::bigint[])$$,
 'P0001','Event outside branch scope','Lead cannot add a signup outside managed branches');
select lives_ok($$select public.change_event_signup(-32901,-32904,true)$$,
 'scoped Lead can remove an inactive Officer from a historical roster');
reset role;
select is((select count(*) from public.event_officers where event_id=-32901 and officer_id=-32904),0::bigint,
 'historical roster correction removes the selected signup');
select is((select removed_at is not null and removed_by='00000000-0000-4000-8000-000000032902'
  and points=2 and not participation_schedule_suspended
  from public.point_transactions where id=-329102),true,
 'the affected automatic Point row is retained with manager removal attribution');
select is((select schedule_suspended from private.event_participation_basis where transaction_id=-329102),false,
 'signup removal clears only the mechanical schedule suspension before retaining the intentional removal');
select is((select count(*) from public.point_transactions where id=-329102),1::bigint,
 'historical automatic Point transaction is not hard-deleted');
select is((select removed_at from public.point_transactions where id=-329103),null::timestamptz,
 'independent manual Point is untouched by roster correction');
select is((select participation_superseded_at is not null from public.point_transactions where id=-329102),true,
 'signup removal marks only its affected automatic Point as superseded for future reconciliation');
select ok(exists(select 1 from public.audit_logs where action='event.officer_removed'
  and entity_id='-32901' and actor_id='00000000-0000-4000-8000-000000032902'
  and details->>'officer_id'='-32904'),
 'roster removal is retained in existing audit history');

select lives_ok($$select public.bulk_add_event_officers(-32901,array[-32906]::bigint[])$$,
 'scoped Lead can add an active Officer to a past Event roster');
select lives_ok($$select public.bulk_add_event_officers(-32901,array[-32906]::bigint[])$$,
 'repeated historical roster addition is idempotent');
reset role;
select is((select count(*) from public.event_officers where event_id=-32901 and officer_id=-32906),1::bigint,
 'historical signup identity is unique after retries');
select is((select count(*) from public.point_transactions where event_id=-32901 and officer_id=-32906
  and award_type='participation' and removed_at is null),1::bigint,
 'new past signup reconciles one eligible automatic Point');
select is((select points from public.point_transactions where event_id=-32901 and officer_id=-32906
  and award_type='participation'),2::numeric,
 'new past signup uses the source-derived Event duration');
select is((select points from public.point_transactions where id=-329101),7.5::numeric,
 'adding another attendee does not reprice an unrelated edited automatic Point');
select is((select removed_at from public.point_transactions where id=-329102) is not null,true,
 'adding another attendee does not restore a removed automatic Point');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select lives_ok($$select public.change_event_signup(-32901,-32904,false)$$,
 'manager can restore a roster signup after its prior removal');
reset role;
select is((select count(*) from public.point_transactions where event_id=-32901 and officer_id=-32904
  and award_type='participation' and removed_at is null and participation_superseded_at is null),1::bigint,
 'readding the removed signup creates one eligible automatic award without erasing its old history');
select is((select count(*) from public.point_transactions where id=-329102),1::bigint,
 'readding a signup retains its original removed Point transaction');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers(-32910,array[-32906]::bigint[])$$,
 'first processing of an ended Event accepts a manager roster addition');
reset role;
select is((select participation_points_per_hour_at_end from public.events where id=-32910),1::numeric,
 'first processing establishes the Event participation snapshot');
select is((select count(*) from public.point_transactions where event_id=-32910 and award_type='participation'
  and removed_at is null),3::bigint,
 'first snapshot processing awards all preexisting and newly added eligible roster members');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select throws_ok($$select public.bulk_add_event_officers(-32901,array[-32904]::bigint[])$$,
 'P0001','All target officers must be active','inactive Officers cannot be newly added');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select throws_ok($$select public.bulk_add_event_officers(-32902,array[-32906]::bigint[])$$,
 'P0001','Select one or more Time Slots to sign up for this Event',
 'legacy slotted Event addition retains the trusted slot-selection requirement');
reset role;
select is((select count(*) from public.event_time_slot_officers where event_id=-32902 and slot_id=-329201
  and officer_id=-32903),1::bigint,'unrelated legacy slot relationship is preserved');
select is((select points from public.point_transactions where id=-329201),1::numeric,
 'unrelated legacy slot-linked Point row is preserved');
select is((select removed_at from public.point_transactions where id=-329201),null::timestamptz,
 'unrelated legacy slot-linked Point remains active');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select lives_ok($$select public.change_event_signup(-32902,-32903,true)$$,
 'manager can remove a historical slot-linked signup without managing slots');
reset role;
select is((select count(*) from public.event_officers where event_id=-32902 and officer_id=-32903),0::bigint,
 'historical slot-linked signup is removed');
select is((select count(*) from public.event_time_slot_officers where event_id=-32902 and slot_id=-329201
  and officer_id=-32903),0::bigint,'signup removal cascades only the live slot relationship');
select is((select event_id=-32902 and event_time_slot_id=-329201 and removed_at is not null
  and removed_by='00000000-0000-4000-8000-000000032901' and participation_superseded_at is not null
  from public.point_transactions where id=-329201),true,
 'slot-linked Point history and its original event and slot identity survive signup removal');
select ok(exists(select 1 from public.audit_logs l
  cross join lateral jsonb_array_elements(l.details->'removed_slot_selections') as selection(value)
  where l.action='event.officer_removed' and l.entity_id='-32902'
    and value->>'event_id'='-32902' and value->>'slot_id'='-329201'
    and value->>'officer_id'='-32903' and value ? 'created_at'
    and value->>'created_by'='00000000-0000-4000-8000-000000032901'),
 'removal audit retains full legacy slot-selection evidence including actor and timestamp');

select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
