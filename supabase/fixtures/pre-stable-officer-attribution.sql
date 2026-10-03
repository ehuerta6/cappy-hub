-- Historical UUID actors immediately before the stable Officer ID expansion.
insert into auth.users(id,email) values
  ('20000000-0000-0000-0000-000000009101','history-actor@example.org'),
  ('20000000-0000-0000-0000-000000009102','history-relinked@example.org'),
  ('20000000-0000-0000-0000-000000009103','history-unmapped@example.org'),
  ('20000000-0000-0000-0000-000000009104','history-admin@example.org');

insert into public.officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
  (91001,'Historical Actor','history-actor@example.org',
    (select id from public.positions where name='President'),'officer','active',
    '20000000-0000-0000-0000-000000009101'),
  (91002,'Historical Warning Target','history-target@example.org',
    (select id from public.positions where name='Officer'),'officer','active',null),
  (91004,'Historical Admin','history-admin@example.org',
    (select id from public.positions where name='Officer'),'admin','active',
    '20000000-0000-0000-0000-000000009104');

insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,
  status,deleted_at,deleted_by)
values (91001,'Historical deleted event','Historical record','TBA',
  (select id from public.event_types where name='Meeting'),'2026-09-20',
  '2026-09-20 09:00-06','2026-09-20 10:00-06','cancelled',
  '2026-09-21 12:00:00+00','20000000-0000-0000-0000-000000009101');

insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,
  created_by,updated_at,updated_by,removed_at,removed_by)
values (91001,91002,91001,2,'Historical actor attribution','manual',
  '20000000-0000-0000-0000-000000009101','2026-09-22 12:00:00+00',
  '20000000-0000-0000-0000-000000009101','2026-09-23 12:00:00+00',
  '20000000-0000-0000-0000-000000009101'),
  (91002,91002,null,1,'Unmapped historical actor','manual',
   '20000000-0000-0000-0000-000000009103',null,null,null,null);

insert into public.officer_warnings(id,officer_id,reason)
values (91001,91002,'Historical warning approval attribution');
insert into public.warning_approvals(warning_id,approver_id,approver_role)
values (91001,'20000000-0000-0000-0000-000000009101','President');

insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,details)
values (91001,'20000000-0000-0000-0000-000000009101',
  'history.actor_fixture','officer','91002','{}'::jsonb),
  (91002,'20000000-0000-0000-0000-000000009103',
  'history.unmapped_fixture','officer','91002','{}'::jsonb);

create table upgrade_fixture.stable_actor_expectations as
select 91001::bigint as officer_id,
  '20000000-0000-0000-0000-000000009101'::uuid as old_auth_user_id,
  '20000000-0000-0000-0000-000000009102'::uuid as new_auth_user_id,
  '20000000-0000-0000-0000-000000009103'::uuid as unmapped_auth_user_id;
