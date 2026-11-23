begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000097501','need-status-admin@example.org'),
 ('00000000-0000-4000-8000-000000097502','need-status-lead@example.org'),
 ('00000000-0000-4000-8000-000000097503','need-status-a@example.org'),
 ('00000000-0000-4000-8000-000000097504','need-status-b@example.org'),
 ('00000000-0000-4000-8000-000000097505','need-status-removed@example.org'),
 ('00000000-0000-4000-8000-000000097506','need-status-inactive@example.org');

insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-97501,'Need Status Admin','need-status-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000097501'),
 (-97502,'Need Status Lead','need-status-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000097502'),
 (-97503,'Need Status Officer A','need-status-a@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000097503'),
 (-97504,'Need Status Officer B','need-status-b@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000097504'),
 (-97505,'Need Status Removed','need-status-removed@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000097505'),
 (-97506,'Need Status Inactive','need-status-inactive@example.org',(select id from positions where name='Officer'),'inactive','officer','00000000-0000-4000-8000-000000097506');

select set_config('test.denver_today',(pg_catalog.statement_timestamp() at time zone 'America/Denver')::date::text,true);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
values
 (-97501,'Overdue need status','Overdue lifecycle test','Flyer',(select id from branches where name='intro'),current_setting('test.denver_today')::date-1,5,-97502),
 (-97502,'Future need status','Future lifecycle test','Post',(select id from branches where name='intro'),current_setting('test.denver_today')::date+2,5,-97502),
 (-97503,'Removed need status','Deleted lifecycle test','Story',(select id from branches where name='intro'),current_setting('test.denver_today')::date-1,5,-97502);
update tasks set removed_at=pg_catalog.now(),removed_by=-97502 where id=-97503;

insert into task_officer_assignments(task_id,officer_id,assigned_by,completed_at,approved_at,approved_by,removed_at,removed_by)
values
 (-97501,-97503,-97502,pg_catalog.now()-interval '2 days',pg_catalog.now()-interval '2 days',-97502,null,null),
 (-97501,-97504,-97502,null,null,null,null,null),
 (-97501,-97505,-97502,null,null,null,pg_catalog.now(),-97502),
 (-97501,-97506,-97502,null,null,null,null,null);
insert into point_transactions(officer_id,task_id,points,reason,award_type,created_by)
values(-97503,-97501,5,'Existing Task award','task','00000000-0000-4000-8000-000000097502');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000097502',true);
set local role authenticated;
select lives_ok($$select public.set_task_need_status(-97501,true,'current')$$,
 'a Lead can close an overdue Task outside any Branch membership');
reset role;

select is((select no_longer_needed_by from tasks where id=-97501),-97502::bigint,
 'closing records the acting Lead');
select ok((select no_longer_needed_at is not null from tasks where id=-97501),
 'closing stores a separate Task need status');
select ok((select completed_at is not null and approved_at is not null
  from task_officer_assignments where task_id=-97501 and officer_id=-97503),
 'closing preserves a completed Officer assignment');
select is((select completed_at from task_officer_assignments where task_id=-97501 and officer_id=-97504),
 null::timestamptz,'closing does not mark an incomplete Officer assignment complete');
select is((select count(*) from point_transactions where task_id=-97501 and removed_at is null),
 1::bigint,'closing preserves already awarded Points and creates no new award');
select is((select count(*) from notifications where entity_id=-97501 and kind='task.need_status_changed'),
 2::bigint,'closing notifies active assigned Officers, including completed Officers');
select is((select count(*) from notifications where recipient_officer_id=-97505 and entity_id=-97501 and kind='task.need_status_changed'),
 0::bigint,'closing does not notify an Officer whose assignment was removed');
select is((select count(*) from notifications where recipient_officer_id=-97506 and entity_id=-97501 and kind='task.need_status_changed'),
 0::bigint,'closing does not notify an inactive Officer');

set local role authenticated;
select lives_ok($$select public.set_task_need_status(-97501,true,'current')$$,
 'repeating the same status is a successful no-op');
reset role;
select is((select count(*) from notifications where entity_id=-97501 and kind='task.need_status_changed'),
 2::bigint,'a no-op does not send duplicate notices');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000097501',true);
set local role authenticated;
select lives_ok($$select public.set_task_need_status(-97501,false,'current')$$,
 'an Admin can restore a closed Task globally');
select throws_ok($$select public.set_task_need_status(-97502,true,'current')$$,
 'P0001','Only overdue Tasks can be marked no longer needed',
 'a Task that is not overdue cannot be closed');
select throws_ok($$select public.set_task_need_status(-97503,false,'current')$$,
 'P0001','Task has been removed','a deleted Task cannot be restored through need status');
reset role;
select ok((select no_longer_needed_at is null and no_longer_needed_by is null from tasks where id=-97501),
 'restoration clears the separate need status');
select is((select count(*) from notifications where entity_id=-97501 and kind='task.need_status_changed'),
 4::bigint,'restoration notifies the same active assignees once');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000097503',true);
set local role authenticated;
select throws_ok($$select public.set_task_need_status(-97501,true,'current')$$,
 'P0001','Only Leads or Admins can change Task need status',
 'an Officer cannot change Task need status');
reset role;

select ok(has_function_privilege('authenticated','public.set_task_need_status(bigint,boolean,text)','EXECUTE')
  and not has_function_privilege('anon','public.set_task_need_status(bigint,boolean,text)','EXECUTE')
  and not has_function_privilege('authenticated','private.set_task_need_status(bigint,boolean,text)','EXECUTE'),
 'only authenticated callers can reach the trusted need-status RPC');

select * from finish();
rollback;
