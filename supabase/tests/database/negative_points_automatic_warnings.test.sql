begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000040201','negative-admin@example.test'),
 ('00000000-0000-4000-8000-000000040202','negative-target@example.test'),
 ('00000000-0000-4000-8000-000000040203','negative-second@example.test');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
 (-40201,'Negative Admin','negative-admin@example.test',(select id from positions where code='officer'),'admin','active','00000000-0000-4000-8000-000000040201'),
 (-40202,'Negative Target','negative-target@example.test',(select id from positions where code='officer'),'officer','active','00000000-0000-4000-8000-000000040202'),
 (-40203,'Negative Second','negative-second@example.test',(select id from positions where code='officer'),'officer','active','00000000-0000-4000-8000-000000040203'),
 (-40204,'Warning threshold transition','warning-transition@example.test',(select id from positions where code='officer'),'officer','active',null);

insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status)
values(-40201,'Participation type processing','Synthetic test event','Campus',
 (select id from event_types where name='Meeting'),'2099-01-01',
 ('2099-01-01 10:00'::timestamp at time zone 'America/Denver'),
 ('2099-01-01 12:00'::timestamp at time zone 'America/Denver'),'upcoming');
insert into event_branches(event_id,branch_id)
select -40201,id from branches where name='intro';
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
values(-40201,'Missed commitment task','Synthetic','Post',(select id from branches where name='intro'),
 current_date+2,2,-40201);

select set_config('cappy.seed_loading','on',true);
insert into point_transactions(id,officer_id,points,reason,award_type)
values(-402101,-40202,-1,'First negative','negative'),
      (-402102,-40202,-1,'Second negative','negative');
select set_config('cappy.seed_loading','off',true);
select is((select count(*) from officer_warnings where officer_id=-40202 and origin='automatic'),0::bigint,
 'two active negative Points do not create an automatic Warning');
insert into officer_warnings(officer_id,reason,status)
values (-40202,'Pending Warning does not count toward active threshold','pending'),
       (-40202,'Rejected Warning does not count toward active threshold','rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000040201',true);
set local role authenticated;
select throws_ok($$select add_negative_point(-40202,-40201,-40201,'Two sources')$$,'P0001',
 'A negative Point can link to an Event or a Task, not both','negative Point cannot link to both sources');
select lives_ok($$select change_event_signup(-40201,-40202,false,'attendee')$$,
 'manager can record an Attendee signup');
select lives_ok($$select change_event_signup(-40201,-40203,false,'volunteer')$$,
 'manager can record a Volunteer signup');
select is((select participation_type from event_officers where event_id=-40201 and officer_id=-40202),
 'attendee','signup stores the selected Attendee role');
select is((select participation_type from event_officers where event_id=-40201 and officer_id=-40203),
 'volunteer','signup stores the selected Volunteer role');
select lives_ok($$select change_event_signup(-40201,-40202,true,'volunteer')$$,
 'manager can remove an Attendee signup');
select is((select details->>'participation_type' from audit_logs
  where action='event.officer_removed' and entity_id='-40201' order by id desc limit 1),
 'attendee','signup removal audit records the selected Attendee role');
select lives_ok($$select change_event_signup(-40201,-40202,false,'attendee')$$,
 'manager can restore the Attendee signup for award processing');
select is((select participation_points_per_hour_at_end from events where id=-40201),null::numeric,
 'an upcoming signup does not start Event processing early');
select lives_ok($$select add_negative_point(-40202,-40201,null,'Missed Event commitment')$$,
 'Admin creates a negative Point linked to an Event');
select lives_ok($$select add_negative_point(-40202,null,-40201,'Missed Task commitment')$$,
 'Admin creates a negative Point linked to a Task');
select lives_ok($$select add_negative_point(-40202,-40201,null,'Third negative Point')$$,
 'third negative Point is recorded');
reset role;

select is((select points from point_transactions where officer_id=-40202 and reason='Missed Event commitment'),-1::numeric,
 'new negative Point creation stores exactly minus one');
select is((select count(*) from officer_warnings where officer_id=-40202 and origin='automatic' and deleted_at is null),1::bigint,
 'three active negative Points create one active automatic Warning');
