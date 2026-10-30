-- Existing Task type text and its related history must survive catalog setup.
insert into public.tasks
  (id, title, description, task_type, branch_id, due_date, points, created_by)
values
  (92347, 'Task Type upgrade fixture', 'Keep its historical type', 'Post', 1,
    date '2099-09-23', 2, 90001);
create table upgrade_fixture.pre_task_type_catalog_task as
  select id, task_type, title, branch_id, due_date, points, created_by
  from public.tasks where id = 92347;
