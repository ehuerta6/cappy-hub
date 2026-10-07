-- Snapshot historical rows immediately before the legacy assignment contract.
create table upgrade_fixture.pre_task_contract_assignment as
  select to_jsonb(a) as row from public.task_assignments a where task_id=90790;
create table upgrade_fixture.pre_task_contract_award as
  select to_jsonb(p) as row from public.point_transactions p where id=90790;

insert into public.audit_logs(actor_id,action,entity_type,entity_id,details,created_at)
values ('20000000-0000-0000-0000-000000000001','task.completion_changed','task','90790',
  '{"task_id":90790,"officer_id":90001,"before":{"status":"Not completed"},"after":{"status":"Completed"}}',
  '2026-09-20 12:30:00+00');
create table upgrade_fixture.pre_task_contract_audit as
  select to_jsonb(a) as row from public.audit_logs a
  where entity_type='task' and entity_id='90790' and action='task.completion_changed';

-- Exercise recovery of a valid projection row missing from the canonical
-- relation, as can happen after historical migration or manual drift.
delete from public.task_officer_assignments where task_id=90790 and officer_id=90001;