select is((select count(*) from notifications n join officer_warnings w on w.id=n.entity_id
  where n.kind='warning.threshold' and w.officer_id=-40202 and w.origin='automatic'),0::bigint,
 'pending and rejected Warnings do not trigger a false third-active-Warning notice');
select is((select count(*) from automatic_warning_point_links l join officer_warnings w on w.id=l.warning_id
 where w.officer_id=-40202 and w.origin='automatic' and w.deleted_at is null and l.released_at is null),3::bigint,
 'automatic Warning links exactly three active deductions');
select set_config('test.auto_warning',(select id::text from officer_warnings where officer_id=-40202 and origin='automatic' and deleted_at is null),true);
select set_config('test.third_point',(select id::text from point_transactions where officer_id=-40202 and reason='Missed Event commitment'),true);

set local role authenticated;
select lives_ok(format('select remove_point_transaction(%s)',current_setting('test.third_point')),
 'removing one linked deduction removes its automatic Warning');
reset role;
select is((select count(*) from officer_warnings where id=current_setting('test.auto_warning')::bigint and deleted_at is not null),1::bigint,
 'automatic Warning is deleted when any linked deduction is removed');
select is((select count(*) from point_transactions where id in (-402101,-402102) and removed_at is null),2::bigint,
 'the other two linked negative Points remain active');

set local role authenticated;
select lives_ok($$select add_negative_point(-40202,-40201,null,'Replacement third Point')$$,
 'new negative Point can form another three-point group');
reset role;
select is((select count(*) from officer_warnings where officer_id=-40202 and origin='automatic' and deleted_at is null),1::bigint,
 'replacement negative Point reconstitutes an active automatic Warning group');
select is((select count(*) from officer_warnings where id=current_setting('test.auto_warning')::bigint and deleted_at is not null),1::bigint,
 'reconstituted group has a new Warning identity');

select throws_ok($$select update_point_transaction((select id from point_transactions where officer_id=-40202 and reason='Third negative Point'),-2)$$,
 '23514',null,'negative Point database constraint rejects changing its value below minus one');
select is((select points from point_transactions where officer_id=-40202 and reason='Third negative Point'),-1::numeric,
 'a rejected negative Point edit leaves the transaction at exactly minus one');
select throws_ok($$select update_point_transaction((select id from point_transactions where officer_id=-40202 and reason='Third negative Point'),1)$$,
 '23514',null,'negative Point database constraint prevents changing its sign');

reset role;
alter table public.events disable trigger events_reconcile_participation_schedule;
update events set event_date='2020-01-01',starts_at=('2020-01-01 10:00'::timestamp at time zone 'America/Denver'),
  ends_at=('2020-01-01 12:00'::timestamp at time zone 'America/Denver') where id=-40201;
alter table public.events enable trigger events_reconcile_participation_schedule;
select is(private.event_participation_points('2026-11-01 10:00 America/Denver','2026-11-01 12:00 America/Denver',2),4::numeric,
 'the shared participation helper applies the selected hourly rate');
select is((select participation_points_per_hour_at_end is null and ends_at<=now() from events where id=-40201),true,
 'the synthetic Event is ready for its first completion pass');
select is(private.process_finished_events(),1,'finished Event processing handles the synthetic Event');
select is((select points from point_transactions where event_id=-40201 and officer_id=-40202 and award_type='participation'),2::numeric,
 'two-hour Attendee receives one Point per hour without attendance validation');
select is((select points from point_transactions where event_id=-40201 and officer_id=-40203 and award_type='participation'),4::numeric,
 'two-hour Volunteer receives two Points per hour');
select is(private.process_finished_events(),0,'Event participation processing is idempotent');

set local role authenticated;
select lives_ok($$select create_warning(-40203,'Manual warning one')$$,'Admin can create a manual Warning');
select lives_ok($$select create_warning(-40203,'Manual warning two')$$,'manual Warning count can reach two');
select lives_ok($$select create_warning(-40203,'Manual warning three')$$,'manual Warning count can reach three');
select throws_ok($$select create_warning(-40203,'Manual warning four')$$,'P0001',
 'Officer already has 3 active Warnings','a fourth manual Warning is rejected at the cap');
