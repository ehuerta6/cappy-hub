begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid='public.notifications'::regclass),
  'personal notification history has RLS enabled');
select ok(has_table_privilege('authenticated','public.notifications','SELECT')
  and not has_table_privilege('authenticated','public.notifications','INSERT')
  and not has_table_privilege('authenticated','public.notifications','UPDATE')
  and not has_table_privilege('authenticated','public.notifications','DELETE'),
  'authenticated Officers can read but cannot write notification history directly');
select ok(has_function_privilege('authenticated','public.mark_notification_opened(bigint)','EXECUTE')
  and has_function_privilege('authenticated','public.set_notification_read_status(bigint,boolean)','EXECUTE')
  and not has_function_privilege('authenticated','private.process_due_reminders()','EXECUTE'),
  'acknowledgement is exposed while reminder processing remains private');

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000403001','notifications-a@example.test'),
  ('00000000-0000-4000-8000-000000403002','notifications-b@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
values
  (-9403001,'Notification A','notifications-a@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000403001'),
  (-9403002,'Notification B','notifications-b@example.test',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000403002');
insert into public.notifications(id,recipient_officer_id,kind,title,message,entity_type,entity_id,href,priority,dedupe_key)
  overriding system value
values
  (9403001,-9403001,'point.changed','Points updated','2 Points','point',9403001,'/points','important','pgtap:notification:403001'),
  (9403002,-9403002,'point.changed','Private points update','1 Point','point',9403002,'/points','important','pgtap:notification:403002'),
  (9403003,-9403001,'event.changed','Event updated','The time changed.','event',9403003,'/events/9403003','important','pgtap:notification:403003');
update public.notifications set read_at=pg_catalog.now() where id=9403003;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403001',true);
set local role authenticated;
select is((select count(*) from public.notifications),2::bigint,
  'an Officer reads only their own notifications');
select is((select title from public.notifications where id=9403001),'Points updated',
  'the visible row belongs to the current Officer');
select lives_ok($$select public.mark_notification_opened(9403001)$$,
  'the recipient can open and acknowledge their own notification');
select throws_ok($$select public.mark_notification_opened(9403002)$$,
  'P0001','Notification not found',
  'another Officer cannot acknowledge a notification they do not own');
reset role;
select is((select read_at is not null and reviewed_at is not null
    from public.notifications where id=9403001),true,
  'opening an important notification marks it read and reviewed');
select lives_ok($$select public.set_notification_read_status(9403001,false)$$,
  'the recipient can independently mark a notification unread');
select is((select read_at is null and reviewed_at is not null
    from public.notifications where id=9403001),true,
  'changing inbox read status preserves the existing reviewed state');
select lives_ok($$select public.set_notification_read_status(9403001,true)$$,
  'the recipient can independently mark a notification read');
select is((select read_at is not null and reviewed_at is not null
    from public.notifications where id=9403001),true,
  'read status changes do not undo or create Dashboard review state');
select throws_ok($$select public.set_notification_read_status(9403002,false)$$,
  'P0001','Notification not found',
  'another Officer cannot change a notification read status');
select is((select read_at is null and reviewed_at is null
    from public.notifications where id=9403002),true,
  'a rejected cross-recipient acknowledgement leaves the row untouched');

select lives_ok($$select public.set_notification_read_status(9403003,false)$$,
  'the Officer can make an older notice unread before bulk read');
select lives_ok($$select public.mark_all_notifications_read()$$,
  'an Officer can mark all of their unread notifications as read');
select is((select count(*) from public.notifications
    where recipient_officer_id=-9403001 and read_at is null),0::bigint,
  'bulk read reaches every unread notification for the Officer');
select is((select reviewed_at is not null from public.notifications where id=9403001),true,
  'bulk read preserves existing Dashboard review state');
select is((select reviewed_at is null from public.notifications where id=9403003),true,
  'bulk read does not create Dashboard review state');
select is((select read_at is null from public.notifications where id=9403002),true,
  'bulk read cannot change another Officer notification');

reset role;
insert into public.point_transactions(id,officer_id,points,reason,award_type)
values (9403501,-9403001,2,'first correction','correction');
select is((select message from public.notifications where entity_id=9403501 order by id desc limit 1),
  '+2 Points','a positive Point award notice carries a plus sign');
update public.point_transactions set points=3 where id=9403501;
select is((select message from public.notifications where entity_id=9403501 order by id desc limit 1),
  '+1 Points','editing an active Point communicates its balance delta');
update public.point_transactions set removed_at=pg_catalog.now(),
  removed_by='00000000-0000-4000-8000-000000403001' where id=9403501;
select is((select message from public.notifications where entity_id=9403501 order by id desc limit 1),
  '−3 Points','removing a positive Point communicates a negative balance delta');
insert into public.point_transactions(id,officer_id,points,reason,award_type)
values (9403502,-9403001,-1,'negative correction','correction');
select is((select message from public.notifications where entity_id=9403502 order by id desc limit 1),
  '−1 Points','a negative Point notice uses the minus sign');
update public.point_transactions set removed_at=pg_catalog.now(),
  removed_by='00000000-0000-4000-8000-000000403001' where id=9403502;
select is((select message from public.notifications where entity_id=9403502 order by id desc limit 1),
  '+1 Points','removing a negative Point communicates a positive balance delta');

select * from finish();
rollback;
