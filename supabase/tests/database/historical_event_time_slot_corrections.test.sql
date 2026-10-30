begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000035801','slot-correction-lead@example.test'),
 ('00000000-0000-4000-8000-000000035802','slot-correction-officer@example.test'),
 ('00000000-0000-4000-8000-000000035803','slot-correction-other@example.test'),
 ('00000000-0000-4000-8000-000000035804','slot-correction-outsider@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-35801,'Slot Correction Lead','slot-correction-lead@example.test',(select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000035801'),
 (-35802,'Slot Correction Officer','slot-correction-officer@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000035802'),
 (-35803,'Unaffected Slot Officer','slot-correction-other@example.test',(select id from positions where code='officer'),'active','officer','00000000-0000-4000-8000-000000035803'),
 (-35804,'Other Branch Lead','slot-correction-outsider@example.test',(select id from positions where code='lead'),'active','officer','00000000-0000-4000-8000-000000035804');
insert into officer_branches(officer_id,branch_id)
select -35801,id from branches where name='intro'
union all select -35804,id from branches where name='icpc';

insert into events(id,name,description,location,event_type_id,starts_at,ends_at,status,
  participation_points_per_hour_at_end,max_volunteers)
values(-35801,'Historical slot correction','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  '2020-01-01 09:00-07','2020-01-01 12:00-07','past',1,null),
 (-35802,'Deleted slot correction','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  '2020-01-02 09:00-07','2020-01-02 12:00-07','past',1,null),
 (-35803,'Out of scope slot correction','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  '2020-01-03 09:00-07','2020-01-03 12:00-07','past',1,null),
 (-35804,'Cancelled slot correction','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  '2020-01-04 09:00-07','2020-01-04 12:00-07','cancelled',1,null);
insert into event_branches(event_id,branch_id)
select -35801,id from branches where name='intro'
union all select -35802,id from branches where name='intro'
union all select -35803,id from branches where name='icpc'
union all select -35804,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values
 (-35801,-35802),(-35801,-35803),(-35802,-35802),(-35803,-35802),(-35804,-35802);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity) values
 (-358101,-35801,'2020-01-01 09:00-07','2020-01-01 10:00-07',null),
 (-358102,-35801,'2020-01-01 10:00-07','2020-01-01 11:30-07',1),
 (-358103,-35801,'2020-01-01 11:30-07','2020-01-01 12:00-07',null),
 (-358201,-35802,'2020-01-02 09:00-07','2020-01-02 10:00-07',null),
 (-358301,-35803,'2020-01-03 09:00-07','2020-01-03 10:00-07',null),
 (-358401,-35804,'2020-01-04 09:00-07','2020-01-04 10:00-07',null);
insert into event_time_slot_officers(event_id,slot_id,officer_id,created_by) values
 (-35801,-358101,-35802,'00000000-0000-4000-8000-000000035801'),
 (-35801,-358101,-35803,'00000000-0000-4000-8000-000000035801'),
 (-35801,-358102,-35803,'00000000-0000-4000-8000-000000035801'),
 (-35802,-358201,-35802,'00000000-0000-4000-8000-000000035801'),
 (-35803,-358301,-35802,'00000000-0000-4000-8000-000000035801'),
 (-35804,-358401,-35802,'00000000-0000-4000-8000-000000035801');
insert into point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type,created_by,
  removed_at,removed_by,slot_selection_removed)
values
 (-358101,-35802,-35801,-358101,1,'Event time slot participation','participation',null,null,null,false),
 (-358102,-35803,-35801,-358101,1,'Event time slot participation','participation',null,null,null,false),
 (-358103,-35803,-35801,-358102,1.5,'Event time slot participation','participation',null,null,null,false),
 (-358104,-35802,-35801,-358102,1.5,'Event time slot participation','participation',null,
   '2020-01-01 12:01-07','00000000-0000-4000-8000-000000035801',false),
 (-358105,-35802,-35801,-358103,0.25,'Removed Time Slot selection','participation',null,
   '2020-01-01 12:02-07','00000000-0000-4000-8000-000000035801',true),
 (-358106,-35802,-35801,null,4,'Independent manual credit','manual','00000000-0000-4000-8000-000000035801',null,null,false),
 (-358107,-35802,-35801,null,-2,'Independent correction','correction','00000000-0000-4000-8000-000000035801',null,null,false),
 (-358201,-35802,-35802,-358201,1,'Event time slot participation','participation',null,null,null,false),
 (-358301,-35802,-35803,-358301,1,'Event time slot participation','participation',null,null,null,false);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035804',true);
set local role authenticated;
select throws_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358103]::bigint[])$$,
  'P0001','Event outside branch scope','a Lead cannot correct an Event outside managed branches');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035802',true);
set local role authenticated;
select throws_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358103]::bigint[])$$,
  'P0001','Event outside branch scope','an Officer cannot make historical slot corrections');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035801',true);