select lives_ok($$select add_negative_point(-40203,null,null,'Over-limit negative one')$$,
 'negative Point still records when the Warning cap is full');
select lives_ok($$select add_negative_point(-40203,null,null,'Over-limit negative two')$$,
 'second over-limit negative Point still records');
select lives_ok($$select add_negative_point(-40203,null,null,'Over-limit negative three')$$,
 'third over-limit negative Point still records without a fourth Warning');
select is((select count(*) from point_transactions where officer_id=-40203 and award_type='negative' and removed_at is null),3::bigint,
 'all negative Points are preserved while the Warning cap is full');
select is((select count(*) from officer_warnings where officer_id=-40203 and status='approved' and deleted_at is null and voided_at is null),3::bigint,
 'negative Points do not create a fourth active Warning');
select delete_warning((select id from officer_warnings where officer_id=-40203 and reason='Manual warning one'));
select lives_ok($$select add_negative_point(-40203,null,null,'Warning slot is free')$$,
 'a later negative Point can form a group after a Warning slot is freed');
reset role;
select is((select count(*) from officer_warnings where officer_id=-40203 and origin='automatic' and deleted_at is null),1::bigint,
 'freed Warning capacity allows an automatic three-point group');

set local role authenticated;
select lives_ok($$select create_warning(-40204,'Transition warning one')$$,'transition fixture creates first active Warning');
select lives_ok($$select create_warning(-40204,'Transition warning two')$$,'transition fixture creates second active Warning');
select set_config('test.transition_warning',(select id::text from officer_warnings
  where officer_id=-40204 and reason='Transition warning one'),true);
reset role;
insert into officer_warnings(officer_id,reason,status)
values(-40204,'Transition warning three','pending');
select set_config('test.pending_warning',(select id::text from officer_warnings
  where officer_id=-40204 and reason='Transition warning three'),true);
insert into warning_approvals(warning_id,approver_id,approver_officer_id,approver_role)
values(current_setting('test.pending_warning')::bigint,
  '00000000-0000-4000-8000-000000040201',-40201,'President');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000040201',true);
set local role authenticated;
select lives_ok(format('select decide_warning(%s,''approved'')',current_setting('test.pending_warning')::bigint),
 'assigned approver can approve a historical pending Warning when it brings the active count to three');
reset role;
select is((select count(*) from notifications where kind='warning.threshold'
  and entity_id=current_setting('test.pending_warning')::bigint)>0,true,
 'approving the third active Warning through the decision RPC sends the leadership notice');
insert into officer_warnings(officer_id,reason,status)
values(-40204,'Legacy pending Warning beyond the cap','pending');
select set_config('test.over_limit_pending_warning',(select id::text from officer_warnings
  where officer_id=-40204 and reason='Legacy pending Warning beyond the cap'),true);
insert into warning_approvals(warning_id,approver_id,approver_officer_id,approver_role)
values(current_setting('test.over_limit_pending_warning')::bigint,
  '00000000-0000-4000-8000-000000040201',-40201,'President');
set local role authenticated;
select throws_ok(format('select decide_warning(%s,''approved'')',current_setting('test.over_limit_pending_warning')::bigint),
 'P0001','Officer already has 3 active Warnings',
 'legacy approval cannot bypass the three-active-Warning limit');
reset role;
select is((select status from officer_warnings where id=current_setting('test.over_limit_pending_warning')::bigint),'pending',
 'a rejected over-limit approval leaves the legacy Warning pending');
select is((select decision from warning_approvals where warning_id=current_setting('test.over_limit_pending_warning')::bigint),'pending',
 'a rejected over-limit approval does not consume the approver decision');
set local role authenticated;
select delete_warning(current_setting('test.transition_warning')::bigint);
select restore_warning(current_setting('test.transition_warning')::bigint);
select is((select count(*) from notifications where kind='warning.threshold'
  and entity_id=current_setting('test.transition_warning')::bigint)>0,true,
 'restoring an approved Warning that reaches three sends the leadership notice');
select throws_ok($$select create_warning(-40204,'Transition warning four')$$,'P0001',
 'Officer already has 3 active Warnings','restored Warning still counts toward the cap');
reset role;

select * from finish();
rollback;
