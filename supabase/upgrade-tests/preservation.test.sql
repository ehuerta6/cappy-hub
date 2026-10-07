begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select results_eq(
  $$select id,name,utep_email,personal_email,classification,status,created_at from officers where id between 90001 and 90003 order by id$$,
  $$select (original->>'id')::bigint,original->>'name',original->>'utep_email',original->>'personal_email',original->>'classification',original->>'status',(original->>'created_at')::timestamptz from upgrade_fixture.officers order by (original->>'id')::bigint$$,
  'officer identities, contacts, status and timestamps survive');
select results_eq(
  $$select o.id,p.name from officers o join positions p on p.id=o.position_id where o.id between 90001 and 90003 order by o.id$$,
  $$values (90001::bigint,'Lead'),(90002::bigint,'Secretary'),(90003::bigint,'Lead')$$,
  'detailed positions migrate to generic positions without changing officer IDs');
select ok(exists(select 1 from officer_branches ob join branches b on b.id=ob.branch_id where ob.officer_id=90001 and b.name='icpc'),
  'ICPC Lead retains and gains the intended ICPC membership');
select is((select count(*) from officer_branches where officer_id=90002),0::bigint,
  'global Secretary remains without a branch');
select ok(exists(select 1 from officer_branches ob join branches b on b.id=ob.branch_id where ob.officer_id=90003 and b.name='outreach'),
  'Chief Outreach becomes Lead plus outreach');
select is((select count(*) from branches where name='outreach'),1::bigint,'outreach exists once');
select results_eq(
  $$select id,name,description,location,starts_at,ends_at,status,created_at from events where id between 90001 and 90003 order by id$$,
  $$select (original->>'id')::bigint,original->>'name',case when original->>'description'='' then 'Description unavailable' else original->>'description' end,coalesce(original->>'location','TBA'),(original->>'starts_at')::timestamptz,(original->>'ends_at')::timestamptz,original->>'status',(original->>'created_at')::timestamptz from upgrade_fixture.events where (original->>'id')::bigint between 90001 and 90003 order by (original->>'id')::bigint$$,
  'event identities, schedules, statuses and timestamps survive');
select is((select count(*) from events where id between 90001 and 90006
  and location_id is not null),6::bigint,
  'existing Events are connected to reusable locations during migration');
select has_column('events','location_id',
  'reusable location links are added without replacing Event location snapshots');
select results_eq(
  $$select e.id,e.name,t.name,e.starts_at,e.ends_at,e.description,e.location from events e join event_types t on t.id=e.event_type_id where e.id between 90004 and 90006 order by e.id$$,
  $$select (original->>'id')::bigint,original->>'name',original->>'type',(original->>'starts_at')::timestamptz,(original->>'ends_at')::timestamptz,case when original->>'description'='' then 'Description unavailable' else original->>'description' end,coalesce(original->>'location','TBA') from upgrade_fixture.events where (original->>'id')::bigint between 90004 and 90006 order by (original->>'id')::bigint$$,
  'timed General, Intro and ICPC Events retain their IDs, schedules and historical type labels');
select is((select count(*) from event_branches where event_id=90002),0::bigint,
  'historical zero-branch event is global');
select results_eq($$select * from event_branches where event_id=90001 order by branch_id$$,
  $$select * from upgrade_fixture.event_branches where event_id=90001 order by branch_id$$,
  'historical event branch links survive');
select results_eq($$select * from event_branches where event_id between 90004 and 90006 order by event_id,branch_id$$,
  $$select * from upgrade_fixture.event_branches where event_id between 90004 and 90006 order by event_id,branch_id$$,
  'timed legacy Event branch links survive');
select results_eq($$select * from event_officers where event_id=90001$$,
  $$select * from upgrade_fixture.event_officers where event_id=90001$$,'historical signups survive');
