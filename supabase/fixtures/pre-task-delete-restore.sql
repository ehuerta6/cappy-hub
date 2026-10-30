-- Synthetic history exercises post-upgrade award recovery and independent
-- removal preservation. Snapshot all Task, assignment, Point, and audit state.
insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (90801,'Upgrade awarded Task','Exercise post-upgrade recovery','Post',1,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date-1,5,false,90001),
  (90802,'Upgrade independently removed Task','Keep independent removal intent','Post',1,
    (pg_catalog.statement_timestamp() at time zone 'America/Denver')::date-1,3,false,90001);
insert into public.task_officer_assignments(task_id,officer_id,assigned_by,completed_at)
values
  (90801,90002,90001,pg_catalog.statement_timestamp()-interval '2 days'),
  (90802,90002,90001,pg_catalog.statement_timestamp()-interval '1 day');
insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by,removed_at,removed_by)
values
  (90002,90801,5,'Task completion: Upgrade awarded Task','task',
    '20000000-0000-0000-0000-000000000001',null,null),
  (90002,90802,3,'Task completion: Upgrade independently removed Task','task',
    '20000000-0000-0000-0000-000000000001',pg_catalog.statement_timestamp()-interval '1 hour',
    '20000000-0000-0000-0000-000000000001');
create table upgrade_fixture.pre_task_delete_restore_tasks as
 select id,to_jsonb(t) original from public.tasks t;
create table upgrade_fixture.pre_task_delete_restore_assignments as
 select task_id,officer_id,to_jsonb(a) original from public.task_officer_assignments a;
create table upgrade_fixture.pre_task_delete_restore_points as
 select id,to_jsonb(p) original from public.point_transactions p;
create table upgrade_fixture.pre_task_delete_restore_audit as
 select id,to_jsonb(a) original from public.audit_logs a;
