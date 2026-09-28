begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The catalog is generic; area lives in memberships, never a title flag.
select results_eq($$select name from positions order by name$$,
  $$values ('Lead'),('Officer'),('President'),('Secretary'),('Vice President of Academics'),('Vice President of Operations')$$,
  'final position catalog is generic');
select hasnt_column('positions','can_manage_branch_events','legacy capability flag is absent');
select is((select count(*) from branches where name='outreach'),1::bigint,'outreach is a controlled branch');
select hasnt_column('events','flyer_status','flyer status is absent');
select hasnt_column('events','flyer_assigned_to','flyer assignee is absent');
select hasnt_column('application_config','flyer_completion_points','flyer configuration is absent');

insert into officers(id,name,position_id,utep_email) values
  (-1,'Schema test officer',(select id from positions where name='President'),'schema-one@example.org');
insert into officers(id,name,position_id,personal_email) values
  (-2,'Schema test peer',(select id from positions where name='Secretary'),'schema-two@example.org');
select is((select status from officers where id=-1),'active','new officers default active');
select throws_ok($$insert into officers(name,position_id) values ('No email',(select id from positions where name='Officer'))$$,
  '23514',null,'at least one contact email is required');
select lives_ok($$insert into officers(name,position_id,utep_email,personal_email) values
  ('Two distinct emails',(select id from positions where name='Officer'),'distinct-utep@example.org','distinct-personal@example.org')$$,
  'both distinct email fields are accepted');
select throws_ok($$insert into officers(name,position_id,utep_email) values
  ('Duplicate UTEP',(select id from positions where name='Officer'),'SCHEMA-ONE@example.org')$$,
  '23505',null,'UTEP email uniqueness ignores case');
select throws_ok($$insert into officers(name,position_id,personal_email) values
  ('Duplicate personal',(select id from positions where name='Officer'),'SCHEMA-TWO@example.org')$$,
  '23505',null,'personal email uniqueness ignores case');
select throws_ok($$insert into officers(name,position_id,personal_email) values
  ('Cross email',(select id from positions where name='Officer'),'SCHEMA-ONE@example.org')$$,
  '23505',null,'UTEP email conflicts with another personal email');
select throws_ok($$insert into officers(name,position_id,utep_email) values
  ('Reverse cross email',(select id from positions where name='Officer'),'SCHEMA-TWO@example.org')$$,
  '23505',null,'personal email conflicts with another UTEP email');
select throws_ok($$update officers set personal_email='SCHEMA-ONE@example.org' where id=-1$$,
  '23505',null,'one officer cannot repeat an email in both fields');

select lives_ok($$select save_officer('Global officer',1,'inactive',null,null,'new-global@example.org')$$,
  'officer save accepts null branches and ignores supplied inactive status on create');
select is((select status from officers where utep_email='new-global@example.org'),'active','save RPC creates officers active');
select is((select count(*) from officer_branches where officer_id=-1),0::bigint,'global officer has no branch rows');
insert into officer_branches values (-1,(select id from branches where name='general'));
select lives_ok($$select save_officer('Changed',1,'active','{}'::bigint[],-1,'schema-one@example.org')$$,
  'editing an officer from one branch to zero works');
select is((select count(*) from officer_branches where officer_id=-1),0::bigint,'officer replacement removes all memberships');
insert into officer_branches values (-1,(select id from branches where name='general'));
select throws_ok($$select save_officer('Should roll back',1,'active',array[-999::bigint],-1,'schema-one@example.org')$$,
  '23503',null,'invalid replacement branch fails');
select is((select name from officers where id=-1),'Changed','failed replacement rolls back officer row');
select is((select count(*) from officer_branches where officer_id=-1),1::bigint,'failed replacement retains branch row');
select throws_ok($$insert into officer_branches select -1,id from branches where name='general'$$,
  '23505',null,'duplicate officer membership is impossible');

insert into events(id,name,event_type_id,starts_at,ends_at) values
  (-1,'Ended',(select id from event_types where name='General'),'2020-09-20 09:00-06','2020-09-20 10:00-06'),
  (-2,'Future',(select id from event_types where name='Workshop'),'2099-09-20 09:00-06','2099-09-20 10:00-06');
select is((select count(*) from event_branches where event_id=-2),0::bigint,'zero branch rows represent a global event');
select lives_ok($$select save_event('Global','','1','','2099-09-20 11:00-06','2099-09-20 12:00-06',null)$$,
  'event save accepts null branches');
select lives_ok($$select save_event('Associated','',1,'','2099-09-20 11:00-06','2099-09-20 12:00-06',array[(select id from branches where name='intro'),(select id from branches where name='social')])$$,
  'event save accepts multiple branches');
insert into event_branches values (-2,(select id from branches where name='general'));
select lives_ok($$select save_event('Global edit','',1,'','2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[],-2)$$,
  'event can change from branches to global');
select is((select count(*) from event_branches where event_id=-2),0::bigint,'global edit removes branch rows');
select lives_ok($$select save_event('Branch edit','',1,'','2099-09-20 09:00-06','2099-09-20 10:00-06',array[(select id from branches where name='icpc')],-2)$$,
  'global event can become branch associated');
select throws_ok($$select save_event('Failed branch edit','',1,'','2099-09-20 09:00-06','2099-09-20 10:00-06',array[-999::bigint],-2)$$,
  '23503',null,'event replacement rejects an invalid branch');
select is((select name from events where id=-2),'Branch edit','failed event replacement rolls back row change');
select is((select count(*) from event_branches where event_id=-2),1::bigint,'failed event replacement retains branch row');
select throws_ok($$insert into event_branches select -2,id from branches where name='icpc'$$,
  '23505',null,'duplicate event branch pair is impossible');
select throws_ok($$update events set ends_at=starts_at where id=-2$$,
  '23514',null,'end must follow start');
select throws_ok($$update events set ends_at='2099-09-21 09:00-06' where id=-2$$,
  '23514',null,'event cannot cross America/Denver calendar days');
select lives_ok($$update events set starts_at='2099-09-20 17:30-06',ends_at='2099-09-20 18:30-06' where id=-2$$,
  'same Denver date remains valid across UTC midnight');

insert into event_officers values(-1,-1);
select throws_ok($$insert into event_officers values(-1,-1)$$,'23505',null,'duplicate signup is impossible');
insert into point_transactions(id,officer_id,event_id,points,reason,award_type) values
  (-1,-1,-1,1.5,'Participation','participation'),(-2,-1,null,-0.25,'Correction','correction');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Duplicate','participation')$$,
  '23505',null,'participation cannot be awarded twice');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Old flyer','flyer')$$,
  '23514',null,'flyer is not an MVP award type');
select is((select total_points from officer_point_totals where id=-1),1.25::numeric,'signed totals include active transactions');
update point_transactions set removed_at=now() where id=-1;
select is((select total_points from officer_point_totals where id=-1),(-0.25)::numeric,'removed award no longer affects total');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Regeneration','participation')$$,
  '23505',null,'removed participation award cannot regenerate');
select throws_ok($$insert into application_config(id,participation_points_per_hour) values(2,1)$$,
  '23514',null,'configuration remains a singleton');
select lives_ok($$update application_config set participation_points_per_hour=1.25$$,'participation rate remains configurable');

select * from finish();
rollback;
