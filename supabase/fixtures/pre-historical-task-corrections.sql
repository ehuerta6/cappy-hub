-- Synthetic historical rows were loaded by the existing upgrade fixtures.
-- Capture the complete predecessor state; no production data or intent backfill.
create table upgrade_fixture.pre_task_corrections_tasks as
 select id,to_jsonb(t) original from public.tasks t;
create table upgrade_fixture.pre_task_corrections_assignments as
 select task_id,officer_id,to_jsonb(a) original from public.task_officer_assignments a;
create table upgrade_fixture.pre_task_corrections_points as
 select id,to_jsonb(p) original from public.point_transactions p;
create table upgrade_fixture.pre_task_corrections_audit as
 select id,to_jsonb(a) original from public.audit_logs a;
