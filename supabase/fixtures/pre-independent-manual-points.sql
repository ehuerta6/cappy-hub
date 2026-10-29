-- Synthetic predecessor rows exercise the #326 compatibility classes. Never
-- load production rows here. The forward migration must preserve them exactly.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000032701','upgrade-manual-admin@example.test');
insert into public.officers(id,name,utep_email,position_id,status,application_role,auth_user_id)
 values(92301,'Manual upgrade Admin','upgrade-manual-admin@example.test',
 (select id from public.positions where name='Officer'),'active','admin',
 '00000000-0000-4000-8000-000000032701');
insert into public.events(id,name,description,location,event_type_id,starts_at,ends_at,
 participation_points_per_hour_at_end,status) values
 (92301,'Edited automatic history','Synthetic','Campus',(select id from public.event_types where name='Meeting'),'2020-01-01 09:00-07','2020-01-01 11:00-07',1.25,'past'),
 (92302,'Removed automatic history','Synthetic','Campus',(select id from public.event_types where name='Meeting'),'2020-01-02 09:00-07','2020-01-02 11:00-07',2.5,'past'),
 (92303,'Manual slotted history','Synthetic','Campus',(select id from public.event_types where name='Meeting'),'2020-01-03 09:00-07','2020-01-03 11:00-07',null,'cancelled');
insert into public.event_officers(event_id,officer_id) values(92301,92301),(92302,92301),(92303,92301);
insert into public.event_time_slots(id,event_id,starts_at,ends_at)
 select 92303,id,starts_at,ends_at from public.events where id=92303;
insert into public.event_time_slot_officers(event_id,slot_id,officer_id) values(92303,92303,92301);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type)
 values(92301,92301,92301,2.5,'Synthetic automatic history','participation'),
 (92302,92301,92302,5,'Synthetic premature award; intent requires separate evidence','participation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000032701',false);
select public.update_point_transaction(92301,7);
select public.remove_participation_award(92302);
select public.add_manual_transaction(92301,3,'Manual after removal','manual',92302);
select public.add_manual_transaction(92301,-1,'Independent correction','correction',92301);
select public.add_manual_transaction(92301,-2,'Standalone deduction','manual');
select public.add_manual_transaction(92301,4,'Legacy slotted manual','manual',92303);
update public.events set deleted_at=now(),deleted_by=auth.uid() where id=92303;
select set_config('request.jwt.claim.sub','',false);

create table upgrade_fixture.pre_independent_manual_points as
 select id,to_jsonb(p) original from public.point_transactions p;
create table upgrade_fixture.pre_independent_manual_audit as
 select id,to_jsonb(a) original from public.audit_logs a;
create table upgrade_fixture.pre_independent_manual_events as
 select id,to_jsonb(e) original from public.events e;
create table upgrade_fixture.pre_independent_manual_signups as
 select to_jsonb(eo) original from public.event_officers eo;
create table upgrade_fixture.pre_independent_manual_slots as
 select to_jsonb(s) original from public.event_time_slot_officers s;
