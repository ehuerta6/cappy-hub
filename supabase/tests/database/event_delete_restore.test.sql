begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000003301','delete-admin@example.test'),
 ('00000000-0000-4000-8000-000000003302','delete-lead@example.test'),
 ('00000000-0000-4000-8000-000000003303','delete-officer@example.test'),
 ('00000000-0000-4000-8000-000000003304','delete-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-3301,'Delete Admin','delete-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000003301'),
 (-3302,'Delete Intro Lead','delete-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000003302'),
 (-3303,'Delete Officer','delete-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000003303'),
 (-3304,'Inactive Delete Admin','delete-inactive@example.test',(select id from positions where name='Officer'),'inactive','admin','00000000-0000-4000-8000-000000003304'),
 (-3305,'Intentionally Removed Officer','removed-officer@example.test',(select id from positions where name='Officer'),'active','officer',null);
insert into officer_branches(officer_id,branch_id)
 select -3302,id from branches where name='intro';

insert into event_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
 values(-3301,'00000000-0000-4000-8000-000000003301','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',-3301,'2020-09-01','2020-09-02');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
 recurrence_series_id,recurrence_key,participation_points_per_hour_at_end)
values(-3301,'Delete history','Keep roster and slots','Campus',
 (select id from event_types where name='Meeting'),'2020-09-01','2020-09-01 09:00-06',
 '2020-09-01 11:00-06','past',-3301,'2020-09-01',1),
 (-3302,'Out of scope','Other branch','Campus',
 (select id from event_types where name='Meeting'),'2099-09-02','2099-09-02 09:00-06',
 '2099-09-02 10:00-06','upcoming',null,null,null);
insert into event_branches(event_id,branch_id)
 select -3301,id from branches where name='intro'
 union all select -3302,id from branches where name='icpc';
insert into event_officers(event_id,officer_id) values(-3301,-3303),(-3301,-3305);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity)
 values(-330101,-3301,'2020-09-01 09:00-06','2020-09-01 10:00-06',2);
insert into event_time_slot_officers(event_id,slot_id,officer_id) values(-3301,-330101,-3303);

insert into point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type,removed_at,removed_by)
values
 (-330101,-3303,-3301,null,2,'Manual event award','manual',null,null),
 (-330102,-3303,-3301,null,-1,'Event correction','correction',null,null),
 (-330103,-3303,-3301,-330101,1,'Event participation','participation',null,null),
 (-330104,-3305,-3301,null,1,'Intentionally removed participation','participation',now(),'00000000-0000-4000-8000-000000003301'),
 (-330105,-3303,null,null,4,'Independent manual award','manual',null,null);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values(-3301,'Independent Task','Not deleted with Event','Flyer',(select id from branches where name='intro'),
 '2020-09-03',3,false,-3302);
insert into point_transactions(id,officer_id,task_id,points,reason,award_type)
values(-330106,-3303,-3301,3,'Task award','task');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003302',true);
set local role authenticated;
select throws_ok($$select delete_event(-3302)$$,'P0001','Event outside branch scope',
 'Lead cannot delete an Event outside their branch scope');
select lives_ok($$select delete_event(-3301)$$,'Lead can delete one Event in their branch scope');
select is((select delete_event(-3301)),false,'repeated Event deletion is idempotent');
select is((select deleted_at is not null and delete_points_suspended from events where id=-3301),true,
 'Delete records an explicit new deletion while retaining the Event row');
select is((select count(*) from event_officers where event_id=-3301),2::bigint,
 'Delete preserves the signup');
select is((select count(*) from event_time_slots where event_id=-3301),1::bigint,
 'Delete preserves Volunteer Time Slots');
select is((select count(*) from event_time_slot_officers where event_id=-3301),1::bigint,
 'Delete preserves Time Slot selections');
select is((select recurrence_key from events where id=-3301),'2020-09-01'::date,
 'Delete preserves the recurrence occurrence identity');
select is((select count(*) from point_transactions where event_id=-3301 and removed_at is null),0::bigint,
 'all active Event-linked transactions stop contributing to active totals');
select is((select count(*) from point_transactions where event_id=-3301 and event_delete_suspended),3::bigint,
 'only the three previously active Event-linked transactions receive a deletion suspension marker');
select is((select removed_at from point_transactions where id=-330104) is not null,true,
 'a previously intentional Point removal remains independently removed');
select is((select count(*) from point_transactions where id in (-330105,-330106) and removed_at is null),2::bigint,
 'unlinked manual credit and independent Task credit remain active');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003301',true);
set local role authenticated;
select throws_ok($$select add_manual_transaction(-3303,1,'Late linked credit','manual',-3301)$$,
 'P0001','Deleted Events cannot receive Point transactions',
 'trusted Point RPC rejects new credit for a deleted Event');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003303',true);
set local role authenticated;
select throws_ok($$select restore_deleted_event(-3301)$$,'P0001','Event outside branch scope',
 'an ordinary Officer cannot restore an Event');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003301',true);
set local role authenticated;
select lives_ok($$select restore_deleted_event(-3301)$$,'Admin restores the Event and eligible Points');
select lives_ok($$select restore_deleted_event(-3301)$$,'repeated Restore is idempotent');
select is((select deleted_at is null and not delete_points_suspended from events where id=-3301),true,
 'Restore clears only the new Event deletion state');
select is((select count(*) from point_transactions where event_id=-3301 and removed_at is null),3::bigint,
 'Restore reconciles previously active manual, correction and participation credit');
select is((select count(*) from point_transactions where event_id=-3301 and event_delete_suspended),0::bigint,
 'Restore clears only the mechanical Event deletion markers');
select is((select removed_at from point_transactions where id=-330104) is not null,true,
 'Restore does not revive participation intentionally removed before deletion');
select is((select count(*) from point_transactions where id in (-330105,-330106) and removed_at is null),2::bigint,
 'Restore leaves unlinked manual and independent Task credit active');
select is((select count(*) from point_transactions where event_id=-3301),4::bigint,
 'Restore creates no replacement transactions for existing award identities');
select is((select count(*) from audit_logs where action='event.deleted' and entity_id='-3301'),1::bigint,
 'Event Delete writes one audit entry');
select is((select count(*) from audit_logs where action='event.restored' and entity_id='-3301'),1::bigint,
 'Event Restore writes one audit entry');
select is((select count(*) from audit_logs where action='points.event_delete_suspended' and entity_id in ('-330101','-330102','-330103')),3::bigint,
 'each suspended Point has actor-attributed audit evidence');
select is((select count(*) from audit_logs where action='points.event_delete_restored' and entity_id in ('-330101','-330102','-330103')),3::bigint,
 'each restored Point has audit evidence');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003304',true);
set local role authenticated;
select throws_ok($$select delete_event(-3301)$$,'P0001','Unauthorized',
 'inactive manager cannot delete an Event');

reset role;
select * from finish();
rollback;
