begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000033301','recurrence-lifecycle-admin@example.test'),
 ('00000000-0000-4000-8000-000000033302','recurrence-lifecycle-lead@example.test'),
 ('00000000-0000-4000-8000-000000033303','recurrence-lifecycle-officer@example.test'),
 ('00000000-0000-4000-8000-000000033304','recurrence-lifecycle-inactive@example.test');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-33301,'Recurrence Admin','recurrence-lifecycle-admin@example.test',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000033301'),
 (-33302,'Recurrence Lead','recurrence-lifecycle-lead@example.test',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000033302'),
 (-33303,'Recurrence Officer','recurrence-lifecycle-officer@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000033303'),
 (-33304,'Inactive Recurrence Admin','recurrence-lifecycle-inactive@example.test',(select id from positions where name='Officer'),'inactive','admin','00000000-0000-4000-8000-000000033304'),
 (-33305,'Removed Award Officer','removed-award@example.test',(select id from positions where name='Officer'),'active','officer',null);
insert into officer_branches select -33302,id from branches where name='intro';

insert into event_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values(-33301,'00000000-0000-4000-8000-000000033301','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4',-33301,'2020-01-01','2020-01-04');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
 recurrence_series_id,recurrence_key,participation_points_per_hour_at_end)
select -33300-n,'Recurring Event','history','Campus',(select id from event_types where name='Workshop'),
 date '2020-01-01'+n,(date '2020-01-01'+n+time '10:00') at time zone 'America/Denver',
 (date '2020-01-01'+n+time '11:00') at time zone 'America/Denver','past',-33301,date '2020-01-01'+n,1
from generate_series(0,3) n;
insert into event_branches(event_id,branch_id)
select id,(select id from branches where name='intro') from events where id between -33303 and -33300;
insert into event_officers(event_id,officer_id)
select id,-33303 from events where id between -33303 and -33300;
insert into event_officers(event_id,officer_id) values(-33301,-33305);
insert into event_time_slots(id,event_id,starts_at,ends_at,capacity)
select -33310-(id*-1-33300),id,starts_at,ends_at,3 from events where id between -33303 and -33300;
insert into event_time_slot_officers(event_id,slot_id,officer_id)
select e.id,s.id,-33303 from events e join event_time_slots s on s.event_id=e.id
where e.id between -33303 and -33300;
insert into event_time_slot_officers(event_id,slot_id,officer_id)
select -33301,id,-33305 from event_time_slots where event_id=-33301;
insert into point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type)
select -33320-(e.id*-1-33300),-33303,e.id,s.id,1,'Historical participation','participation'
from events e join event_time_slots s on s.event_id=e.id where e.id between -33303 and -33300;
insert into point_transactions(id,officer_id,event_id,points,reason,award_type)
values(-33331,-33303,-33302,2,'Independent manual credit','manual');
insert into point_transactions(id,officer_id,event_id,event_time_slot_id,points,reason,award_type,
 removed_at,removed_by)
select -33332,-33305,-33301,id,1,'Intentional prior removal','participation',now(),
 '00000000-0000-4000-8000-000000033301' from event_time_slots where event_id=-33301;

insert into task_series(id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values(-33302,'00000000-0000-4000-8000-000000033302','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4',-33302,'2020-01-01','2020-01-04');
insert into tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,
 recurrence_series_id,recurrence_key)
select -33340-n,'Recurring Task','history','Post',(select id from branches where name='intro'),
 date '2020-01-01'+n,2,false,-33302,-33302,date '2020-01-01'+n
from generate_series(0,3) n;
insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
select id,-33303,-33302,now()-interval '1 day' from tasks where id between -33343 and -33340;
insert into point_transactions(id,officer_id,task_id,points,reason,award_type)
select -33350-(id*-1-33340),-33303,id,2,'Completed Task','task'
from tasks where id between -33343 and -33340;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033301',true);
set local role authenticated;
select lives_ok($$select delete_event(-33302)$$,'independent Event deletion is preserved');
select lives_ok($$select mutate_recurring_event_lifecycle(-33301,'following','delete','00000000-0000-4000-8000-000000033311',-33301,0)$$,
 'following Event Delete succeeds with current revision');
select is((select array_agg(id order by id) from events where id in (-33300,-33301,-33302,-33303) and deleted_at is not null),array[-33303,-33302,-33301]::bigint[],
 'following Event Delete leaves earlier occurrence and includes selected/following active rows');