select results_eq($$select * from event_officers where event_id between 90004 and 90006 order by event_id,officer_id$$,
  $$select * from upgrade_fixture.event_officers where event_id between 90004 and 90006 order by event_id,officer_id$$,
  'timed legacy Event officer participation survives');
select results_eq(
  $$select to_jsonb(p)-'removed_at'-'removed_by'-'updated_at'-'updated_by'-'task_id'-'created_by_officer_id'-'updated_by_officer_id'-'removed_by_officer_id' from point_transactions p where id between 90001 and 90002 order by id$$,
  $$select original from upgrade_fixture.points where (original->>'id')::bigint between 90001 and 90002 order by (original->>'id')::bigint$$,
  'point transaction IDs, values, timestamps and actors survive');
select results_eq(
  $$select to_jsonb(p)-'task_id'-'created_by_officer_id'-'updated_by_officer_id'-'removed_by_officer_id' from point_transactions p where id in (90003,90004) order by id$$,
  $$select original from upgrade_fixture.points where (original->>'id')::bigint in (90003,90004) order by (original->>'id')::bigint$$,
  'active and removed legacy Event transactions retain their IDs, associations, values, actors and timestamps');
select is((select count(*) from point_transactions where id=90003),1::bigint,
  'removed historical transaction is not duplicated');
select is((select count(*) from point_transactions where event_id=90004 and award_type='participation'),1::bigint,
  'removed participation history is not recreated under another transaction ID');
select isnt((select removed_at from point_transactions where id=90003),null::timestamptz,
  'removed historical transaction remains removed');
select is((select removed_at from point_transactions where id=90004),null::timestamptz,
  'active historical transaction remains active');
select has_column('audit_logs','actor_officer_id','stable audit actor identity is additive');
select has_column('warning_approvals','approver_officer_id','stable warning approver identity is additive');
select has_column('events','deleted_by_officer_id','stable Event deletion actor identity is additive');
select has_column('point_transactions','created_by_officer_id','stable point creator identity is additive');
select has_column('point_transactions','updated_by_officer_id','stable point updater identity is additive');
select has_column('point_transactions','removed_by_officer_id','stable point remover identity is additive');
select is((select actor_officer_id from audit_logs where id=91001),91001::bigint,
  'known historical audit actor maps by exact current Auth UUID');
select is((select approver_officer_id from warning_approvals where warning_id=91001),91001::bigint,
  'warning snapshot maps to its intended Officer');
select is((select deleted_by_officer_id from events where id=91001),91001::bigint,
  'Event deletion actor maps to its Officer');
select results_eq(
  $$select created_by_officer_id,updated_by_officer_id,removed_by_officer_id from point_transactions where id=91001$$,
  $$values (91001::bigint,91001::bigint,91001::bigint)$$,
  'point creation, update and removal actors map to their Officer');
select results_eq(
  $$select actor_id,actor_officer_id from audit_logs where id in (91001,91002) order by id$$,
  $$values ('20000000-0000-0000-0000-000000009101'::uuid,91001::bigint),
    ('20000000-0000-0000-0000-000000009103'::uuid,null::bigint)$$,
  'UUID provenance survives and an unmappable actor remains explicit');
select is((select created_by_officer_id from point_transactions where id=91002),null::bigint,
  'unmappable point actor remains unknown');

-- Relinking changes the current authentication principal, not business history.
update public.officers set auth_user_id='20000000-0000-0000-0000-000000009102'
  where id=91001;
select is((select actor_officer_id from audit_logs where id=91001),91001::bigint,
  'historical audit entry still resolves after Auth relink');
select is((select approver_officer_id from warning_approvals where warning_id=91001),91001::bigint,
  'warning snapshot remains with the same Officer after Auth relink');
select is((select created_by_officer_id from point_transactions where id=91001),91001::bigint,
  'point history still resolves after Auth relink');
select is((select created_by_name from point_history where id=91001),'Historical Actor',
  'point history read resolves actor by stable Officer identity');
