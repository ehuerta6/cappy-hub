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
  (9403002,-9403002,'point.changed','Private points update','1 Point','point',9403002,'/points','important','pgtap:notification:403002');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000403001',true);
set local role authenticated;
select is((select count(*) from public.notifications),1::bigint,
  'an Officer reads only their own notifications');
select is((select title from public.notifications),'Points updated',
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
select is((select read_at is null and reviewed_at is null
    from public.notifications where id=9403002),true,
  'a rejected cross-recipient acknowledgement leaves the row untouched');

select * from finish();
rollback;
