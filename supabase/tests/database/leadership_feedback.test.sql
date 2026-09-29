begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000901','pr10-admin@example.org'),
 ('00000000-0000-4000-8000-000000000902','pr10-lead@example.org'),
 ('00000000-0000-4000-8000-000000000903','pr10-officer@example.org');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
 (-901,'PR10 Admin','pr10-admin@example.org',(select id from positions where name='Officer'),'active','admin','00000000-0000-4000-8000-000000000901'),
 (-902,'PR10 Lead','pr10-lead@example.org',(select id from positions where name='Lead'),'active','officer','00000000-0000-4000-8000-000000000902'),
 (-903,'PR10 Officer','pr10-officer@example.org',(select id from positions where name='Officer'),'active','officer','00000000-0000-4000-8000-000000000903'),
 (-904,'PR10 Future Assignee','pr10-fourth@example.org',(select id from positions where name='Officer'),'active','officer',null);
insert into officer_branches(officer_id,branch_id) values
 (-902,(select id from branches where name='intro'));
insert into events(id,name,event_type_id,starts_at,ends_at) values
 (-901,'Ended timed',(select id from event_types where name='General'),'2020-09-20 09:00-06','2020-09-20 10:00-06'),
 (-902,'Future timed',(select id from event_types where name='General'),'2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id) values
 (-901,(select id from branches where name='intro')),
 (-902,(select id from branches where name='intro'));
insert into event_officers(event_id,officer_id) values(-901,-903),(-902,-903);
select is((select event_date from events where id=-901),'2020-09-20'::date,
 'legacy timed insert derives Denver date');
select throws_ok($$insert into events(name,event_type_id,event_date,starts_at,ends_at)
 values('Too early',(select id from event_types where name='General'),'2099-09-21',
 '2099-09-21 05:59-06','2099-09-21 06:30-06')$$,'23514',null,
 'database rejects start before 06:00 Denver');
select throws_ok($$insert into events(name,event_type_id,event_date,starts_at,ends_at)
 values('Too late',(select id from event_types where name='General'),'2099-09-21',
 '2099-09-21 22:00-06','2099-09-21 23:59:30-06')$$,'23514',null,
 'database rejects end after 23:59 Denver');
select throws_ok($$insert into events(name,event_type_id,event_date,starts_at,ends_at)
 values('Wrong day',(select id from event_types where name='General'),'2099-09-22',
 '2099-09-21 08:00-06','2099-09-21 09:00-06')$$,'23514',null,
 'event_date must match scheduled local date');
select throws_ok($$insert into events(name,event_type_id,event_date,fixed_points)
 values('Zero',(select id from event_types where name='General'),'2099-09-20',0)$$,
 '23514',null,'untimed fixed points cannot be zero');
select throws_ok($$insert into events(name,event_type_id,event_date)
 values('Missing kind',(select id from event_types where name='General'),'2099-09-20')$$,
 '23514',null,'event needs a timed range or fixed points');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select save_event_v2('PR10 work','Slides',
 (select id from event_types where name='General'),null,'2099-09-21',null,null,4.5,
 array[(select id from branches where name='intro')]::bigint[],null)$$,
 'admin creates untimed work event');
reset role;
select is((select fixed_points from events where name='PR10 work'),4.5::numeric,
 'untimed event saves configurable fixed points');