select is((select actor_officer_id from audit_logs where id=91002),null::bigint,
  'an unknown actor is not reassigned after another Officer relinks');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000009102',true);
set local role authenticated;
select is((select count(*) from warning_approvals where warning_id=91001),1::bigint,
  'relinked Officer retains RLS visibility of their pending warning snapshot');
select lives_ok($$select decide_warning(91001,'approved')$$,
  'relinked Officer can decide the warning assigned to their stable identity');
select throws_ok($$update public.point_transactions set created_by_officer_id=91002 where id=91001$$,
  '42501',null,'authenticated clients cannot forge stable actor IDs with direct writes');
select throws_ok($$select add_manual_transaction(91002,1,'Not authorized','manual')$$,
  'P0001','Admin required','a relinked non-admin cannot claim another Officer identity through a write RPC');
reset role;

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000009104',true);
set local role authenticated;
select lives_ok($$select add_manual_transaction(91002,1,'Current stable attribution','manual')$$,
  'authorized admin can award points to another Officer');
reset role;
select is((select created_by_officer_id from point_transactions where reason='Current stable attribution'),
  91004::bigint,'new point transaction stores the authenticated Officer as actor, not its recipient');
select is((select actor_officer_id from audit_logs where action='points.manual_created'
  and entity_id=(select id::text from point_transactions where reason='Current stable attribution')),
  91004::bigint,'new System Log entry stores the authenticated Officer identity');
select lives_ok($$select update_point_transaction(
  (select id from point_transactions where reason='Current stable attribution'),2)$$,
  'authorized admin can update a point transaction');
select lives_ok($$select remove_point_transaction(
  (select id from point_transactions where reason='Current stable attribution'))$$,
  'authorized admin can remove a point transaction');
select results_eq(
  $$select created_by_officer_id,updated_by_officer_id,removed_by_officer_id
    from point_transactions where reason='Current stable attribution'$$,
  $$values (91004::bigint,91004::bigint,91004::bigint)$$,
  'new point create, update and remove actions each store the session Officer');
insert into events(id,name,description,location,event_type_id,event_date,starts_at,ends_at)
values (91002,'Current deletion actor','Historical test','TBA',
  (select id from event_types where name='Meeting'),'2099-10-01',
  '2099-10-01 09:00-06','2099-10-01 10:00-06');
select lives_ok($$select remove_event(91002)$$,
  'authorized admin can remove an Event');
select is((select deleted_by_officer_id from events where id=91002),91004::bigint,
  'new Event deletion stores the session Officer');

select is((select count(*) from point_transactions where id=90005),0::bigint,
  'participation transaction for a truly untimed legacy Event is removed');
select is((select count(*) from event_officers where event_id=90007),0::bigint,
  'officer participation for a truly untimed legacy Event is removed');
select is((select count(*) from event_branches where event_id=90007),0::bigint,
  'branch links for a truly untimed legacy Event are removed');
select is((select count(*) from events where id=90007),0::bigint,
  'truly untimed legacy Event is removed separately from timed historical types');
select is((select count(*) from event_types where name in ('General','Intro','ICPC')),3::bigint,
  'referenced legacy Event Type catalog values remain readable');
select results_eq(
  $$select id,name,created_at from event_types order by id$$,
  $$select (row->>'id')::bigint,row->>'name',(row->>'created_at')::timestamptz from upgrade_fixture.pre_hardening_event_types order by (row->>'id')::bigint$$,
  'Event Type IDs, labels and timestamps survive hardening');
select is((select count(*) from event_types where available_for_new_events),3::bigint,
  'only Meeting, Social and Workshop remain available for new Events');
select is((select count(*) from event_types where name in ('General','Intro','ICPC') and available_for_new_events),0::bigint,
  'historical Event Types are retired without deleting their rows');
