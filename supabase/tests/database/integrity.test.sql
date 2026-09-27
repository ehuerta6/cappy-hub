begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Fixed negative IDs isolate fixtures from identity-generated POC rows.
insert into public.officers(id,name,position_id) values
  (-1,'Schema test officer',(select id from positions where name='President')),
  (-2,'Schema test peer',(select id from positions where name='Secretary'));
insert into officer_branches values (-1,(select id from branches where name='general'));
insert into events(id,name,event_type_id,starts_at,ends_at) values
  (-1,'Schema test ended',(select id from event_types where name='General'),now()-interval '2 hours',now()-interval '1 hour'),
  (-2,'Schema test future',(select id from event_types where name='Workshop'),now()+interval '1 day',now()+interval '2 days');
insert into event_officers values(-1,-1);
insert into event_branches values(-1,(select id from branches where name='general'));
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001');

select throws_ok($$select save_officer('No branches',1,'active','{}')$$,
  'P0001','Select at least one branch','creating an officer with no branches fails');
select throws_ok($$select save_officer('Null branches',1,'active',null)$$,
  'P0001','Select at least one branch','null branches cannot bypass the save invariant');
select throws_ok($$select save_officer('Changed',1,'active','{}',-1)$$,
  'P0001','Select at least one branch','editing to zero branches fails');
select is((select name from officers where id=-1),'Schema test officer','rejected edit preserves officer fields');
select is((select count(*) from officer_branches where officer_id=-1),1::bigint,'rejected edit preserves memberships');
select throws_ok($$select save_officer('Changed',1,'active',array[-999::bigint],-1)$$,
  '23503',null,'invalid branch fails inside the transaction');
select is((select name from officers where id=-1),'Schema test officer','later FK failure rolls back the officer update');
select is((select count(*) from officer_branches where officer_id=-1),1::bigint,'later FK failure rolls back membership deletion');
select throws_ok($$insert into officer_branches select -1,id from branches where name='general'$$,
  '23505',null,'duplicate officer/branch membership fails');
select throws_ok($$insert into event_officers values(-1,-1)$$,
  '23505',null,'duplicate officer/event signup fails');
select throws_ok($$insert into event_branches select -1,id from branches where name='general'$$,
  '23505',null,'duplicate event/branch association fails');
select throws_ok($$update events set ends_at=starts_at where id=-1$$,
  '23514',null,'zero-duration event fails');
select throws_ok($$update events set ends_at=starts_at-interval '1 second' where id=-1$$,
  '23514',null,'negative-duration event fails');
select throws_ok($$update officers set application_role='owner' where id=-1$$,
  '23514',null,'invalid application role fails');
select is((select application_role from officers where id=-1),'officer','new officers default to the unprivileged role');
select lives_ok($$update officers set auth_user_id='10000000-0000-0000-0000-000000000001' where id=-1$$,'existing auth user can link to officer');
select throws_ok($$update officers set auth_user_id='10000000-0000-0000-0000-000000000001' where id=-2$$,
  '23505',null,'one auth user cannot link to two officers');
select throws_ok($$update officers set auth_user_id='10000000-0000-0000-0000-000000000099' where id=-2$$,
  '23503',null,'officer cannot link to nonexistent auth user');
select throws_ok($$update events set event_type_id=-999 where id=-1$$,
  '23503',null,'event requires a valid event type');
select throws_ok($$update events set event_type_id=null where id=-1$$,
  '23502',null,'event type is required');
select throws_ok($$delete from event_types where name='General'$$,
  '23503',null,'referenced event type deletion fails without damaging history');
select throws_ok($$insert into event_types(name) values(' general ')$$,
  '23505',null,'event type uniqueness ignores case and surrounding whitespace');
select results_eq($$select name from positions where can_manage_branch_events order by name$$,
  $$values ('ICPC Lead'),('Intro Lead'),('Social Media Lead')$$,'only the three documented lead positions have the capability');

insert into point_transactions(id,officer_id,event_id,points,reason,award_type) values
  (-1,-1,-1,1.5,'Participation','participation'),
  (-2,-1,-1,2.25,'Flyer','flyer'),
  (-3,-1,null,-0.25,'Correction','correction');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Duplicate','participation')$$,
  '23505',null,'duplicate participation award fails');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-2,-1,1,'Duplicate','flyer')$$,
  '23505',null,'flyer uniqueness is per event even for a different officer');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-1,1,'No event','flyer')$$,
  '23514',null,'flyer award requires an event');
select throws_ok($$insert into point_transactions(officer_id,points,reason,award_type) values(-1,1,'No event','participation')$$,
  '23514',null,'participation requires an event');
select throws_ok($$update point_transactions set created_by='10000000-0000-0000-0000-000000000099' where id=-1$$,
  '23503',null,'point creator must be an actual auth account');
select throws_ok($$update point_transactions set removed_by='10000000-0000-0000-0000-000000000099' where id=-1$$,
  '23503',null,'removal actor must be an actual auth account');
