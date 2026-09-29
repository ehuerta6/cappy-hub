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
select lives_ok($$select delete_position((select id from positions where name='Senior Mentor'))$$,
 'admin deletes unused custom position');

select lives_ok($$select create_branch('  research  ')$$,'admin creates branch');
select lives_ok($$select rename_branch((select id from branches where name='research'),'research-new')$$,
 'admin renames branch');
select lives_ok($$select delete_branch((select id from branches where name='research-new'))$$,
 'admin deletes unused branch');

select lives_ok($$select create_event_type('  Seminar  ')$$,'admin creates event type');
select lives_ok($$select rename_event_type((select id from event_types where name='Seminar'),'Colloquium')$$,
 'admin renames event type');
select lives_ok($$select delete_event_type((select id from event_types where name='Colloquium'))$$,
 'admin deletes unused event type');

select is((select count(*) from audit_logs where action in ('position.created','position.renamed','position.deleted')),
 3::bigint,'position create, rename and delete audited once each');
select is((select details ->> 'name' from audit_logs where action='event_type.deleted'),
 'Colloquium','deletion retains final name snapshot');

reset role;
insert into positions(name) values('Historian');
update officers set position_id=(select id from positions where name='Historian') where id=-602;
insert into branches(name) values('officer-reference'),('event-reference');
insert into officer_branches(officer_id,branch_id)
 values(-602,(select id from branches where name='officer-reference'));
insert into events(id,name,event_type_id,starts_at,ends_at)
 values(-601,'PR6 event',(select id from event_types where name='Workshop'),
 '2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id)
 values(-601,(select id from branches where name='event-reference'));

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
set local role authenticated;
select lives_ok($$select rename_position((select id from positions where name='Historian'),'Club Historian')$$,
 'referenced position can be renamed');
select throws_ok($$select delete_position((select id from positions where name='Club Historian'))$$,
 'P0001','This position cannot be deleted because officers are using it','referenced position cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='officer-reference'),'officer-renamed')$$,
 'membership branch can be renamed');
select throws_ok($$select delete_branch((select id from branches where name='officer-renamed'))$$,
 'P0001','This branch cannot be deleted because officers or events are using it','membership branch cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='event-reference'),'event-renamed')$$,
 'event branch can be renamed');
select throws_ok($$select delete_branch((select id from branches where name='event-renamed'))$$,
 'P0001','This branch cannot be deleted because officers or events are using it','event branch cannot be deleted');
select lives_ok($$select rename_event_type((select id from event_types where name='Workshop'),'Workshop New')$$,
 'referenced event type can be renamed');
select throws_ok($$select delete_event_type((select id from event_types where name='Workshop New'))$$,
 'P0001','This event type cannot be deleted because events are using it','referenced type cannot be deleted');
select * from finish();
rollback;