select results_eq(
  $$select e.id,e.event_type_id,t.name from events e join event_types t on t.id=e.event_type_id where e.id between 90004 and 90006 order by e.id$$,
  $$select (e.row->>'id')::bigint,(e.row->>'event_type_id')::bigint,t.row->>'name' from upgrade_fixture.pre_hardening_events e join upgrade_fixture.pre_hardening_event_types t on (t.row->>'id')::bigint=(e.row->>'event_type_id')::bigint where (e.row->>'id')::bigint between 90004 and 90006 order by (e.row->>'id')::bigint$$,
  'historical Events retain their exact type IDs and labels');
select is((select jsonb_agg(to_jsonb(e)-'deleted_by_officer_id' order by id)
  from events e where exists(select 1 from upgrade_fixture.pre_hardening_events f
    where (f.row->>'id')::bigint=e.id)),
  (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.pre_hardening_events),
  'hardening leaves every Event row and lifecycle value intact');
select is((select jsonb_agg(to_jsonb(p)-'created_by_officer_id'-'updated_by_officer_id'-'removed_by_officer_id' order by id)
  from point_transactions p where exists(select 1 from upgrade_fixture.pre_hardening_points f
    where (f.row->>'id')::bigint=p.id)),
  (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.pre_hardening_points),
  'hardening leaves Point history and lifecycle metadata intact');
select is((select jsonb_agg(to_jsonb(b) order by id) from branches b),
  (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.pre_hardening_branches),
  'Branch names, IDs and timestamps survive normalization');
select is((select jsonb_agg(to_jsonb(p)-'code' order by id) from positions p),
  (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.pre_hardening_positions),
  'Position names, IDs and timestamps survive normalization');
select is((select jsonb_agg(to_jsonb(p)-'code' order by id) from positions p),
  (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.pre_position_machine_positions),
  'Position IDs, labels and timestamps survive identity backfill');
select is((select count(*) from upgrade_fixture.pre_position_machine_officers original
    left join officers current on current.id=original.id
    where current.id is null or current.position_id is distinct from original.position_id),
  0::bigint,'all pre-existing Officer to Position relationships survive identity backfill');
select results_eq(
  $$select code from positions where code is not null order by code$$,
  $$values ('lead'),('officer'),('president'),('secretary'),
    ('vice_president_academics'),('vice_president_operations')$$,
  'all six canonical Positions receive stable machine identities');
select ok((select convalidated from pg_catalog.pg_constraint where conrelid='public.events'::regclass and conname='events_local_hours_check'),
  'upgrade validates the existing Event local-hours constraint');

insert into auth.users(id) values
 ('20000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000003'),
 ('20000000-0000-0000-0000-000000000004');
insert into officers(id,name,utep_email,position_id,status,application_role,auth_user_id) values
  (-90010,'Upgrade test admin','upgrade-admin@example.org',(select id from positions where name='Officer'),'active','admin',
    '20000000-0000-0000-0000-000000000002');
update officers set auth_user_id='20000000-0000-0000-0000-000000000003' where id=90001;
set local role anon;
select throws_ok($$select count(*) from event_locations$$,'42501',null,
  'anonymous account cannot read Event Locations after upgrade');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select is((select count(*) from event_locations),0::bigint,
  'unmatched account cannot read Event Locations after upgrade');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select is((select count(*) from event_locations),0::bigint,
  'inactive Officer cannot read Event Locations after upgrade');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select ok((select count(*) from event_locations)>0,
  'active linked Officer reads Event Locations after upgrade');
