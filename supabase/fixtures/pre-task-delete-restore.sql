-- The Task lifecycle migration changes trusted functions only; preserve the
-- full synthetic Task, assignment, Point, and audit predecessor state.
create table upgrade_fixture.pre_task_delete_restore_tasks as
 select id,to_jsonb(t) original from public.tasks t;
create table upgrade_fixture.pre_task_delete_restore_assignments as
 select task_id,officer_id,to_jsonb(a) original from public.task_officer_assignments a;
create table upgrade_fixture.pre_task_delete_restore_points as
 select id,to_jsonb(p) original from public.point_transactions p;
create table upgrade_fixture.pre_task_delete_restore_audit as
 select id,to_jsonb(a) original from public.audit_logs a;
