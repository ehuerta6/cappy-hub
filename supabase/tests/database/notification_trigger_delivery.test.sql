begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000403301','notification-recipient@example.test'),
  ('00000000-0000-4000-8000-000000403302','notification-lead@example.test'),
  ('00000000-0000-4000-8000-000000403303','notification-admin@example.test'),
  ('00000000-0000-4000-8000-000000403304','notification-outsider@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-9403301,'Notification Recipient','notification-recipient@example.test',
    (select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000403301'),
  (-9403302,'Notification Lead','notification-lead@example.test',
    (select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000403302'),
  (-9403303,'Notification Admin','notification-admin@example.test',
    (select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000403303'),
  (-9403304,'Notification Outsider','notification-outsider@example.test',
    (select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000403304');
insert into public.officer_branches(officer_id,branch_id)
select -9403302,id from branches where name='intro';

insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
values(-9403301,'Audience Event','Synthetic','Campus',
  (select id from event_types where name='Meeting'),
  ((current_date+10+time '10:00') at time zone 'America/Denver')::date,
  ((current_date+10+time '10:00') at time zone 'America/Denver'),
  ((current_date+10+time '11:00') at time zone 'America/Denver'),'upcoming');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403303',true);
set local role authenticated;
select lives_ok($$select public.set_event_notification_settings(-9403301,false,
  array[(select id from branches where name='intro')],
  array[(select id from positions where name='Lead')],array[1440])$$,
  'saving a combined audience emits the Event creation notification');
reset role;
select is((select count(*) from public.notifications where kind='event.created'
  and entity_id=-9403301 and recipient_officer_id=-9403302),1::bigint,
  'overlapping Branch and Position audience delivers one Event notice');
select is((select count(*) from public.notifications where kind='event.created'
  and entity_id=-9403301 and recipient_officer_id=-9403303),1::bigint,
  'Event administrators receive creation notices across branches');
select is((select count(*) from public.notifications where kind='event.created'
  and entity_id=-9403301 and recipient_officer_id=-9403304),0::bigint,
  'Officers outside the Event audience receive no creation notice');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403301',true);
insert into public.event_officers(event_id,officer_id) values(-9403301,-9403301);
update public.event_officers set removed_at=pg_catalog.now()
where event_id=-9403301 and officer_id=-9403301;
select is((select count(*) from public.notifications where kind='event.signup'
  and recipient_officer_id=-9403301 and entity_id=-9403301),1::bigint,
  'the signing-up Officer receives a confirmation');
select is((select count(*) from public.notifications where kind='event.left'
  and recipient_officer_id=-9403301 and entity_id=-9403301),1::bigint,
  'the departing Officer receives a confirmation');
update public.events set description='Description-only edit' where id=-9403301;
select is((select count(*) from public.notifications where kind='event.changed'
  and entity_id=-9403301),0::bigint,
  'description-only Event edits do not create important notices');
update public.events set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour'
where id=-9403301;
select is((select count(*) from public.notifications where kind='event.changed'
  and recipient_officer_id=-9403303 and entity_id=-9403301),1::bigint,
  'an important Event time change notifies administrators');

insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
values(-9403301,'Audience Task','Synthetic','Post',
  (select id from branches where name='intro'),current_date+10,2,-9403303);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403303',true);
set local role authenticated;
select lives_ok($$select public.set_task_notification_settings(-9403301,false,
  array[(select id from branches where name='intro')],
  array[(select id from positions where name='Lead')],array[1440])$$,
  'saving Task audiences accepts combined Branch and Position selection');
reset role;
insert into public.task_officer_assignments(task_id,officer_id,assigned_by)
values(-9403301,-9403301,-9403303);
select is((select count(*) from public.notifications where kind='task.assigned'
  and recipient_officer_id=-9403301 and entity_id=-9403301),1::bigint,
  'a direct Task assignee receives assignment notice outside the selected audience');
select is((select count(*) from public.notifications where kind='task.assigned'
  and recipient_officer_id=-9403302 and entity_id=-9403301),1::bigint,
  'overlapping Task Branch and Position audiences receive one notice');
update public.tasks set title='Updated audience task' where id=-9403301;
select is((select count(*) from public.notifications where kind='task.changed'
  and recipient_officer_id=-9403301 and entity_id=-9403301),1::bigint,
  'Task assignees receive Task update notices');
update public.task_officer_assignments set completed_at=pg_catalog.now()
where task_id=-9403301 and officer_id=-9403301;
select is((select count(*) from public.notifications where kind='task.completed'
  and recipient_officer_id=-9403302 and entity_id=-9403301),1::bigint,
  'Task completion notifies the Lead for its Branch');

insert into public.point_transactions(officer_id,points,reason,award_type,created_by)
values(-9403301,2,'Synthetic notification test','manual','00000000-0000-4000-8000-000000403303');
select is((select count(*) from public.notifications where kind='point.changed'
  and recipient_officer_id=-9403301),1::bigint,
  'a personal Points change creates a notification');
insert into public.officer_warnings(officer_id,reason,status)
values(-9403301,'Synthetic warning one','approved'),
      (-9403301,'Synthetic warning two','approved'),
      (-9403301,'Synthetic warning three','approved');
select is((select count(*) from public.notifications where kind='warning.changed'
  and recipient_officer_id=-9403301),3::bigint,
  'personal Warning changes create notifications');
select is((select count(*) from public.notifications where kind='warning.threshold'
  and recipient_officer_id=-9403302),1::bigint,
  'reaching three active Warnings notifies the Branch Lead');

select * from finish();
rollback;