select set_config('test.work_event_id',(select id::text from events where name='PR10 work'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select throws_ok(format('select change_event_signup(%s,-903,false)',current_setting('test.work_event_id')),
 'P0001','Untimed assignments require an event manager',
 'ordinary officer cannot self assign untimed work');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select lives_ok(format('select change_event_signup(%s,-903,false)',current_setting('test.work_event_id')),
 'branch Lead assigns work within scope');
reset role;
select is((select count(*) from event_officers where event_id=current_setting('test.work_event_id')::bigint),
 1::bigint,'assignment is preserved');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
set local role authenticated;
select lives_ok(format('select change_event_signup(%s,-904,false)',current_setting('test.work_event_id')),
 'Lead can assign another officer to future untimed work');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select save_officer('PR10 Future Assignee',
 (select id from positions where name='Officer'),'inactive','{}'::bigint[],
 -904,'pr10-fourth@example.org',null,null)$$,
 'admin deactivates future work assignee');
reset role;
select is((select count(*) from event_officers where event_id=current_setting('test.work_event_id')::bigint
 and officer_id=-904),0::bigint,'deactivation removes future untimed assignment');

update events set event_date='2020-09-21' where id=current_setting('test.work_event_id')::bigint;
select is(private.process_finished_events(),2,
 'scheduled-ended timed and past-date untimed events process together');
select is((select points from point_transactions where event_id=current_setting('test.work_event_id')::bigint),
 4.5::numeric,'untimed assignment receives fixed points');
select ok((select untimed_processed_at is not null from events where id=current_setting('test.work_event_id')::bigint),
 'untimed event marks processing even after awards');
select is(private.process_finished_events(),0,'second run creates no more awards');
select is((select count(*) from point_transactions where event_id=current_setting('test.work_event_id')::bigint),
 1::bigint,'untimed award remains unique');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
set local role authenticated;
select throws_ok($$select update_point_transaction((select id from point_transactions where event_id=-901),7)$$,
 'P0001','Admin required','officer cannot edit awards');
select throws_ok($$select remove_point_transaction((select id from point_transactions where event_id=-901))$$,
 'P0001','Admin required','officer cannot remove awards');
select throws_ok($$select remove_event(-901)$$,
 'P0001','Event outside branch scope','officer cannot remove event');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select lives_ok($$select save_event_v2('Edited past event','Metadata changed',
 (select id from event_types where name='General'),null,'2020-09-20',
 '2020-09-20 09:00-06','2020-09-20 11:00-06',null,
 array[(select id from branches where name='intro')]::bigint[],-901)$$,
 'admin edits processed past event');
select is((select points from point_transactions where event_id=-901),
 (select participation_points_per_hour_at_end from events where id=-901),
 'past edit does not recalculate automatic award');
select ok((select details ?& array['before','after'] from audit_logs
 where action='event.updated' and entity_id='-901' order by id desc limit 1),
 'past event edit audits before and after');
select lives_ok($$select update_point_transaction((select id from point_transactions where event_id=-901),7.25)$$,
 'admin edits automatic award amount directly');
select is((select points from point_transactions where event_id=-901),7.25::numeric,
 'direct point edit stores new amount');
select ok((select updated_at is not null and
 updated_by='00000000-0000-4000-8000-000000000901'::uuid
 from point_transactions where event_id=-901),
 'point edit stores authenticated updater and timestamp');
select ok((select details ?& array['before','after'] from audit_logs
 where action='points.transaction_updated' order by id desc limit 1),
 'point edit audits before and after rows');
select is(remove_point_transaction((select id from point_transactions where event_id=-901)),true,
 'admin removes automatic transaction');
select is((select total_points from officer_point_totals where id=-903),4.5::numeric,
 'removed positive award stops counting');
select is(remove_point_transaction((select id from point_transactions where event_id=-901)),false,
 'repeat removal does not mutate row');
select throws_ok($$select update_point_transaction((select id from point_transactions where event_id=-901),2)$$,
 'P0001','Removed transaction cannot be edited','removed award cannot be edited');
select lives_ok($$select add_manual_transaction(-903,3,'Manual PR10','manual')$$,
 'admin can create a manual transaction');
select lives_ok($$select add_manual_transaction(-903,-2,'Correction PR10','correction')$$,
 'admin can create a signed correction');
select is((select total_points from officer_point_totals where id=-903),5.5::numeric,
 'signed manual and correction rows contribute to derived total');
select is(remove_point_transaction((select id from point_transactions where reason='Manual PR10')),
 true,'admin can logically remove a manual transaction');
select is((select total_points from officer_point_totals where id=-903),2.5::numeric,
 'removing positive manual points lowers total');
select is(remove_point_transaction((select id from point_transactions where reason='Correction PR10')),
 true,'admin can logically remove a correction transaction');
select is((select total_points from officer_point_totals where id=-903),4.5::numeric,
 'removing negative correction raises total');
select is(remove_point_transaction((select id from point_transactions
 where event_id=current_setting('test.work_event_id')::bigint)),true,
 'admin can remove an untimed automatic award');
reset role;
select is(private.process_finished_events(),0,'removed untimed award is not regenerated');
set local role authenticated;
select is((select total_points from officer_point_totals where id=-903),0::numeric,
 'removed automatic award no longer counts');
select is(remove_event(-901),true,'admin logically removes past event');
select ok((select deleted_at is not null and deleted_by='00000000-0000-4000-8000-000000000901'::uuid
 from events where id=-901),'event removal stores timestamp and actor');
select is((select count(*) from event_officers where event_id=-901),1::bigint,
 'removed event retains signup');
select is((select count(*) from point_transactions where event_id=-901),1::bigint,
 'removed event retains point history');
select ok((select details ? 'before' from audit_logs
 where action='event.removed' and entity_id='-901' order by id desc limit 1),
 'event removal audits pre-removal snapshot');
select is(remove_event(-902),true,'future event can be removed');
reset role;
insert into events(id,name,event_type_id,starts_at,ends_at) values
 (-905,'Ended but removed before processing',(select id from event_types where name='General'),
 '2020-09-25 09:00-06','2020-09-25 10:00-06');
insert into event_officers(event_id,officer_id) values(-905,-903);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
select is(remove_event(-905),true,'admin removes ended event before processing');
reset role;
select is(private.process_finished_events(),0,'removed ended event never processes');
select is((select count(*) from point_transactions where event_id=-905),0::bigint,
 'removed unprocessed event creates no automatic award');

select * from finish();
rollback;
