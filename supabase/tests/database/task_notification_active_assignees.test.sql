begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Issue #444: removed Task assignments keep their row for history but no
-- longer make the Officer a direct notification or reminder recipient.
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000444001','active-assignee-admin@example.test'),
  ('00000000-0000-4000-8000-000000444007','active-assignee-officer@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-9444001,'Assignee Fixture Admin','active-assignee-admin@example.test',
    (select id from positions where name='Officer'),'active','admin',
    '00000000-0000-4000-8000-000000444001'),
  (-9444002,'Current Assignee','current-assignee@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-9444003,'Removed Assignee','removed-assignee@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-9444004,'Removed Audience Assignee','removed-audience-assignee@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-9444005,'Completed Assignee','completed-assignee@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-9444006,'Inactive Assignee','inactive-assignee@example.test',
    (select id from positions where name='Officer'),'active','officer',null),
  (-9444007,'Ordinary Officer','active-assignee-officer@example.test',
    (select id from positions where name='Officer'),'active','officer',
    '00000000-0000-4000-8000-000000444007');
-- The explicit audience is the social Branch: the removed audience assignee
-- and the current assignee both belong to it.
insert into public.officer_branches(officer_id,branch_id)
select officer_id,(select id from branches where name='social')
from (values (-9444002),(-9444004)) members(officer_id);

insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,created_by,due_time)
values(-9444001,'Assignee recipients','Synthetic','Post',(select id from branches where name='intro'),
  (now() at time zone 'America/Denver')::date+1,1,-9444001,null);
insert into public.task_notification_targets(task_id,branch_id)
values(-9444001,(select id from branches where name='social'));
insert into public.task_officer_assignments(task_id,officer_id,assigned_by)
select -9444001,officer_id,-9444001
from (values (-9444002),(-9444003),(-9444004),(-9444005),(-9444006)) assignees(officer_id);
update public.task_officer_assignments set completed_at=now()
where task_id=-9444001 and officer_id=-9444005;
update public.officers set status='inactive' where id=-9444006;
-- A date-only Task is due at noon tomorrow, so a two-day reminder is already due.
delete from public.task_reminder_offsets where task_id=-9444001;
insert into public.task_reminder_offsets(task_id,minutes_before) values(-9444001,2880);

-- Earlier inbox history for the soon-removed assignee, already read.
update public.notifications set read_at=timestamptz '2026-11-01 12:00:00+00'
where recipient_officer_id=-9444003 and entity_type='task' and entity_id=-9444001
  and kind='task.assigned';
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001 and kind='task.assigned'
    and read_at is not null),1::bigint,
  'the removed assignee has read assignment history before removal');

-- Removal still goes through the trusted, branch-scoped RPC.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000444007',true);
set local role authenticated;
select throws_ok('select public.remove_task_assignment(-9444001,-9444003)',
  'P0001','Task outside branch scope',
  'an ordinary Officer cannot remove another Officer''s assignment');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000444001',true);
set local role authenticated;
select lives_ok('select public.remove_task_assignment(-9444001,-9444003)',
  'an Admin removes an incomplete assignment');
select lives_ok('select public.remove_task_assignment(-9444001,-9444004)',
  'an Admin removes an assignee who also matches the explicit audience');
reset role;
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001
    and kind='task.assignment_removed'),1::bigint,
  'a removed Officer receives one personal notice outside the Task audience');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444004 and entity_id=-9444001
    and kind='task.assignment_removed'),1::bigint,
  'an Officer receives one removal notice even when they match the Task audience');

select private.process_due_reminders();

set local role authenticated;
select lives_ok('select public.bulk_assign_task_officers(-9444001,array[-9444003]::bigint[])',
  'an Admin can reassign a previously removed Officer');
reset role;
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001 and kind='task.assigned'),
  2::bigint,'reassignment after a real removal sends one new assignment notice');
set local role authenticated;
select lives_ok('select public.remove_task_assignment(-9444001,-9444003)',
  'an Admin can remove the reassignment');
reset role;
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001
    and kind='task.assignment_removed'),2::bigint,
  'a second actual removal sends one new notice');
reset role;

select is((select count(*) from public.notifications
  where recipient_officer_id=-9444002 and entity_id=-9444001 and kind='task.reminder'),
  1::bigint,'a current incomplete assignee receives the due Task reminder');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001 and kind='task.reminder'),
  0::bigint,'a removed assignee no longer receives Task reminders');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444004 and entity_id=-9444001 and kind='task.reminder'),
  0::bigint,'audience membership does not restore an assignment-only reminder');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444005 and entity_id=-9444001 and kind='task.reminder'),
  0::bigint,'a completed assignee still receives no reminder');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444006 and entity_id=-9444001 and kind='task.reminder'),
  0::bigint,'an inactive assignee still receives no reminder');

select private.process_due_reminders();
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444002 and entity_id=-9444001 and kind='task.reminder'),
  1::bigint,'repeating the reminder processor does not duplicate delivery');

update public.tasks set title='Assignee recipients updated' where id=-9444001;

select is((select count(*) from public.notifications
  where recipient_officer_id=-9444002 and entity_id=-9444001 and kind='task.changed'),
  1::bigint,'a current assignee in the audience receives one deduplicated update notice');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001 and kind='task.changed'),
  0::bigint,'a removed assignee is not a direct recipient of later Task updates');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444004 and entity_id=-9444001 and kind='task.changed'),
  1::bigint,'a removed assignee who matches the explicit audience still receives the update');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444005 and entity_id=-9444001 and kind='task.changed'),
  1::bigint,'a completed assignee keeps receiving Task update notices');
select is((select count(*) from public.notifications
  where recipient_officer_id=-9444006 and entity_id=-9444001 and kind='task.changed'),
  0::bigint,'an inactive assignee receives no Task update notice');

select is((select count(*) from public.notifications
  where recipient_officer_id=-9444003 and entity_id=-9444001 and kind='task.assigned'
    and read_at=timestamptz '2026-11-01 12:00:00+00'),1::bigint,
  'existing inbox history and read state are preserved after removal');
select is((select count(*) from public.task_officer_assignments
  where task_id=-9444001 and officer_id in (-9444003,-9444004) and removed_at is not null),
  2::bigint,'removed assignments stay removed and are not resurrected');

select * from finish();
rollback;
