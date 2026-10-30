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
 (-32907,'Preexisting Roster Officer','roster-existing@example.test',(select id from positions where code='officer'),'active','officer',null),
 (-32908,'Active Readd Officer','roster-readd@example.test',(select id from positions where code='officer'),'active','officer',null);
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
  '2020-01-04 09:00-07','2020-01-04 11:00-07','past',null,null),
 (-32911,'Historical single signup processing','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-05 09:00-07','2020-01-05 11:00-07','past',null,null),
 (-32913,'Historical restore first processing','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2020-01-06 09:00-07','2020-01-06 11:00-07','past',null,null),
 (-32912,'Full roster retry capacity','Synthetic','Campus',(select id from event_types where name='Meeting'),
  '2099-01-06 09:00-07','2099-01-06 11:00-07','upcoming',null,1);
insert into event_branches(event_id,branch_id)
select -32901,id from branches where name='intro'
union all select -32902,id from branches where name='intro'
union all select -32903,id from branches where name='icpc';
insert into event_branches(event_id,branch_id)
select event_id,id from (values (-32910::bigint),(-32911::bigint),(-32912::bigint),(-32913::bigint)) events(event_id)
cross join branches where branches.name='intro';
insert into event_officers(event_id,officer_id) values
 (-32901,-32903),(-32901,-32904),(-32901,-32908),(-32902,-32903),(-32902,-32904),
 (-32910,-32903),(-32910,-32907),(-32911,-32903),(-32911,-32907),
 (-32912,-32903),(-32913,-32903),(-32913,-32907),(-32913,-32908);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity)
values(-329201,-32902,'2020-01-02 09:00-07','2020-01-02 10:00-07',null);
insert into event_time_slot_officers(event_id,slot_id,officer_id,created_by)
values(-32902,-329201,-32903,'00000000-0000-4000-8000-000000032901'),
 (-32902,-329201,-32904,'00000000-0000-4000-8000-000000032901');
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,created_by,
 removed_at,participation_schedule_suspended)
values
 (-329101,-32903,-32901,7.5,'Event participation','participation',null,null,false),
 (-329102,-32904,-32901,2,'Event participation','participation',null,pg_catalog.now(),true),
 (-329103,-32903,-32901,3,'Independent manual adjustment','manual','00000000-0000-4000-8000-000000032901',null,false),
 (-329104,-32908,-32901,4,'Event participation','participation',null,null,false);
update private.event_participation_basis set schedule_suspended=true where transaction_id=-329102;
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
select is((select removed_at is not null from public.event_officers where event_id=-32901 and officer_id=-32904),true,
 'historical roster correction preserves the signup row and marks it inactive');
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
select lives_ok($$select public.change_event_signup(-32901,-32908,true)$$,
 'manager can remove an active Officer for the re-add reconciliation case');
select lives_ok($$select public.change_event_signup(-32901,-32908,false)$$,
 'manager can re-add an active Officer after roster removal');
reset role;
select is((select count(*) from public.point_transactions where event_id=-32901 and officer_id=-32908
  and award_type='participation' and removed_at is null and participation_superseded_at is null),1::bigint,
 'readding an active Officer creates one eligible automatic award');
select is((select removed_at is not null and removed_by='00000000-0000-4000-8000-000000032902'
  and participation_superseded_at is not null from public.point_transactions where id=-329104),true,
 'readding preserves the original removed automatic Point transaction as history');

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
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select lives_ok($$select public.change_event_signup(-32911,-32906,false)$$,
 'single manager signup can first process an ended Event');
reset role;
select is((select participation_points_per_hour_at_end from public.events where id=-32911),1::numeric,
 'single signup establishes the first participation snapshot');
select is((select count(*) from public.point_transactions where event_id=-32911
  and award_type='participation' and removed_at is null),3::bigint,
 'single signup first processing awards existing as well as newly added roster members');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select lives_ok($$select public.change_event_signup(-32913,-32908,true)$$,
 'manager can remove an ordinary signup before its first processing snapshot');
select lives_ok($$select public.change_event_signup(-32913,-32908,false)$$,
 'restoring an ordinary signup can establish its first processing snapshot');
reset role;
select is((select participation_points_per_hour_at_end from public.events where id=-32913),1::numeric,
 'ordinary restore establishes the first participation snapshot');
