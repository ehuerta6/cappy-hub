-- Synthetic existing recurrence rows immediately before the scope migration.
insert into public.event_series(id,request_key,recurrence_rule,created_by)
 values(90680,'20000000-0000-4000-8000-000000000068','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',90001);
insert into public.events(id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,recurrence_series_id,recurrence_key)
 values
 (90680,'Upgrade recurring Event','Existing details',(select id from public.event_types where name='Meeting'),'Campus','2099-10-01','2099-10-01 10:00-06','2099-10-01 11:00-06','cancelled',90680,'2099-10-01'),
 (90681,'Upgrade recurring Event','Existing details',(select id from public.event_types where name='Meeting'),'Campus','2099-10-02','2099-10-02 10:00-06','2099-10-02 11:00-06','upcoming',90680,'2099-10-02');
insert into public.event_officers values(90680,90001);
insert into public.task_series(id,request_key,recurrence_rule,created_by)
 values(90680,'20000000-0000-4000-8000-000000000069','RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',90001);
insert into public.tasks(id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,recurrence_series_id,recurrence_key)
 values
 (90680,'Upgrade recurring Task','Existing details','Post',1,'2099-10-01',3,true,90001,90680,'2099-10-01'),
 (90681,'Upgrade recurring Task','Existing details','Post',1,'2099-10-02',3,true,90001,90680,'2099-10-02');
insert into public.task_assignments(task_id,officer_id,assigned_by,completed_at,approved_at,approved_by)
 values(90680,90001,90001,'2026-09-20 12:00Z','2026-09-20 13:00Z',90001);
insert into public.point_transactions(id,officer_id,task_id,points,reason,award_type)
 values(90680,90001,90680,3,'Existing recurring Task award','task');
create table upgrade_fixture.recurring_events as select to_jsonb(e) as row from public.events e where id in (90680,90681);
create table upgrade_fixture.recurring_tasks as select to_jsonb(t) as row from public.tasks t where id in (90680,90681);
create table upgrade_fixture.recurring_assignment as select to_jsonb(a) as row from public.task_assignments a where task_id=90680;
create table upgrade_fixture.recurring_award as select to_jsonb(p) as row from public.point_transactions p where id=90680;
