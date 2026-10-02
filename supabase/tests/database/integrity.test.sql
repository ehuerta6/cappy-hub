begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The catalog is generic; area lives in memberships, never a title flag.
select results_eq($$select name from positions order by name$$,
  $$values ('Lead'),('Officer'),('President'),('Secretary'),('Vice President of Academics'),('Vice President of Operations')$$,
  'final position catalog is generic');

insert into officers(id,name,position_id,utep_email) values
  (-1,'Schema test officer',(select id from positions where name='President'),'schema-one@example.org');
insert into officers(id,name,position_id,personal_email) values
  (-2,'Schema test peer',(select id from positions where name='Secretary'),'schema-two@example.org');
-- The integrity tests exercise trusted RPCs as a linked administrator.
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000201','schema-one@example.org');
update officers set auth_user_id='00000000-0000-4000-8000-000000000201',
  application_role='admin' where id=-1;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select throws_ok($$insert into officers(name,position_id) values ('No email',(select id from positions where name='Officer'))$$,
  '23514',null,'at least one contact email is required');
select lives_ok($$insert into officers(name,position_id,utep_email,personal_email) values
  ('Two distinct emails',(select id from positions where name='Officer'),'distinct-utep@example.org','distinct-personal@example.org')$$,
  'both distinct email fields are accepted');
select throws_ok($$insert into officers(name,position_id,utep_email) values
  ('Duplicate UTEP',(select id from positions where name='Officer'),'SCHEMA-ONE@example.org')$$,
  '23505',null,'UTEP email uniqueness ignores case');
select throws_ok($$insert into officers(name,position_id,utep_email) values
  ('Reverse cross email',(select id from positions where name='Officer'),'SCHEMA-TWO@example.org')$$,
  '23505',null,'personal email conflicts with another UTEP email');

select lives_ok($$select save_officer('Global officer',1,'inactive',null,null,'new-global@example.org')$$,
  'officer save accepts null branches and ignores supplied inactive status on create');
insert into officer_branches values (-1,(select id from branches where name='general'));
select lives_ok($$select save_officer('Changed',1,'active','{}'::bigint[],-1,'schema-one@example.org')$$,
  'editing an officer from one branch to zero works');
insert into officer_branches values (-1,(select id from branches where name='general'));
select throws_ok($$select save_officer('Should roll back',1,'active',array[-999::bigint],-1,'schema-one@example.org')$$,
  '23503',null,'invalid replacement branch fails');
select throws_ok($$insert into officer_branches select -1,id from branches where name='general'$$,
  '23505',null,'duplicate officer membership is impossible');

insert into events(id,name,description,location,event_type_id,starts_at,ends_at) values
  (-1,'Ended','Test event','TBA',(select id from event_types where name='Meeting'),'2020-09-20 09:00-06','2020-09-20 10:00-06'),
  (-2,'Future','Test event','TBA',(select id from event_types where name='Workshop'),'2099-09-20 09:00-06','2099-09-20 10:00-06');
select lives_ok($$select save_event('Global','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20 11:00-06','2099-09-20 12:00-06',null)$$,
  'event save accepts null branches');
select lives_ok($$select save_event('Associated','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20 11:00-06','2099-09-20 12:00-06',array[(select id from branches where name='intro'),(select id from branches where name='social')])$$,
  'event save accepts multiple branches');
insert into event_branches values (-2,(select id from branches where name='general'));
select lives_ok($$select save_event('Global edit','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[],-2)$$,
  'event can change from branches to global');
select lives_ok($$select save_event('Branch edit','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20 09:00-06','2099-09-20 10:00-06',array[(select id from branches where name='icpc')],-2)$$,
  'global event can become branch associated');
select throws_ok($$select save_event('Failed branch edit','Test event',(select id from event_types where name='Meeting'),'TBA','2099-09-20 09:00-06','2099-09-20 10:00-06',array[-999::bigint],-2)$$,
  '23503',null,'event replacement rejects an invalid branch');
select is((select name from events where id=-2),'Branch edit','failed event replacement rolls back row change');
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
update point_transactions set removed_at=now() where id=-1;
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type) values(-1,-1,1,'Regeneration','participation')$$,
  '23505',null,'removed participation award cannot regenerate');
select lives_ok($$update application_config set participation_points_per_hour=1.25$$,'participation rate remains configurable');

select * from finish();
rollback;