select throws_ok($$select save_event_with_links('Rejected General','Description',
  (select id from event_types where name='General'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects General for new Events');
select throws_ok($$select save_event_with_links('Rejected Intro','Description',
  (select id from event_types where name='Intro'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects Intro for new Events');
select throws_ok($$select save_event_with_links('Rejected ICPC','Description',
  (select id from event_types where name='ICPC'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'P0001','Invalid event type','trusted Event API rejects ICPC for new Events');
select lives_ok($$select save_event_with_links('Accepted Meeting','Description',
  (select id from event_types where name='Meeting'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Meeting');
select lives_ok($$select save_event_with_links('Accepted Social','Description',
  (select id from event_types where name='Social'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Social');
select lives_ok($$select save_event_with_links('Accepted Workshop','Description',
  (select id from event_types where name='Workshop'),'TBA','2099-09-20',
  '2099-09-20 09:00-06','2099-09-20 10:00-06','{}'::bigint[])$$,
  'trusted Event API accepts Workshop');
reset role;
select private.process_finished_events();
select is((select total_points from officer_point_totals where id=90001),11.25::numeric,
  'historical signed point total includes active Event and Task history, excluding the removed award');
select throws_ok($$insert into officers(name,position_id,personal_email) values
  ('Duplicate historical contact',(select id from positions where name='Officer'),'HISTORY@MINERS.UTEP.EDU')$$,
  '23505',null,'historical UTEP contact is protected across email fields');
select hasnt_column('positions','can_manage_branch_events','obsolete capability flag is gone');
select hasnt_column('events','flyer_status','flyer event column is gone');
select hasnt_column('application_config','flyer_completion_points','flyer configuration is gone');
select is((select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),19::bigint,
  'final schema contains expanded Task assignment data');
select is((select count(*) from events where recurrence_series_id is not null and id not in (90680,90681)),0::bigint,
  'existing Events remain standalone after the additive recurrence migration');
select is((select count(*) from tasks where recurrence_series_id is not null and id not in (90680,90681)),0::bigint,
  'existing Tasks remain standalone after the additive recurrence migration');
select has_column('events','recurrence_key','Event occurrence identity is additive');
select has_column('tasks','recurrence_key','Task occurrence identity is additive');
select is((select jsonb_agg(to_jsonb(e)-'deleted_by_officer_id' order by id) from events e where id in (90680,90681)),
 (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.recurring_events),'scope migration preserves existing recurring Event rows including cancellation');
select is((select jsonb_agg(to_jsonb(t) order by id) from tasks t where id in (90680,90681)),
 (select jsonb_agg(row order by (row->>'id')::bigint) from upgrade_fixture.recurring_tasks),'scope migration preserves existing recurring Task rows');
select is((select to_jsonb(a) from task_assignments a where task_id=90680),(select row from upgrade_fixture.recurring_assignment),'scope migration preserves assignment completion and approval');
select is((select to_jsonb(p)-'created_by_officer_id'-'updated_by_officer_id'-'removed_by_officer_id' from point_transactions p where id=90680),(select row from upgrade_fixture.recurring_award),'scope migration preserves existing awarded Task points');
select is((select to_jsonb(t) from tasks t where id=90790),(select row from upgrade_fixture.pre_task_standalone),'Task transition preserves standalone Task fields and creator');
select is((select to_jsonb(a) from task_assignments a where task_id=90790),(select row from upgrade_fixture.pre_task_assignment),'legacy Task assignment retains completion and approval history');
select is((select to_jsonb(a) from task_officer_assignments a where task_id=90790 and officer_id=90001),(select row from upgrade_fixture.pre_task_assignment),'canonical backfill preserves assignment and approval history');
select is((select to_jsonb(p) from point_transactions p where id=90790),(select row from upgrade_fixture.pre_task_award),'Task Point history and actor attribution survive the transition');
select is((select to_jsonb(a) from task_officer_assignments a where task_id=90680 and officer_id=90001),
  (select row from upgrade_fixture.recurring_assignment),
  'recurring assignment backfill retains completion and historical approval values');
select is((select starts_on::text||'/'||ends_on::text from event_series where id=90680),'2099-10-01/2099-10-02','existing Event series bounds backfilled');
select is((select starts_on::text||'/'||ends_on::text from task_series where id=90680),'2099-10-01/2099-10-02','existing Task series bounds backfilled');
select * from finish();
rollback;
