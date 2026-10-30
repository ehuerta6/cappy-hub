begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000033701','catalog-admin@example.test'),
 ('00000000-0000-4000-8000-000000033702','catalog-officer@example.test'),
 ('00000000-0000-4000-8000-000000033703','catalog-inactive@example.test'),
 ('00000000-0000-4000-8000-000000033704','catalog-unlinked@example.test');
insert into positions(id,name,is_active) values(-33701,'Historical custom Position',true),(-33702,'Legacy retired Position',false);
insert into branches(id,name,is_active) values(-33701,'Historical catalog Branch',true),(-33702,'Legacy retired Branch',false);
insert into event_types(id,name,available_for_new_events) values(-33701,'Historical catalog Type',true),(-33702,'Legacy unavailable Type',false);
insert into event_locations(id,name) values(-33701,'Historical catalog Location');
insert into officers(id,name,utep_email,position_id,application_role,status,auth_user_id) values
 (-33701,'Catalog Admin','catalog-admin@example.test',(select id from positions where code='officer'),'admin','active','00000000-0000-4000-8000-000000033701'),
 (-33702,'Catalog Officer','catalog-officer@example.test',-33701,'officer','active','00000000-0000-4000-8000-000000033702'),
 (-33703,'Inactive Catalog Admin','catalog-inactive@example.test',(select id from positions where code='officer'),'admin','inactive','00000000-0000-4000-8000-000000033703');
insert into officer_branches(officer_id,branch_id) values(-33702,-33701);
insert into events(id,name,description,event_type_id,location,event_date,starts_at,ends_at)
 values(-33701,'Historical catalog Event','Synthetic history',-33701,'Historical catalog Location','2099-09-20','2099-09-20 09:00-06','2099-09-20 10:00-06');
insert into event_branches(event_id,branch_id) values(-33701,-33701);
insert into tasks(id,title,description,task_type,branch_id,due_date,points,created_by)
 values(-33701,'Historical catalog Task','Synthetic history','Flyer',-33701,'2099-09-20',3,-33701);
create temp table catalog_before as select
 (select to_jsonb(e) from events e where id=-33701) event_row,
 (select to_jsonb(t) from tasks t where id=-33701) task_row,
 (select to_jsonb(o) from officers o where id=-33702) officer_row;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033701',true);
