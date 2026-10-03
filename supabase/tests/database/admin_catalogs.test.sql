begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000601','admin-pr6@example.org'),
 ('00000000-0000-4000-8000-000000000602','officer-pr6@example.org'),
 ('00000000-0000-4000-8000-000000000603','lead-pr6@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
 (-601,'Admin PR6','admin-pr6@example.org',(select id from positions where name='President'),'admin','00000000-0000-4000-8000-000000000601'),
 (-602,'Officer PR6','officer-pr6@example.org',(select id from positions where name='Officer'),'officer','00000000-0000-4000-8000-000000000602'),
 (-603,'Lead PR6','lead-pr6@example.org',(select id from positions where name='Lead'),'officer','00000000-0000-4000-8000-000000000603');


select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000602',true);
set local role authenticated;
select throws_ok($$select create_position('Unauthorized')$$,'P0001','Admin required','ordinary officer cannot create position');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000603',true);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
select lives_ok($$select create_position('  Mentor  ')$$,'admin creates a custom position');
select throws_ok($$select rename_position((select id from positions where name='Lead'),'Other')$$,
 'P0001','Required positions cannot be renamed','canonical Lead cannot be renamed');
select throws_ok($$select delete_position((select id from positions where name='Lead'))$$,
 'P0001','Required positions cannot be deleted','canonical Lead cannot be deleted');
select lives_ok($$select rename_position((select id from positions where name='Mentor'),'Senior Mentor')$$,
 'admin renames position');
select throws_ok($$select rename_position((select id from positions where name='Senior Mentor'),'  OFFICER  ')$$,
 '23505',null,'position rename rejects normalized duplicates');
select lives_ok($$select delete_position((select id from positions where name='Senior Mentor'))$$,
 'admin deletes unused custom position');

select lives_ok($$select create_branch('  research  ')$$,'admin creates branch');
select throws_ok($$select create_branch('  RESEARCH  ')$$,'23505',null,
 'branch creation rejects normalized duplicates');
select throws_ok($$select create_branch(E'\t intro \t')$$,'23505',null,
 'branch creation rejects tab-padded normalized duplicates');
select lives_ok($$select rename_branch((select id from branches where name='research'),'research-new')$$,
 'admin renames branch');
select throws_ok($$select rename_branch((select id from branches where name='research-new'),'  InTro  ')$$,
 '23505',null,'branch rename rejects normalized duplicates');
select throws_ok($$select create_position('  LEAD  ')$$,'23505',null,
 'position creation cannot duplicate a required position');
select lives_ok($$select delete_branch((select id from branches where name='research-new'))$$,
 'admin deletes unused branch');

select throws_ok($$select create_event_type('Seminar')$$,
 '42501',null,'event type catalog is fixed');
select throws_ok($$select rename_event_type((select id from event_types where name='Workshop'),'Workshop New')$$,
 '42501',null,'allowed event types cannot be renamed');
select throws_ok($$select delete_event_type((select id from event_types where name='Workshop'))$$,
 '42501',null,'allowed event types cannot be deleted');
select is((select count(*) from audit_logs where action in ('position.created','position.renamed','position.deleted')),
 3::bigint,'position create, rename and delete audited once each');

reset role;
insert into positions(name) values('Historian');
update officers set position_id=(select id from positions where name='Historian') where id=-602;
insert into branches(name) values('officer-reference'),('event-reference');
insert into branches(name) values('task-reference');
insert into officer_branches(officer_id,branch_id)
 values(-602,(select id from branches where name='officer-reference'));
insert into events(id,name,description,location,event_type_id,starts_at,ends_at)
 values(-601,'PR6 event','Test event','TBA',(select id from event_types where name='Workshop'),
 '2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id)
 values(-601,(select id from branches where name='event-reference'));
insert into tasks(title,description,task_type,branch_id,due_date,points,created_by)
 values('Branch dependency fixture','Keep branch attached to task','Flyer',
   (select id from branches where name='task-reference'),'2099-09-20',1,-601);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
set local role authenticated;
select lives_ok($$select rename_position((select id from positions where name='Historian'),'Club Historian')$$,
 'referenced position can be renamed');
select throws_ok($$select delete_position((select id from positions where name='Club Historian'))$$,
 'P0001','This position cannot be deleted because officers are using it','referenced position cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='officer-reference'),'officer-renamed')$$,
 'membership branch can be renamed');
select throws_ok($$select delete_branch((select id from branches where name='officer-renamed'))$$,
 'P0001','This branch cannot be deleted because dependent records are using it','membership branch cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='event-reference'),'event-renamed')$$,
 'event branch can be renamed');
select throws_ok($$select delete_branch((select id from branches where name='event-renamed'))$$,
 'P0001','This branch cannot be deleted because dependent records are using it','event branch cannot be deleted');
select throws_ok($$select delete_branch((select id from branches where name='task-reference'))$$,
 'P0001','This branch cannot be deleted because dependent records are using it','Task branch cannot be deleted');
select * from finish();
rollback;
