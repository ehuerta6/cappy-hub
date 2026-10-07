begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
values ('00000000-0000-4000-8000-000000000741','issue142-admin@example.org',now(),'{}');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id)
values (-741,'Issue 142 Admin','issue142-admin@example.org',(select id from positions where name='Officer'),'admin','00000000-0000-4000-8000-000000000741');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000741',true);
set local role authenticated;

select is((select count(*) from event_types where name='Session' and available_for_new_events),1::bigint,
  'Session is available in the canonical Event type catalog');

select lives_ok($$select public.save_event_with_signup_sheet('Issue 142 Session','Description',(select id from event_types where name='Session'),'Campus','2099-10-12','2099-10-12 16:00Z','2099-10-12 17:00Z','{}','https://example.org/signup',null,'https://example.org/slides','https://example.org/notes')$$,
  'standalone Session accepts a signup sheet and existing resource links');
select is((select signup_sheet_url from events where name='Issue 142 Session'),'https://example.org/signup','standalone create stores signup sheet');
select is((select slides_url from events where name='Issue 142 Session'),'https://example.org/slides','Slides still save');
select is((select meeting_notes_url from events where name='Issue 142 Session'),'https://example.org/notes','Meeting notes still save');

select lives_ok($$select public.save_event_with_signup_sheet('Issue 142 Session','Description',(select id from event_types where name='Session'),'Campus','2099-10-12','2099-10-12 16:00Z','2099-10-12 17:00Z','{}',null,(select id from events where name='Issue 142 Session'),null,null)$$,
  'standalone edit can clear the optional signup sheet');
select is((select signup_sheet_url from events where name='Issue 142 Session'),null::text,'clearing signup sheet stores NULL');
select lives_ok($$select public.save_event_with_signup_sheet('Issue 142 Session','Description',(select id from event_types where name='Session'),'Campus','2099-10-12','2099-10-12 16:00Z','2099-10-12 17:00Z','{}','https://example.org/updated',(select id from events where name='Issue 142 Session'),null,null)$$,
  'standalone edit can add or change the optional signup sheet');
select is((select signup_sheet_url from events where name='Issue 142 Session'),'https://example.org/updated','standalone edit stores updated signup sheet');
select throws_ok($$select public.save_event_with_signup_sheet('Invalid signup','Description',(select id from event_types where name='Session'),'Campus','2099-10-13','2099-10-13 16:00Z','2099-10-13 17:00Z','{}','javascript:alert(1)',null,null,null)$$,
  'P0001','Signup sheet must be an HTTP(S) URL','trusted standalone mutation rejects non-HTTP URL');
select is((select count(*) from audit_logs where action='event.links_updated'
  and entity_id=(select id::text from events where name='Issue 142 Session')
  and details #>> '{after,signup_sheet_url}'='https://example.org/updated'),
  1::bigint,'signup sheet is captured in link audit history');

select lives_ok($$select public.create_recurring_event('Issue 142 Recurring','Description',(select id from event_types where name='Session'),'Campus','{}',null,null,'https://example.org/series','00000000-0000-4000-8000-000000000742','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-10-20'::date,'2099-10-21','2099-10-22'],array['2099-10-20 16:00Z'::timestamptz,'2099-10-21 16:00Z','2099-10-22 16:00Z'],array['2099-10-20 17:00Z'::timestamptz,'2099-10-21 17:00Z','2099-10-22 17:00Z'])$$,
  'recurring Session create accepts signup sheet');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/series'),3::bigint,
  'recurring creation preserves signup sheet on every occurrence');
select lives_ok($$select public.create_recurring_event('Issue 142 Recurring','Description',(select id from event_types where name='Session'),'Campus','{}',null,null,'https://example.org/series','00000000-0000-4000-8000-000000000742','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-10-20'::date,'2099-10-21','2099-10-22'],array['2099-10-20 16:00Z'::timestamptz,'2099-10-21 16:00Z','2099-10-22 16:00Z'],array['2099-10-20 17:00Z'::timestamptz,'2099-10-21 17:00Z','2099-10-22 17:00Z'])$$,
  'exact recurring signup sheet retry is idempotent');
select throws_ok($$select public.create_recurring_event('Issue 142 Recurring','Description',(select id from event_types where name='Session'),'Campus','{}',null,null,'https://example.org/changed','00000000-0000-4000-8000-000000000742','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-10-20'::date,'2099-10-21','2099-10-22'],array['2099-10-20 16:00Z'::timestamptz,'2099-10-21 16:00Z','2099-10-22 16:00Z'],array['2099-10-20 17:00Z'::timestamptz,'2099-10-21 17:00Z','2099-10-22 17:00Z'])$$,
  'P0001','Idempotency key already used','recurring retry cannot change its signup sheet');

select lives_ok($$select public.mutate_recurring_event(
  (select min(id) from events where name='Issue 142 Recurring'),'occurrence','edit','00000000-0000-4000-8000-000000000743',
  (select recurrence_series_id from events where name='Issue 142 Recurring' order by recurrence_key limit 1),0,
  '{"signup_sheet_url":"https://example.org/one"}')$$,'recurring occurrence edit accepts signup sheet');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/one'),1::bigint,
  'occurrence scope changes only the selected signup sheet');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/series'),2::bigint,
  'recurrence siblings retain their signup sheet');
select lives_ok($$select public.mutate_recurring_event(
  (select id from events where name='Issue 142 Recurring' order by recurrence_key offset 1 limit 1),'following','edit','00000000-0000-4000-8000-000000000744',
  (select recurrence_series_id from events where name='Issue 142 Recurring' order by recurrence_key limit 1),1,
  '{"signup_sheet_url":"https://example.org/following"}')$$,'recurring following scope accepts signup sheet');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/following'),2::bigint,
  'following scope changes selected and later active occurrences');
select lives_ok($$select public.create_recurring_event('Issue 142 Recurring','Description',(select id from event_types where name='Session'),'Campus','{}',null,null,'https://example.org/series','00000000-0000-4000-8000-000000000742','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',array['2099-10-20'::date,'2099-10-21','2099-10-22'],array['2099-10-20 16:00Z'::timestamptz,'2099-10-21 16:00Z','2099-10-22 16:00Z'],array['2099-10-20 17:00Z'::timestamptz,'2099-10-21 17:00Z','2099-10-22 17:00Z'])$$,
  'exact create retry remains harmless after a scoped edit');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/following'),2::bigint,
  'exact retry does not overwrite a later signup sheet edit');
select lives_ok($$select public.mutate_recurring_event(
  (select min(id) from events where name='Issue 142 Recurring'),'series','edit','00000000-0000-4000-8000-000000000745',
  (select recurrence_series_id from events where name='Issue 142 Recurring' order by recurrence_key limit 1),2,
  '{"signup_sheet_url":"https://example.org/all"}')$$,'recurring series edit accepts signup sheet');
select is((select count(*) from events where name='Issue 142 Recurring' and signup_sheet_url='https://example.org/all'),3::bigint,
  'series scope changes all active occurrences');

reset role;
select * from finish();
rollback;