select is((select count(*) from event_officers where event_id in (-33300,-33301,-33302,-33303)),5::bigint,
 'scoped Event Delete preserves native signups');
select is((select count(*) from audit_logs where action='event.series_delete'
  and entity_id='-33301' and actor_officer_id=-33301
  and details->>'scope'='following'),1::bigint,
 'following Event lifecycle mutation records its manager, scope, and audit evidence');
select is((select count(*) from event_time_slot_officers where event_id in (-33300,-33301,-33302,-33303)),5::bigint,
 'scoped Event Delete preserves slot assignments');
select is((select count(*) from point_transactions where event_id in (-33300,-33301,-33302,-33303) and removed_at is null),1::bigint,
 'only the independently deleted Event remains excluded before restore');
select lives_ok($$select mutate_recurring_event_lifecycle(-33301,'following','delete','00000000-0000-4000-8000-000000033311',-33301,0)$$,
 'exact Event deletion retry returns the original result after revision change');
select throws_ok($$select mutate_recurring_event(-33301,'occurrence','edit','00000000-0000-4000-8000-000000033311',-33301,0,'{"name":"Retry collision"}')$$,
 'P0001','Idempotency key already used','lifecycle and recurring edits share the request-key namespace');
select throws_ok($$select mutate_recurring_event_lifecycle(-33301,'series','delete',gen_random_uuid(),-33301,0)$$,
 'P0001','Series changed; reload and try again','stale Event revision is rejected');
select lives_ok($$select mutate_recurring_event_lifecycle(-33301,'occurrence','restore','00000000-0000-4000-8000-000000033312',-33301,1)$$,
 'single-occurrence Restore applies to its selected Delete batch');
select is((select deleted_at is null from events where id=-33301),true,'selected Event occurrence restored');
select is((select deleted_at is not null from events where id=-33302),true,'independently deleted Event remains deleted');
select lives_ok($$select mutate_recurring_event_lifecycle(-33303,'series','restore','00000000-0000-4000-8000-000000033313',-33301,2)$$,
 'All occurrences restores the remaining members of the original Delete batch');
select is((select count(*) from events where id in (-33300,-33301,-33302,-33303) and deleted_at is null),3::bigint,
 'All-scope restore preserves independent deletion');
select is((select count(*) from point_transactions where event_id in (-33300,-33301,-33302,-33303) and removed_at is null),3::bigint,
 'eligible Event Points reconcile without replacing transaction identities');
select is((select count(*) from point_transactions where event_id=-33302 and removed_at is not null),2::bigint,
 'independent Event deletion keeps its Point suspended');
select is((select count(*) from point_transactions where id=-33331 and event_id=-33302
  and points=2 and award_type='manual' and removed_at is not null),1::bigint,
 'independent manual Event credit identity is retained while its Event stays deleted');
select is((select count(*) from point_transactions where id=-33332 and removed_at is not null),1::bigint,
 'an intentionally removed automatic award stays removed across recurrence Restore');
select is((select count(*) from events where id in (-33300,-33301,-33302,-33303) and recurrence_key=event_date),4::bigint,
 'stable Event IDs and recurrence identities remain intact');
reset role;
delete from event_branches where event_id=-33303;
insert into event_branches(event_id,branch_id) select -33303,id from branches where name='icpc';
update tasks set branch_id=(select id from branches where name='icpc') where id=-33343;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033302',true);
set local role authenticated;
select throws_ok($$select mutate_recurring_event_lifecycle(-33301,'series','delete',gen_random_uuid(),-33301,3)$$,
 'P0001','Event outside branch scope','Lead scope is checked across every Event in the requested series');
select throws_ok($$select mutate_recurring_task_lifecycle(-33340,'series','delete',gen_random_uuid(),-33302,0)$$,
 'P0001','Task outside branch scope','Lead cannot mutate an out-of-branch Task series');
reset role;
select is((select count(*) from tasks where id between -33343 and -33340 and removed_at is null),4::bigint,
 'out-of-scope Task scope rejection leaves every occurrence unchanged');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033301',true);
set local role authenticated;
select lives_ok($$select mutate_recurring_event_lifecycle(-33300,'series','delete','00000000-0000-4000-8000-000000033314',-33301,3)$$,
 'All-scope Event Delete includes every still-active occurrence');
