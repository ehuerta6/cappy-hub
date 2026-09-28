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

select ok(not has_table_privilege('authenticated','public.positions','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.branches','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.event_types','INSERT,UPDATE,DELETE'),
  'authenticated role has no raw catalog writes');
select ok(not has_function_privilege('anon','public.create_position(text)','EXECUTE')
  and not has_function_privilege('anon','public.create_branch(text)','EXECUTE')
  and not has_function_privilege('anon','public.create_event_type(text)','EXECUTE'),
  'anonymous role cannot call catalog RPCs');
select ok(not has_function_privilege('authenticated','private.required_position(text)','EXECUTE'),
  'internal required-position helper has no client grant');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000602',true);
set local role authenticated;
select throws_ok($$select create_position('Unauthorized')$$,'P0001','Admin required','ordinary officer cannot create position');
select throws_ok($$select rename_branch((select id from branches where name='intro'),'bad')$$,'P0001','Admin required','ordinary officer cannot rename branch');
select throws_ok($$select delete_event_type((select id from event_types where name='Workshop'))$$,'P0001','Admin required','ordinary officer cannot delete event type');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000603',true);
select throws_ok($$select create_branch('Unauthorized')$$,'P0001','Admin required','Lead cannot create branch');
select throws_ok($$select rename_event_type((select id from event_types where name='Workshop'),'bad')$$,'P0001','Admin required','Lead cannot rename type');
select throws_ok($$select delete_position((select id from positions where name='Officer'))$$,'P0001','Admin required','Lead cannot delete position');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
select lives_ok($$select create_position('  Mentor  ')$$,'admin creates a custom position');
select is((select count(*) from positions where name='Mentor'),1::bigint,'position name is trimmed');
select throws_ok($$select create_position('  ')$$,'P0001','Position name is required','blank position rejected');
select throws_ok($$select create_position('Mentor')$$,'23505',null,'duplicate position rejected');
select throws_ok($$select rename_position((select id from positions where name='Lead'),'Other')$$,
 'P0001','Required positions cannot be renamed','canonical Lead cannot be renamed');
select throws_ok($$select delete_position((select id from positions where name='Lead'))$$,
 'P0001','Required positions cannot be deleted','canonical Lead cannot be deleted');
select throws_ok($$select delete_position((select id from positions where name='President'))$$,
 'P0001','Required positions cannot be deleted','other required positions cannot be deleted');
select lives_ok($$select rename_position((select id from positions where name='Mentor'),'Senior Mentor')$$,
 'admin renames position');
select lives_ok($$select delete_position((select id from positions where name='Senior Mentor'))$$,
 'admin deletes unused custom position');

select lives_ok($$select create_branch('  research  ')$$,'admin creates branch');
select is((select count(*) from branches where name='research'),1::bigint,'branch name is trimmed');
select throws_ok($$select create_branch('  ')$$,'P0001','Branch name is required','blank branch rejected');
select throws_ok($$select create_branch('research')$$,'23505',null,'duplicate branch rejected');
select lives_ok($$select rename_branch((select id from branches where name='research'),'research-new')$$,
 'admin renames branch');
select lives_ok($$select delete_branch((select id from branches where name='research-new'))$$,
 'admin deletes unused branch');

select lives_ok($$select create_event_type('  Seminar  ')$$,'admin creates event type');
select is((select count(*) from event_types where name='Seminar'),1::bigint,'event type name is trimmed');
select throws_ok($$select create_event_type('  ')$$,'P0001','Event type name is required','blank event type rejected');
select throws_ok($$select create_event_type('seminar')$$,'23505',null,'event type duplicate is case-insensitive');
select lives_ok($$select rename_event_type((select id from event_types where name='Seminar'),'Colloquium')$$,
 'admin renames event type');
select lives_ok($$select delete_event_type((select id from event_types where name='Colloquium'))$$,
 'admin deletes unused event type');

select is((select count(*) from audit_logs where action in ('position.created','position.renamed','position.deleted')),
 3::bigint,'position create, rename and delete audited once each');
select is((select count(*) from audit_logs where action in ('branch.created','branch.renamed','branch.deleted')),
 3::bigint,'branch create, rename and delete audited once each');
select is((select count(*) from audit_logs where action in ('event_type.created','event_type.renamed','event_type.deleted')),
 3::bigint,'event type create, rename and delete audited once each');
select is((select count(*) from audit_logs where action in (
 'position.created','position.renamed','position.deleted',
 'branch.created','branch.renamed','branch.deleted',
 'event_type.created','event_type.renamed','event_type.deleted')
 and actor_id='00000000-0000-4000-8000-000000000601'::uuid),
 9::bigint,'catalog audit actor is authenticated admin');
select is((select details ->> 'old_name' from audit_logs where action='position.renamed'),
 'Mentor','position rename keeps old name');
select is((select details ->> 'new_name' from audit_logs where action='position.renamed'),
 'Senior Mentor','position rename keeps new name');
select is((select details ->> 'name' from audit_logs where action='event_type.deleted'),
 'Colloquium','deletion retains final name snapshot');
select ok((select entity_id from audit_logs where action='branch.created') ~ '^[0-9]+$',
 'creation audit identifies the created row');

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
select is((select p.name from officers o join positions p on p.id=o.position_id where o.id=-602),
 'Club Historian','officer still references renamed position ID');
select throws_ok($$select delete_position((select id from positions where name='Club Historian'))$$,
 'P0001','This position cannot be deleted because officers are using it','referenced position cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='officer-reference'),'officer-renamed')$$,
 'membership branch can be renamed');
select is((select b.name from officer_branches ob join branches b on b.id=ob.branch_id where ob.officer_id=-602),
 'officer-renamed','membership retains branch ID');
select throws_ok($$select delete_branch((select id from branches where name='officer-renamed'))$$,
 'P0001','This branch cannot be deleted because officers or events are using it','membership branch cannot be deleted');
select lives_ok($$select rename_branch((select id from branches where name='event-reference'),'event-renamed')$$,
 'event branch can be renamed');
select is((select b.name from event_branches eb join branches b on b.id=eb.branch_id where eb.event_id=-601),
 'event-renamed','event association retains branch ID');
select throws_ok($$select delete_branch((select id from branches where name='event-renamed'))$$,
 'P0001','This branch cannot be deleted because officers or events are using it','event branch cannot be deleted');
select lives_ok($$select rename_event_type((select id from event_types where name='Workshop'),'Workshop New')$$,
 'referenced event type can be renamed');
select is((select t.name from events e join event_types t on t.id=e.event_type_id where e.id=-601),
 'Workshop New','event retains renamed type ID');
select throws_ok($$select delete_event_type((select id from event_types where name='Workshop New'))$$,
 'P0001','This event type cannot be deleted because events are using it','referenced type cannot be deleted');
select is((select count(*) from audit_logs where action in ('position.deleted','branch.deleted','event_type.deleted')),
 3::bigint,'failed deletions add no success audit rows');
select * from finish();
rollback;
