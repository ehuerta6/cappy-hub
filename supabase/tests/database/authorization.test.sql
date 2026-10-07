begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();


insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000301','admin-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000302','lead-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000303','officer-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000304','admin2-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000305','president-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000306','multi-lead-pr3@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
 (-301,'Admin PR3','admin-pr3@example.org',17::bigint,'admin','00000000-0000-4000-8000-000000000301'),
 (-302,'Lead PR3','lead-pr3@example.org',16::bigint,'officer','00000000-0000-4000-8000-000000000302'),
 (-303,'Officer PR3','officer-pr3@example.org',17::bigint,'officer','00000000-0000-4000-8000-000000000303'),
 (-304,'Admin Two PR3','admin2-pr3@example.org',1::bigint,'admin','00000000-0000-4000-8000-000000000304'),
 (-305,'President PR3','president-pr3@example.org',(select id from positions where name='President'),'officer','00000000-0000-4000-8000-000000000305'),
 (-306,'Multi Lead PR3','multi-lead-pr3@example.org',16::bigint,'officer','00000000-0000-4000-8000-000000000306');
insert into officer_branches(officer_id,branch_id)
 select -302,id from branches where name='intro';
insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
 (-301,'Global PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-302,'Intro PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-303,'ICPC PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-304,'Past PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2020-09-20 09:00-06','2020-09-20 10:00-06'),
 (-305,'Future signup PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-21 09:00-06','2099-09-21 10:00-06'),
 (-306,'Intro ICPC PR3','Test event','TBA',(select id from event_types where name='Meeting'),'2099-09-22 09:00-06','2099-09-22 10:00-06');
insert into event_branches(event_id,branch_id)
 select -302,id from branches where name='intro'
 union all select -303,id from branches where name='icpc'
 union all select -303,id from branches where name='social'
 union all select -306,id from branches where name in ('intro','icpc');
insert into officer_branches(officer_id,branch_id)
 select -306,id from branches where name in ('intro','social');
insert into event_officers(event_id,officer_id) values (-304,-303),(-305,-303);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
set local role authenticated;
select lives_ok($$select save_officer('Created PR3',17::bigint,'active',null,null,'created-pr3@example.org')$$,
 'admin can create an officer');
select lives_ok($$select save_officer('Edited PR3',17::bigint,'active',null,-303,'officer-pr3@example.org')$$,
 'admin can edit officer');
select lives_ok($$select save_event_with_links('Admin global','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22'::date,'2099-09-22 09:00-06','2099-09-22 10:00-06',null,null,null,null)$$,
 'admin can create global event');
select lives_ok($$select save_event_with_links('Admin branch','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22'::date,'2099-09-22 09:00-06','2099-09-22 10:00-06',array[3::bigint],null,null,null)$$,
 'admin can create branch event');
select lives_ok($$select save_event_with_links('Admin global edit','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20'::date,'2099-09-20 09:00-06','2099-09-20 10:00-06',null,-301,null,null)$$,
 'admin can edit global event');
select lives_ok($$select change_event_signup(-301,-302,false)$$,'admin can assign another officer to global event');
select lives_ok($$select change_event_signup(-301,-302,true)$$,'admin can remove another officer from global event');
select lives_ok($$select add_manual_transaction(-303,1,'Correction PR3','correction')$$,
 'admin can create a correction');
select lives_ok($$select set_officer_application_role(-303,'admin')$$,'admin can promote officer');
select lives_ok($$select set_officer_application_role(-304,'officer')$$,'admin can demote another admin');
select lives_ok($$select set_officer_application_role(-303,'officer')$$,'admin can demote another admin');
select throws_ok($$select save_officer('No active admin',17::bigint,'inactive',null,-301,'admin-pr3@example.org')$$,
 'P0001','Last active admin cannot be deactivated','last active admin cannot be deactivated');
select lives_ok($$select cancel_event(-301)$$,'admin can cancel global event');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
select throws_ok($$select save_officer('No',17::bigint,'active',null,null,'no-pr3@example.org')$$,
 'P0001','Admin required','normal officer cannot create officer');
select throws_ok($$select save_event_with_links('No','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22'::date,'2099-09-22 09:00-06','2099-09-22 10:00-06',null,null,null,null)$$,
 'P0001','Event outside branch scope','normal officer cannot create events');
select lives_ok($$select change_event_signup(-302,-303,false)$$,'normal officer can self-signup');
select lives_ok($$select change_event_signup(-302,-303,true)$$,'normal officer can self-signout');
select throws_ok($$select change_event_signup(-302,-301,false)$$,'P0001','Cannot manage another officer signup for this event',
 'normal officer cannot assign another officer');
select throws_ok($$select add_manual_transaction(-303,1,'No','manual')$$,'P0001','Admin required',
 'normal officer cannot create manual points');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
select lives_ok($$select save_event_with_links('Lead shared','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22'::date,'2099-09-22 09:00-06','2099-09-22 10:00-06',array[(select id from branches where name='intro'),(select id from branches where name='icpc')],null,null)$$,
 'Lead can create a multi-branch Event with an overlapping branch');
select throws_ok($$select save_event_with_links('Lead global','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-22'::date,'2099-09-22 09:00-06','2099-09-22 10:00-06',null,null,null,null)$$,
 'P0001','Event outside branch scope','Lead cannot create global event');
select lives_ok($$select save_event_with_links('Lead edit','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20'::date,'2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-302,null,null)$$,
 'Lead may edit currently managed event');
select throws_ok($$select save_event_with_links('Lead takeover','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20'::date,'2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-303,null,null)$$,
 'P0001','Event outside branch scope','Lead cannot take unrelated event by replacing branches');
select throws_ok($$select save_event_with_links('Lead global takeover','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20'::date,'2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-301,null,null)$$,
 'P0001','Event outside branch scope','Lead cannot take global event by adding own branch');
select throws_ok($$select save_event_with_links('Lead makes global','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20'::date,'2099-09-20 09:00-06','2099-09-20 10:00-06',null,-302,null,null)$$,
 'P0001','Event outside branch scope','Lead cannot convert managed event to global');
select lives_ok($$select change_event_signup(-302,-301,false)$$,'Lead can assign another officer on managed event');
select lives_ok($$select change_event_signup(-302,-301,true)$$,'Lead can remove another officer on managed event');
select lives_ok($$select change_event_signup(-306,-301,false)$$,'Lead can manage participation on multi-branch Event with overlap');
select throws_ok($$select change_event_signup(-303,-301,false)$$,'P0001','Cannot manage another officer signup for this event',
 'Lead cannot manage unrelated event signups');
select lives_ok($$select change_event_signup(-305,-302,false)$$,'Lead can self-signup to global event');
select lives_ok($$select cancel_event(-302)$$,'Lead can cancel managed event');
select throws_ok($$select change_event_signup(-302,-302,false)$$,'P0001','Signups are closed for this event',
 'signup remains closed after cancellation');
select throws_ok($$select change_event_signup(-304,-302,false)$$,'P0001','Signups are closed for this event',
 'signup remains closed after scheduled end');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
select lives_ok($$select change_event_signup(-303,-301,false)$$,
 'Lead with multiple branches manages Event when one branch overlaps');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
select lives_ok($$select save_event_with_links('President global','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-23'::date,'2099-09-23 09:00-06','2099-09-23 10:00-06',null,null,null,null)$$,
 'Event executive can create global Event');

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
set local role authenticated;
select lives_ok($$select save_officer('Deactivated PR3',17::bigint,'inactive',null,-303,'officer-pr3@example.org')$$,
 'admin can deactivate officer');
reset role;
select is((select count(*) from event_officers where event_id=-305 and officer_id=-303),0::bigint,
 'deactivation removes future signups');
select is((select count(*) from event_officers where event_id=-304 and officer_id=-303),1::bigint,
 'deactivation preserves past participation');
set local role authenticated;
select lives_ok($$select save_officer('Reactivated PR3',17::bigint,'active',null,-303,'officer-pr3@example.org')$$,
 'admin can reactivate officer');
select * from finish();
rollback;