select lives_ok($$select mutate_recurring_event_lifecycle(-33300,'series','restore','00000000-0000-4000-8000-000000033315',-33301,4)$$,
 'All-scope Event Restore reconciles the Delete batch');
select is((select count(*) from events where id in (-33300,-33301,-33302,-33303) and deleted_at is null),3::bigint,
 'All-scope Event recovery leaves the independently deleted occurrence untouched');
select lives_ok($$select mutate_recurring_task_lifecycle(-33341,'series','delete','00000000-0000-4000-8000-000000033321',-33302,0)$$,
 'All-scope Task Delete preserves every completed occurrence');
select is((select count(*) from audit_logs where action='task.series_delete'
  and entity_id='-33302' and actor_officer_id=-33301 and details->>'scope'='series'),1::bigint,
 'Task series Delete records its actor and scope');
select is((select count(*) from point_transactions where task_id in (-33340,-33341,-33342,-33343) and task_reconciliation_suspended),4::bigint,
 'Task Delete suspends existing automatic award rows');
select lives_ok($$select mutate_recurring_task_lifecycle(-33341,'series','restore','00000000-0000-4000-8000-000000033322',-33302,1)$$,
 'All-scope Task Restore reconciles eligible awards');
select is((select count(*) from tasks where id between -33343 and -33340 and removed_at is null),4::bigint,
 'Task Restore reactivates all batch occurrences');
select is((select count(*) from point_transactions where task_id in (-33340,-33341,-33342,-33343) and removed_at is null),4::bigint,
 'Task Restore reuses the same automatic Point transaction identities');
select is((select count(*) from task_officer_assignments where task_id in (-33340,-33341,-33342,-33343) and completed_at is not null),4::bigint,
 'Task completion history remains intact');
select lives_ok($$select mutate_recurring_task_lifecycle(-33341,'series','restore','00000000-0000-4000-8000-000000033322',-33302,1)$$,
 'exact Task restore retry does not duplicate awards');
select is((select count(*) from point_transactions where task_id in (-33340,-33341,-33342,-33343)),4::bigint,
 'Task retry preserves original Point identities');
select lives_ok($$select mutate_recurring_task_lifecycle(-33342,'following','delete','00000000-0000-4000-8000-000000033323',-33302,2)$$,
 'Task following Delete affects selected and later occurrences');
select lives_ok($$select mutate_recurring_task_lifecycle(-33342,'occurrence','restore','00000000-0000-4000-8000-000000033324',-33302,3)$$,
 'Task occurrence Restore restores only the selected row from the batch');
select is((select removed_at is not null from tasks where id=-33343),true,
 'Task occurrence Restore leaves the following Task deleted');
select lives_ok($$select mutate_recurring_task_lifecycle(-33343,'following','restore','00000000-0000-4000-8000-000000033325',-33302,4)$$,
 'Task following Restore restores remaining matching rows in the batch');
select lives_ok($$select mutate_recurring_task_lifecycle(-33340,'occurrence','delete','00000000-0000-4000-8000-000000033326',-33302,5)$$,
 'Task occurrence Delete removes only the selected Task');
select lives_ok($$select mutate_recurring_task_lifecycle(-33340,'occurrence','restore','00000000-0000-4000-8000-000000033327',-33302,6)$$,
 'Task occurrence Restore reuses the single-occurrence delete behavior');
select lives_ok($$select mutate_recurring_task_lifecycle(-33340,'occurrence','restore','00000000-0000-4000-8000-000000033327',-33302,6)$$,
 'exact Task Restore retry does not duplicate awards');
select throws_ok($$select mutate_recurring_task_lifecycle(-33341,'series','restore',gen_random_uuid(),-33302,1)$$,
 'P0001','Series changed; reload and try again','stale Task revision is rejected');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033303',true);
set local role authenticated;
select throws_ok($$select mutate_recurring_task_lifecycle(-33341,'occurrence','delete',gen_random_uuid(),-33302,7)$$,
 'P0001','Task outside branch scope','ordinary Officer cannot delete a Task occurrence');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033304',true);
set local role authenticated;
select throws_ok($$select mutate_recurring_event_lifecycle(-33300,'occurrence','delete',gen_random_uuid(),-33301,5)$$,
 'P0001','Unauthorized','inactive Admin cannot mutate a recurring Event');
reset role;
select * from finish();
rollback;