select is((select total_points from officer_point_totals where id=-1),3.5::numeric,'totals include signed fractional corrections');
-- Record baseline so these assertions also work if local data exists.
create temporary table dashboard_before as select half_year_points from dashboard_summary;
update point_transactions set removed_at=now(),removed_by='10000000-0000-0000-0000-000000000001' where id in (-1,-2);
select is((select half_year_points from dashboard_summary),
  (select half_year_points-3.75 from dashboard_before),'logical removal subtracts awards from dashboard total');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Regeneration','participation')$$,
  '23505',null,'removed participation award still blocks regeneration');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-2,-1,1,'Regeneration','flyer')$$,
  '23505',null,'removed flyer award still blocks regeneration');
select lives_ok($$select process_completed_events(5)$$,'POC processing still executes after migration');
select is((select count(*) from point_transactions where event_id=-1 and award_type='participation'),1::bigint,'processor does not regenerate removed award');
select is((select points from point_transactions where id=-1),1.5::numeric,'later processing rate does not rewrite historical amount');
select is((select total_points from officer_point_totals where id=-1),(-0.25)::numeric,'removed awards are excluded but correction remains');
select is((select total_points from officer_point_totals where id=-2),0::numeric,'officer without points remains in totals');
-- Prior/future half-years must not leak into the current dashboard.
update dashboard_before set half_year_points=(select half_year_points from dashboard_summary);
insert into point_transactions(officer_id,points,reason,award_type,created_at) values
  (-1,100,'Previous period','manual',date_trunc('year',now())-interval '1 year'),
  (-1,100,'Future period','manual',date_trunc('year',now())+interval '1 year');
select is((select half_year_points from dashboard_summary),(select half_year_points from dashboard_before),
  'dashboard excludes transactions outside this half-year');

insert into officer_warnings(id,officer_id,reason) values(-1,-1,'Test warning');
insert into warning_approvals(warning_id,approver_id,approver_role) values(-1,'10000000-0000-0000-0000-000000000001','President');
select throws_ok($$insert into warning_approvals(warning_id,approver_id,approver_role) values(-1,'10000000-0000-0000-0000-000000000001','Vice President')$$,
  '23505',null,'one approval per warning/account, even if role changes');
select throws_ok($$update warning_approvals set decision='abstain' where warning_id=-1$$,
  '23514',null,'invalid approval decision fails');
select throws_ok($$update officer_warnings set reason=' ' where id=-1$$,
  '23514',null,'warning reason cannot be blank');
select is((select status from officer_warnings where id=-1),'pending','new warning defaults to pending');
insert into audit_logs(action,entity_type,entity_id,details) values('warning_deleted','officer_warnings','-1','{"reason":"Test warning"}');
delete from officer_warnings where id=-1;
select is((select details->>'reason' from audit_logs where entity_type='officer_warnings' and entity_id='-1'),'Test warning','audit snapshot survives source deletion');
select throws_ok($$insert into application_config(id,participation_points_per_hour,flyer_completion_points) values(2,1,0)$$,
  '23514',null,'singleton configuration rejects a second key');
select throws_ok($$insert into application_config(participation_points_per_hour,flyer_completion_points) values(1,0)$$,
  '23505',null,'singleton configuration rejects duplicate default key');
select throws_ok($$update application_config set participation_points_per_hour='NaN'$$,'23514',null,'NaN participation rate fails');
select throws_ok($$update application_config set flyer_completion_points='Infinity'$$,'23514',null,'infinite flyer points fail');
select lives_ok($$update application_config set participation_points_per_hour=1.25,flyer_completion_points=0.5$$,'config accepts fractional amounts');

-- Compatibility, not final authorization: keep old POC writes, forbid new powers.
set local role anon;
select lives_ok($$select save_officer('Anonymous POC officer',1,'active',array[1::bigint])$$,'POC officer save still works with narrowed column grants');
select lives_ok($$select save_event('Anonymous POC event','',1,'',now()+interval '1 day',now()+interval '2 days',array[1::bigint])$$,'POC event save uses controlled type ID');
select lives_ok($$select save_officer('Edited POC officer',1,'active',array[1::bigint],-2)$$,'POC officer editing remains compatible');
select lives_ok($$select save_event('Edited POC event','',1,'',now()+interval '1 day',now()+interval '2 days',array[1::bigint],-2)$$,'POC event editing remains compatible');
select lives_ok($$select change_event_signup(-2,-2)$$,'POC signup remains compatible');
select lives_ok($$select process_completed_events(1)$$,'POC processing remains executable without expanded privilege');
select throws_ok($$update officers set application_role='admin' where id=-1$$,'42501',null,'anonymous POC cannot assign new application roles');
select throws_ok($$update events set participation_points_per_hour_at_end=99 where id=-2$$,'42501',null,'anonymous POC cannot write rate snapshots');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-2,-2,1,'Flyer','flyer')$$,'42501',null,'schema work does not expose anonymous flyer awards');
select throws_ok($$select * from officer_warnings$$,'42501',null,'new warning records are not publicly exposed');
select throws_ok($$select * from audit_logs$$,'42501',null,'new audit records are not publicly exposed');
reset role;
select * from finish();
rollback;