select is((select count(*) from public.point_transactions where event_id=-32913
  and award_type='participation' and removed_at is null),3::bigint,
 'ordinary restore first processing awards every active signup, not only the restored Officer');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032902',true);
set local role authenticated;
select lives_ok($$select public.bulk_add_event_officers(-32912,array[-32903]::bigint[])$$,
 'retrying an existing signup succeeds when its roster is already at capacity');
select lives_ok($$select public.change_event_signup(-32912,-32903,true)$$,
 'manager can remove a full-roster member without deleting signup history');
select lives_ok($$select public.bulk_add_event_officers(-32912,array[-32906]::bigint[])$$,
 'a freed signup capacity can be assigned to the explicitly selected Officer');
reset role;
select is((select count(*) from public.event_officers where event_id=-32912 and removed_at is null),1::bigint,
 'only the replacement signup is active after capacity is freed');
select ok((select removed_at is not null from public.event_officers where event_id=-32912 and officer_id=-32903),
 'full-capacity retry and removal preserve the original signup row');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select throws_ok($$select public.bulk_add_event_officers(-32901,array[-32904]::bigint[])$$,
 'P0001','All target officers must be active','inactive Officers cannot be newly added');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select throws_ok($$select public.bulk_add_event_officers(-32902,array[-32906]::bigint[])$$,
 'P0001','Select Time Slots when adding Officers to this Event',
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
select is((select removed_at is not null from public.event_officers where event_id=-32902 and officer_id=-32903),true,
 'historical slot-linked signup row is preserved and marked inactive');
select is((select count(*) from public.event_time_slot_officers where event_id=-32902 and slot_id=-329201
  and officer_id=-32903),1::bigint,'signup removal preserves its historical slot selection row');
select is((select event_id=-32902 and event_time_slot_id=-329201 and removed_at is not null
  and removed_by='00000000-0000-4000-8000-000000032901' and participation_superseded_at is not null
  from public.point_transactions where id=-329201),true,
 'slot-linked Point history is retained but removed from active credit with manager attribution');
select ok(exists(select 1 from public.audit_logs l
  cross join lateral jsonb_array_elements(l.details->'removed_slot_selections') as selection(value)
  where l.action='event.officer_removed' and l.entity_id='-32902'
    and value->>'event_id'='-32902' and value->>'slot_id'='-329201'
    and value->>'officer_id'='-32903' and value ? 'created_at'
    and value->>'created_by'='00000000-0000-4000-8000-000000032901'),
 'removal audit retains full legacy slot-selection evidence including actor and timestamp');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select throws_ok($$select public.change_event_signup(-32902,-32903,false)$$,
 'P0001','Select one or more Time Slots to sign up for this Event',
 'roster correction does not reactivate or reassign a historical slot-linked signup');
select throws_ok($$select public.bulk_add_event_officers_to_slots(-32902,array[-32903]::bigint[],array[-329201]::bigint[])$$,
 'P0001','This removed Time Slot signup cannot be restored',
 'explicit slot assignment cannot implicitly restore a removed historical signup');
reset role;
select is((select removed_at is not null from public.event_officers where event_id=-32902 and officer_id=-32903),true,
 'a rejected slot-linked re-add leaves its stable signup row inactive');
select is((select count(*) from public.event_time_slot_officers where event_id=-32902 and slot_id=-329201
  and officer_id=-32903),1::bigint,'rejected re-add retains its original slot selection');
select is((select count(*) from public.point_transactions where event_id=-32902 and officer_id=-32903
  and event_time_slot_id=-329201 and removed_at is not null and participation_superseded_at is not null),1::bigint,
 'rejected re-add leaves the slot-linked Point transaction superseded');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032901',true);
set local role authenticated;
select lives_ok($$select public.change_event_time_slot_signup(-32902,-32904,'{}'::bigint[],'leave_all')$$,
 'manager can remove an inactive Officer from a historical slotted roster');
reset role;
select ok((select removed_at is not null from public.event_officers where event_id=-32902 and officer_id=-32904),
 'inactive historical signup can be marked removed');
select is((select count(*) from public.event_time_slot_officers where event_id=-32902 and slot_id=-329201
  and officer_id=-32904),1::bigint,'inactive historical removal preserves its slot relationship');

select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
