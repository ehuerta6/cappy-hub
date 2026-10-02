begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000410','activity-date-officer@example.org'),
 ('00000000-0000-4000-8000-000000000411','activity-date-inactive@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-410,'Activity Date Officer','activity-date-officer@example.org',
  (select id from positions where name='Officer'),'active','officer',
  '00000000-0000-4000-8000-000000000410'),
 (-411,'Activity Date Inactive','activity-date-inactive@example.org',
  (select id from positions where name='Officer'),'inactive','officer',
  '00000000-0000-4000-8000-000000000411');

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at)
 values(-410,'Activity Date Event','Activity date test','TBA',
  (select id from event_types where name='Meeting'),'2026-10-01',
  '2026-10-01 09:00-06','2026-10-01 10:00-06');
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
 values(-410,'Activity Date Task','Task date test','Flyer',
  (select id from branches where name='intro'),'2020-09-20',1,-410);

insert into point_transactions(id,officer_id,event_id,points,reason,award_type,created_at)
 values(-4101,-410,-410,2,'Event participation','participation','2026-10-03 12:00:00+00'),
       (-4102,-410,-410,1,'Event-linked correction','correction','2026-10-04 12:00:00+00'),
       (-4103,-410,null,1,'Standalone manual','manual','2026-10-01 00:30:00+00');
insert into point_transactions(id,officer_id,task_id,points,reason,award_type,created_at)
 values(-4104,-410,-410,1,'Task completion','task','2026-10-03 00:30:00+00');

select is((select activity_date from point_history where id=-4101),
  '2026-10-01'::date,'Event participation activity date uses canonical Event date');
select is((select created_at from point_history where id=-4101),
  '2026-10-03 12:00:00+00'::timestamptz,
  'Event participation retains the original transaction timestamp');
select is((select event_date from point_history where id=-4101),
  '2026-10-01'::date,'view exposes the Event calendar date');
select is((select activity_date from point_history where id=-4102),
  '2026-10-01'::date,'Event-linked correction uses Event date regardless of award type');
select is((select activity_date from point_history where id=-4103),
  '2026-09-30'::date,'standalone transaction date uses America/Denver calendar date');
select is((select activity_date from point_history where id=-4104),
  '2026-10-02'::date,'Task transaction uses creation date rather than Task due date');

select ok((select 'security_invoker=true'=any(reloptions)
  from pg_catalog.pg_class where oid='public.point_history'::regclass),
  'Point History view preserves security_invoker=true');
select ok(has_table_privilege('authenticated','public.point_history','SELECT')
  and not has_table_privilege('anon','public.point_history','SELECT'),
  'only authenticated clients have Point History view SELECT access');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000410',true);
set local role authenticated;
select is((select count(*) from point_history where id=-4101),1::bigint,
  'active authenticated officer reads Point History under underlying RLS');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000411',true);
set local role authenticated;
select is((select count(*) from point_history where id=-4101),0::bigint,
  'inactive authenticated officer cannot read Point History through the view');
reset role;

select * from finish();
rollback;
