-- Populated Task rows immediately before the Task/Officer completion transition.
insert into public.tasks
  (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (90790,'Upgrade standalone Task','Preserve standalone details','Airtable',1,'2099-11-02',4,true,90001);
insert into public.task_assignments
  (task_id,officer_id,assigned_by,assigned_at,completed_at,approved_at,approved_by)
values
  (90790,90001,90001,'2026-09-19 12:00:00+00','2026-09-20 12:00:00+00',
    '2026-09-21 12:00:00+00',90001);
insert into public.point_transactions
  (id,officer_id,task_id,points,reason,award_type,created_by,created_by_officer_id,created_at)
values
  (90790,90001,90790,4,'Upgrade standalone Task award','task',
    '20000000-0000-0000-0000-000000000001',90001,'2026-09-22 12:00:00+00');

create table upgrade_fixture.pre_task_standalone as
  select to_jsonb(t) as row from public.tasks t where id=90790;
create table upgrade_fixture.pre_task_assignment as
  select to_jsonb(a) as row from public.task_assignments a where task_id=90790;
create table upgrade_fixture.pre_task_award as
  select to_jsonb(p) as row from public.point_transactions p where id=90790;
