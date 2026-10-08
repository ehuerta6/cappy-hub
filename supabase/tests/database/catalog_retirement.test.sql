begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000851','catalog-retirement-admin@example.org'),
  ('00000000-0000-4000-8000-000000000852','catalog-retirement-officer@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id)
values
  (-851,'Catalog Retirement Admin','catalog-retirement-admin@example.org',
    (select id from positions where code='president'),'admin','00000000-0000-4000-8000-000000000851'),
  (-852,'Catalog Retirement Officer','catalog-retirement-officer@example.org',
    (select id from positions where code='officer'),'officer','00000000-0000-4000-8000-000000000852');
insert into branches(id,name) values(-851,'Catalog retirement branch'),(-852,'Second active branch');
insert into officer_branches(officer_id,branch_id) values(-852,-851);
insert into events(id,name,description,event_type_id,location,event_date,starts_at,ends_at)
values(-851,'Retirement history Event','Historical branch reference',
  (select id from event_types where name='Meeting'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id) values(-851,-851);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
values(-851,'Retirement history Task','Historical branch reference','Flyer',-851,'2099-09-20',1,-851);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000851',true);
set local role authenticated;
select lives_ok($$select create_position('Archivist')$$,'Admin creates a custom Position');
reset role;
update officers set position_id=(select id from positions where name='Archivist') where id=-852;
set local role authenticated;
select lives_ok($$select set_branch_active(-851,false)$$,'Admin can retire a Branch');
select is((select is_active from branches where id=-851),false,'retirement keeps the Branch row and ID');
select is((select branch_id from officer_branches where officer_id=-852),-851::bigint,
  'retirement preserves the existing Officer relationship');
select is((select branch_id from event_branches where event_id=-851),-851::bigint,
  'retirement preserves the existing Event relationship');
select is((select branch_id from tasks where id=-851),-851::bigint,
  'retirement preserves the existing Task relationship');
select throws_ok($$select save_event_with_signup_sheet('New Event','Retired Branch',
  (select id from event_types where name='Meeting'),'TBA','2099-09-21',
  '2099-09-21 09:00-06','2099-09-21 10:00-06',array[-851]::bigint[],'',null,null,null)$$,
  'P0001','Invalid or retired branch','a retired Branch cannot be added to a new Event');
select throws_ok($$select save_task('New Task','Retired Branch','Flyer',-851,
  '2099-09-21',1,false)$$,'P0001','Invalid or retired branch',
  'a retired Branch cannot be assigned to a new Task');
select lives_ok($$select save_event_with_signup_sheet('Updated historical Event',
  'Unrelated Event edit',(select event_type_id from events where id=-851),'TBA',
  '2099-09-20','2099-09-20 09:00-06','2099-09-20 10:00-06',array[-851]::bigint[],'',
  -851,null,null)$$,
  'an Event edit can retain its existing retired Branch relationship');
select lives_ok($$select update_task_details(-851,'Updated historical Task',
  'Unrelated Task edit','Flyer',-851,'2099-09-20',1)$$,
  'a Task edit can retain its existing retired Branch relationship');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000852',true);
select throws_ok($$select set_branch_active(-851,false)$$,'P0001','Admin required',
  'a non-Admin cannot retire a Branch');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000851',true);
select lives_ok($$select save_officer('Catalog Retirement Officer Edited',
  (select id from positions where name='Archivist'),'active',array[-851]::bigint[],-852,
  'catalog-retirement-officer@example.org',null,null)$$,
  'unrelated Officer edits may retain a retired Branch');
select throws_ok($$select save_officer('New Catalog Officer',
  (select id from positions where code='officer'),'active',array[-851]::bigint[],null,
  'new-catalog-officer@example.org',null,null)$$,'P0001','Invalid or retired branch',
  'a retired Branch cannot be assigned to a new Officer');

select lives_ok($$select set_position_active(
  (select id from positions where name='Archivist'),false)$$,
  'Admin can retire a custom Position');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000852',true);
select throws_ok($$select set_position_active(
  (select id from positions where name='Archivist'),true)$$,'P0001','Admin required',
  'a non-Admin cannot reactivate a Position');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000851',true);
select throws_ok($$select set_position_active((select id from positions where code='officer'),false)$$,
  'P0001','Required positions cannot be retired','system Position remains protected');
select throws_ok($$select save_officer('New Position Officer',
  (select id from positions where name='Archivist'),'active','{}'::bigint[],null,
  'new-position-officer@example.org',null,null)$$,'P0001','Invalid or retired position',
  'a retired custom Position cannot be assigned to a new Officer');
select lives_ok($$select save_officer('Catalog Retirement Officer Edited',
  (select id from positions where name='Archivist'),'active',array[-851]::bigint[],-852,
  'catalog-retirement-officer@example.org',null,null)$$,
  'existing Officer may retain their retired Position while editing');
select lives_ok($$select set_position_active(
  (select id from positions where name='Archivist'),true)$$,
  'Admin can reactivate a custom Position');
select lives_ok($$select set_branch_active(-851,true)$$,'Admin can reactivate a Branch');

reset role;
select is((select count(*) from audit_logs where action in
  ('branch.retired','branch.reactivated','position.retired','position.reactivated')),
  4::bigint,'each catalog lifecycle transition is audited');
select * from finish();
rollback;