set local role authenticated;
select lives_ok($$select delete_position(-33701)$$,'Admin deletes referenced custom Position recoverably');
select lives_ok($$select delete_branch(-33701)$$,'Admin deletes referenced Branch recoverably');
select lives_ok($$select delete_event_type(-33701)$$,'Admin deletes referenced Event Type recoverably');
select lives_ok($$select delete_event_location(-33701)$$,'Admin deletes referenced location recoverably');
select is((select is_active from positions where id=-33701),false,'Position retained as unavailable');
select is((select is_active from branches where id=-33701),false,'Branch retained as unavailable');
select is((select available_for_new_events from event_types where id=-33701),false,'Event Type retained as unavailable');
select is((select is_active from event_locations where id=-33701),false,'Location retained as unavailable');
select lives_ok($$select delete_branch(-33701);select delete_position(-33701);select delete_event_type(-33701);select delete_event_location(-33701)$$,'exact Delete retries are safe');
reset role;
select is((select count(*) from audit_logs where action in ('position.deleted','branch.deleted','event_type.deleted','event_location.deleted') and actor_officer_id=-33701),4::bigint,'each material Delete audited once with Admin attribution');
select is((select to_jsonb(e) from events e where id=-33701),(select event_row from catalog_before),'Delete never mutates historical Event/FK/text');
select is((select to_jsonb(t) from tasks t where id=-33701),(select task_row from catalog_before),'Delete never mutates historical Task');
select is((select to_jsonb(o) from officers o where id=-33702),(select officer_row from catalog_before),'Delete never mutates Officer identity or role');
select is((select branch_id from officer_branches where officer_id=-33702),-33701::bigint,'Officer membership retained');
select is((select branch_id from event_branches where event_id=-33701),-33701::bigint,'Event branch retained');
set local role authenticated;
select throws_ok($$select create_event_location('Historical catalog Location')$$,'P0001','Location is deleted; restore it instead','create cannot silently restore deleted suggestion');
select throws_ok($$select save_event_with_signup_sheet('New retired type','Synthetic',-33701,'TBA','2099-09-20','2099-09-20 11:00-06','2099-09-20 12:00-06','{}'::bigint[],'',null,null,null)$$,'P0001','Invalid event type','deleted Type cannot be newly related');
select throws_ok($$select save_task('New retired Branch','Synthetic','Flyer',-33701,'2099-09-20',3,false)$$,'P0001','Invalid or retired branch','deleted Branch cannot be newly related');
select throws_ok($$select save_officer('New retired Position',-33701,'active','{}'::bigint[],null,'new-catalog@example.test',null,null)$$,'P0001','Invalid or retired position','deleted Position cannot be newly related');
select lives_ok($$select save_event_with_signup_sheet('Corrected catalog Event','Unrelated correction',-33701,'Historical catalog Location','2099-09-20','2099-09-20 09:00-06','2099-09-20 10:00-06',array[-33701]::bigint[],'',-33701,null,null)$$,'unrelated Event edit retains existing deleted Type/Branch/location');
select lives_ok($$select save_event_with_signup_sheet('Free text location','Synthetic',(select id from event_types where name='Meeting'),'Historical catalog Location','2099-09-20','2099-09-20 13:00-06','2099-09-20 14:00-06','{}'::bigint[],'',null,null,null)$$,'new Event may still use valid free-text location');
select is((select location_id from events where name='Free text location'),null::bigint,'free text never newly attaches deleted suggestion');
select is((select is_active from event_locations where id=-33701),false,'Event location synchronization never restores deleted value');
select lives_ok($$select restore_position(-33701);select restore_branch(-33701);select restore_event_type(-33701);select restore_event_location(-33701)$$,'Admin restores the same referenced catalog rows');
select lives_ok($$select restore_position(-33701);select restore_branch(-33701);select restore_event_type(-33701);select restore_event_location(-33701)$$,'Restore retries are idempotent');
select lives_ok($$select restore_position(-33702);select restore_branch(-33702);select restore_event_type(-33702)$$,'legacy retired/unavailable rows remain explicitly recoverable');
select is((select code from positions where id=-33702),null::text,'restoring a custom Position cannot invent a machine code');
select throws_ok($$select delete_position((select id from positions where code='lead'))$$,'P0001','Required positions cannot be deleted','required Position identity stays protected');
select throws_ok($$select restore_position((select id from positions where code='lead'))$$,'P0001','Required positions cannot be deleted','Restore never modifies required system Position');
select lives_ok($$select create_event_type('New configurable Type')$$,'new manageable Event Type is available immediately');
select is((select available_for_new_events from event_types where name='New configurable Type'),true,'new Event Type is eligible for new Events');
select lives_ok($$select delete_event_type((select id from event_types where name='New configurable Type'))$$,'unreferenced values also use recoverable Delete');
select lives_ok($$select restore_event_type((select id from event_types where name='New configurable Type'))$$,'unreferenced value retains stable identity for Restore');
reset role;
select is((select count(*) from audit_logs where action in ('position.restored','branch.restored','event_type.restored','event_location.restored') and actor_officer_id=-33701),8::bigint,'material Restores audit once including legacy recovery');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033702',true);
set local role authenticated;
select throws_ok($$select delete_branch(-33701)$$,'P0001','Admin required','ordinary Officer cannot Delete catalogs');
select throws_ok($$select restore_event_type(-33701)$$,'P0001','Admin required','ordinary Officer cannot Restore catalogs');
select throws_ok($$update branches set is_active=false where id=-33701$$,'42501','permission denied for table branches','direct table writes remain denied');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033703',true);
set local role authenticated;
select throws_ok($$select restore_branch(-33701)$$,'P0001','Admin required','inactive Admin cannot Restore');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033704',true);
set local role authenticated;
select throws_ok($$select create_event_type('Unlinked Type')$$,'P0001','Admin required','unlinked authenticated account cannot mutate');
reset role;
set local role anon;
select throws_ok($$select restore_event_location(-33701)$$,'42501','permission denied for function restore_event_location','anonymous Restore denied');
reset role;
-- Existing Session identity restrictions stay in force; no Presenter changes.
insert into events(id,name,description,event_type_id,location,event_date,starts_at,ends_at)
 values(-33710,'Session identity control','Synthetic existing behavior',
 (select id from event_types where lower(name)='session'),'TBA','2099-09-20',
 '2099-09-20 15:00-06','2099-09-20 16:00-06');
insert into presentation_slots(event_id,position) values(-33710,1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033701',true);
set local role authenticated;
select throws_ok($$select rename_event_type((select id from event_types where lower(name)='session'),'Renamed Session')$$,
 'P0001','Cannot rename the Session Event Type while presenter slots exist','manageable Event Types preserve existing Session guard');
reset role;
create function pg_temp.reject_catalog_audit() returns trigger language plpgsql as $$begin
 if new.action='branch.deleted' then raise exception 'Synthetic catalog audit failure'; end if;return new;end;$$;
create trigger reject_catalog_audit before insert on audit_logs for each row execute function pg_temp.reject_catalog_audit();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000033701',true);
set local role authenticated;
select throws_ok($$select delete_branch(-33701)$$,'P0001','Synthetic catalog audit failure','Delete and audit roll back atomically');
select is((select is_active from branches where id=-33701),true,'failed Delete preserves active catalog state');
reset role;
select * from finish();
rollback;
