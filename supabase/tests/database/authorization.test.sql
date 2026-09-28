begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('anon','public.save_officer(text,bigint,text,bigint[],bigint,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)','EXECUTE')
  and not has_function_privilege('anon','public.change_event_signup(bigint,bigint,boolean)','EXECUTE')
  and not has_function_privilege('anon','public.cancel_event(bigint)','EXECUTE')
  and not has_function_privilege('anon','public.add_manual_transaction(bigint,numeric,text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.process_completed_events(numeric)','EXECUTE'),
  'anonymous role cannot execute protected mutation RPCs or prototype processor');
select ok(not has_function_privilege('authenticated','public.process_completed_events(numeric)','EXECUTE'),
  'page loads cannot execute the prototype participation processor');
select ok(not has_function_privilege('anon','private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint)','EXECUTE'),
  'anonymous role cannot execute private implementation');

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000301','admin-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000302','lead-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000303','officer-pr3@example.org'),
 ('00000000-0000-4000-8000-000000000304','admin2-pr3@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
 (-301,'Admin PR3','admin-pr3@example.org',17::bigint,'admin','00000000-0000-4000-8000-000000000301'),
 (-302,'Lead PR3','lead-pr3@example.org',16::bigint,'officer','00000000-0000-4000-8000-000000000302'),
 (-303,'Officer PR3','officer-pr3@example.org',17::bigint,'officer','00000000-0000-4000-8000-000000000303'),
 (-304,'Admin Two PR3','admin2-pr3@example.org',1::bigint,'admin','00000000-0000-4000-8000-000000000304');
insert into officer_branches(officer_id,branch_id)
 select -302,id from branches where name='intro';
insert into events(id,name,event_type_id,starts_at,ends_at) values
 (-301,'Global PR3',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-302,'Intro PR3',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-303,'ICPC PR3',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06'),
 (-304,'Past PR3',(select id from event_types where name='General'),'2020-09-20 09:00-06','2020-09-20 10:00-06'),
 (-305,'Future signup PR3',(select id from event_types where name='General'),'2099-09-21 09:00-06','2099-09-21 10:00-06');
insert into event_branches(event_id,branch_id)
 select -302,id from branches where name='intro'
 union all select -303,id from branches where name='icpc';
insert into event_officers(event_id,officer_id) values (-304,-303),(-305,-303);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
set local role authenticated;
select lives_ok($$select save_officer('Created PR3',17::bigint,'active',null,null,'created-pr3@example.org')$$,
 'admin can create an officer');
select lives_ok($$select save_officer('Edited PR3',17::bigint,'active',null,-303,'officer-pr3@example.org')$$,
 'admin can edit officer');
select lives_ok($$select save_event('Admin global','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',null)$$,
 'admin can create global event');
select lives_ok($$select save_event('Admin branch','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',array[3::bigint])$$,
 'admin can create branch event');
select lives_ok($$select save_event('Admin global edit','','1','','2099-09-20 09:00-06','2099-09-20 10:00-06',null,-301)$$,
 'admin can edit global event');
select lives_ok($$select change_event_signup(-301,-302,false)$$,'admin can assign another officer to global event');
select lives_ok($$select change_event_signup(-301,-302,true)$$,'admin can remove another officer from global event');
select lives_ok($$select add_manual_transaction(-303,1,'Correction PR3','correction')$$,
 'admin can create a correction');
select lives_ok($$select set_officer_application_role(-303,'admin')$$,'admin can promote officer');
select lives_ok($$select set_officer_application_role(-304,'officer')$$,'admin can demote another admin');
select throws_ok($$select set_officer_application_role(-301,'officer')$$,'P0001','Admins cannot demote themselves',
 'admin cannot demote self');
select lives_ok($$select set_officer_application_role(-303,'officer')$$,'admin can demote another admin');
select throws_ok($$select set_officer_application_role(-301,'officer')$$,'P0001','Admins cannot demote themselves',
 'last remaining admin still cannot be demoted');
select throws_ok($$select save_officer('No active admin',17::bigint,'inactive',null,-301,'admin-pr3@example.org')$$,
 'P0001','Last active admin cannot be deactivated','last active admin cannot be deactivated');
select lives_ok($$select cancel_event(-301)$$,'admin can cancel global event');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
select throws_ok($$select save_officer('No',17::bigint,'active',null,null,'no-pr3@example.org')$$,
 'P0001','Admin required','normal officer cannot create officer');
select throws_ok($$select save_officer('No',17::bigint,'inactive',null,-302,'lead-pr3@example.org')$$,
 'P0001','Admin required','normal officer cannot edit or deactivate another officer');
select throws_ok($$select set_officer_application_role(-303,'admin')$$,'P0001','Admin required',
 'normal officer cannot promote self');
select throws_ok($$select save_event('No','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',null)$$,
 'P0001','Event outside branch scope','normal officer cannot create events');
select lives_ok($$select change_event_signup(-302,-303,false)$$,'normal officer can self-signup');
select lives_ok($$select change_event_signup(-302,-303,true)$$,'normal officer can self-signout');
select throws_ok($$select change_event_signup(-302,-301,false)$$,'P0001','Cannot manage another officer signup for this event',
 'normal officer cannot assign another officer');
select throws_ok($$select change_event_signup(-302,-301,true)$$,'P0001','Cannot manage another officer signup for this event',
 'normal officer cannot remove another officer');
select throws_ok($$select add_manual_transaction(-303,1,'No','manual')$$,'P0001','Admin required',
 'normal officer cannot create manual points');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
select throws_ok($$select save_officer('No',17::bigint,'active',null,null,'lead-no-pr3@example.org')$$,
 'P0001','Admin required','Lead cannot create officer');
select lives_ok($$select save_event('Lead shared','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',array[1::bigint,4::bigint])$$,
 'Lead may create a multi-branch event with one shared branch');
select throws_ok($$select save_event('Lead global','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',null)$$,
 'P0001','Event outside branch scope','Lead cannot create global event');
select throws_ok($$select save_event('Lead unrelated','','1','','2099-09-22 09:00-06','2099-09-22 10:00-06',array[3::bigint])$$,
 'P0001','Event outside branch scope','Lead cannot create unrelated branch event');
select lives_ok($$select save_event('Lead edit','','1','','2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-302)$$,
 'Lead may edit currently managed event');
select throws_ok($$select save_event('Lead takeover','','1','','2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-303)$$,
 'P0001','Event outside branch scope','Lead cannot take unrelated event by replacing branches');
select throws_ok($$select save_event('Lead global takeover','','1','','2099-09-20 09:00-06','2099-09-20 10:00-06',array[1::bigint],-301)$$,
 'P0001','Event outside branch scope','Lead cannot take global event by adding own branch');
select throws_ok($$select save_event('Lead makes global','','1','','2099-09-20 09:00-06','2099-09-20 10:00-06',null,-302)$$,
 'P0001','Event outside branch scope','Lead cannot convert managed event to global');
select lives_ok($$select change_event_signup(-302,-301,false)$$,'Lead can assign another officer on managed event');
select lives_ok($$select change_event_signup(-302,-301,true)$$,'Lead can remove another officer on managed event');
select throws_ok($$select change_event_signup(-303,-301,false)$$,'P0001','Cannot manage another officer signup for this event',
 'Lead cannot manage unrelated event signups');
select throws_ok($$select change_event_signup(-305,-301,false)$$,'P0001','Cannot manage another officer signup for this event',
 'Lead cannot manage global event signups');
select lives_ok($$select change_event_signup(-305,-302,false)$$,'Lead can self-signup to global event');
select throws_ok($$select add_manual_transaction(-303,1,'No','manual')$$,'P0001','Admin required',
 'Lead cannot create manual points');
select lives_ok($$select cancel_event(-302)$$,'Lead can cancel managed event');
select throws_ok($$select cancel_event(-303)$$,'P0001','Event outside branch scope','Lead cannot cancel unrelated event');
select throws_ok($$select cancel_event(-305)$$,'P0001','Event outside branch scope','Lead cannot cancel global event');
select throws_ok($$select change_event_signup(-302,-302,false)$$,'P0001','Signups are closed for this event',
 'signup remains closed after cancellation');
select throws_ok($$select change_event_signup(-304,-302,false)$$,'P0001','Signups are closed for this event',
 'signup remains closed after scheduled end');

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
select is((select auth_user_id from officers where id=-303),'00000000-0000-4000-8000-000000000303'::uuid,
 'deactivation preserves Auth link');
select is((select created_by from point_transactions where reason='Correction PR3'),
 '00000000-0000-4000-8000-000000000301'::uuid,
 'manual point transaction records the authenticated admin actor');
set local role authenticated;
select lives_ok($$select save_officer('Reactivated PR3',17::bigint,'active',null,-303,'officer-pr3@example.org')$$,
 'admin can reactivate officer');
select * from finish();
rollback;