set local role authenticated;
select throws_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358102]::bigint[])$$,
  'P0001','This Time Slot is full','historical corrections preserve per-slot capacity');
select throws_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358301]::bigint[])$$,
  'P0001','One or more Time Slots do not belong to this Event','slot IDs must belong to the corrected Event');
select lives_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358103]::bigint[])$$,
  'a scoped Event manager can replace an Officer historical slot assignment');
reset role;

select is((select removed_at is null from public.event_officers where event_id=-35801 and officer_id=-35802),true,
  'slot correction preserves the canonical Event signup');
select is((select count(*) from public.event_officers where event_id=-35801 and officer_id=-35802),1::bigint,
  'slot correction preserves the signup identity');
select is((select count(*) from public.event_time_slot_officers where event_id=-35801 and officer_id=-35802
  and slot_id=-358101),0::bigint,'removed slot assignment is no longer effective');
select is((select count(*) from public.event_time_slot_officers where event_id=-35801 and officer_id=-35802
  and slot_id=-358103),1::bigint,'new slot assignment is effective');
select is((select removed_at is not null and slot_selection_removed
  and removed_by='00000000-0000-4000-8000-000000035801' from public.point_transactions where id=-358101),true,
  'removed-slot automatic credit keeps its stable row and manager audit attribution');
select is((select removed_at is null and points=0.5 from public.point_transactions where id=-358105),true,
  'reselected slot reuses its existing removed automatic transaction at the corrected duration');
select is((select removed_at is not null and not slot_selection_removed
  from public.point_transactions where id=-358104),true,
  'an intentional removal on another slot stays untouched');
select is((select removed_at from public.point_transactions where id=-358106),null::timestamptz,
  'independent manual credit is preserved');
select is((select removed_at from public.point_transactions where id=-358107),null::timestamptz,
  'independent correction credit is preserved');
select is((select points from public.point_transactions where id=-358102),1::numeric,
  'unrelated Officer automatic credit is unchanged');
select ok(exists(select 1 from public.audit_logs where action='event.time_slot_assignments_corrected'
  and entity_id='-35801' and actor_id='00000000-0000-4000-8000-000000035801'
  and details->>'officer_id'='-35802'
  and details->'before' @> '[{"slot_id": -358101}]'::jsonb
  and details->'after' @> '[{"slot_id": -358103}]'::jsonb),
  'assignment audit records actor and complete before/after selections');
select ok(exists(select 1 from public.audit_logs where action='points.participation_removed'
  and entity_id='-358101' and actor_id='00000000-0000-4000-8000-000000035801'),
  'removed automatic credit has separate actor-attributed Point audit evidence');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035801',true);
set local role authenticated;
select lives_ok($$select public.correct_historical_event_time_slots(-35801,-35802,array[-358103]::bigint[])$$,
  'repeating the same correction succeeds idempotently');
select lives_ok($$select public.correct_historical_event_time_slots(-35801,-35802,'{}'::bigint[])$$,
  'a historical manager can remove all selected slots without removing the Event signup');
reset role;
select is((select removed_at is null from public.event_officers where event_id=-35801 and officer_id=-35802),true,
  'removing every slot selection still preserves the canonical Event signup');
select is((select removed_at is not null and slot_selection_removed
  from public.point_transactions where id=-358105),true,
  'removed automatic slot credit remains in history after deselection');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035801',true);
set local role authenticated;
select lives_ok($$select public.delete_event(-35802)$$,'Event Delete suspends all linked active credit');
select throws_ok($$select public.correct_historical_event_time_slots(-35802,-35802,array[-358201]::bigint[])$$,
  'P0001','Deleted Events cannot be corrected','slot correction cannot reactivate deleted-Event credit');
select is((select removed_at is not null and event_delete_suspended
  from public.point_transactions where id=-358201),true,
  'a rejected correction leaves Delete-suspended Point history untouched');
select lives_ok($$select public.restore_deleted_event(-35802)$$,
  'Event Restore keeps the existing slot assignment and reconciles eligible participation');
reset role;
select is((select removed_at is null from public.point_transactions where id=-358201),true,
  'Event Restore reactivates only its preserved eligible automatic award');
select is((select count(*) from public.event_time_slot_officers where event_id=-35802
  and slot_id=-358201 and officer_id=-35802),1::bigint,
  'Event Delete/Restore preserves the historical slot relationship');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000035801',true);
set local role authenticated;
select throws_ok($$select public.correct_historical_event_time_slots(-35803,-35802,array[-358301]::bigint[])$$,
  'P0001','Event outside branch scope','the trusted RPC rejects an out-of-scope manager');
select throws_ok($$select public.correct_historical_event_time_slots(-35804,-35802,array[-358401]::bigint[])$$,
  'P0001','Cancelled Events cannot be corrected','historical slot correction does not change legacy cancellation state');
reset role;

select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
