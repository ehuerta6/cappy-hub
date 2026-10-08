begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000009901','archive-admin@example.org'),
 ('00000000-0000-4000-8000-000000009902','archive-lead@example.org'),
 ('00000000-0000-4000-8000-000000009903','archive-officer@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-9901,'Archive Admin','archive-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000009901'),
 (-9902,'Archive Lead','archive-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000009902'),
 (-9903,'Archive Officer','archive-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000009903');
insert into officer_branches(officer_id,branch_id)
 select -9902,id from branches where name='intro';

insert into event_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values(-9901,'00000000-0000-4000-8000-000000009901','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',-9901,'2099-09-20','2099-09-21');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
  recurrence_series_id,recurrence_key,deleted_at,deleted_by)
values(-9901,'Archived cancelled occurrence','Keep this','Campus',
  (select id from event_types where name='Meeting'),'2099-09-20','2099-09-20 09:00-06',
  '2099-09-20 10:00-06','cancelled',-9901,'2099-09-20',null,null);
insert into event_branches(event_id,branch_id) select -9901,id from branches where name='intro';
insert into event_officers(event_id,officer_id) values(-9901,-9903);
insert into point_transactions(officer_id,event_id,points,reason,award_type)
values(-9903,-9901,2,'Existing signup award','participation');

insert into task_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values(-9901,'00000000-0000-4000-8000-000000009902','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',-9902,'2099-09-20','2099-09-21');
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,
  recurrence_series_id,recurrence_key,removed_at,removed_by)
values(-9901,'Archived completed occurrence','Keep this','Flyer',(select id from branches where name='intro'),
  '2099-09-20',5,false,-9902,-9901,'2099-09-20',now(),-9902);
insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
values(-9901,-9903,-9902,'2099-09-21 12:00:00+00');
insert into point_transactions(officer_id,task_id,points,reason,award_type,created_by)
values(-9903,-9901,5,'Task completion: Archived completed occurrence','task',null);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values(-9903,'Protected Task','Completed state stays protected','Flyer',(select id from branches where name='intro'),
  '2099-09-23',2,false,-9902);
insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
values(-9903,-9903,-9902,'2099-09-24 12:00:00+00');
insert into point_transactions(officer_id,task_id,points,reason,award_type,created_by)
values(-9903,-9903,2,'Task completion: Protected Task','task',null);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values(-9902,'Archivable Task','No protected history','Flyer',(select id from branches where name='intro'),
  '2099-09-22',2,false,-9902);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009902',true);
set local role authenticated;
select lives_ok($$select remove_event(-9901)$$,'a branch Lead archives an Event in scope');
select throws_ok($$select remove_task(-9903)$$,'P0001','Completed or awarded Tasks cannot be archived',
  'completed or awarded Tasks retain their current archive protection');
select lives_ok($$select remove_task(-9902)$$,'a branch Lead archives an eligible Task in scope');
reset role;
select is((select count(*) from audit_logs where action='event.archived' and entity_id='-9901'),1::bigint,'Event archive is audited');
select is((select count(*) from audit_logs where action='task.archived' and entity_id='-9902'),1::bigint,'Task archive is audited');
set local role authenticated;
select lives_ok($$select restore_event_archive(-9901)$$,'a branch Lead restores an archived Event in scope');
select is((select id from events where id=-9901),-9901::bigint,'Event restoration preserves the original row ID');
select is((select deleted_at from events where id=-9901),null::timestamptz,'Event restoration clears only its archive marker');
select is((select status from events where id=-9901),'cancelled','Event restoration does not uncancel');
select is((select recurrence_key from events where id=-9901),'2099-09-20'::date,'Event restoration preserves its recurrence occurrence');
select is((select count(*) from event_officers where event_id=-9901),1::bigint,'Event restoration preserves signups');
select is((select count(*) from point_transactions where event_id=-9901),1::bigint,'Event restoration preserves Point history');
select lives_ok($$select restore_task(-9901)$$,'a branch Lead restores an archived completed Task in scope');
select is((select id from tasks where id=-9901),-9901::bigint,'Task restoration preserves the original row ID');
select is((select removed_at from tasks where id=-9901),null::timestamptz,'Task restoration clears only its archive marker');
select is((select recurrence_key from tasks where id=-9901),'2099-09-20'::date,'Task restoration preserves its occurrence identity');
select isnt((select completed_at from task_officer_assignments where task_id=-9901 and officer_id=-9903),null::timestamptz,'Task restoration preserves completion');
select is((select count(*) from point_transactions where task_id=-9901),1::bigint,'Task restoration preserves its Point award');
reset role;
select is((select count(*) from audit_logs where action='event.restored' and entity_id='-9901'),1::bigint,'Event restore is audited');
select is((select count(*) from audit_logs where action='task.restored' and entity_id='-9901'),1::bigint,'Task restore is audited');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009903',true);
set local role authenticated;
select throws_ok($$select restore_event_archive(-9901)$$,'P0001','Event outside branch scope','an Officer cannot restore an Event');
select throws_ok($$select restore_task(-9901)$$,'P0001','Task outside branch scope','an Officer cannot restore a Task');
reset role;
select * from finish();
rollback;
