-- Used only by scripts/test-db-upgrade.mjs after a local reset to the PR 0 schema.
insert into auth.users(id) values ('20000000-0000-0000-0000-000000000001');
insert into officers(id,name,position_id,utep_email,personal_email,classification,status) values
  (90001,'Historical officer',(select id from positions where name='ICPC Lead'),'history@miners.utep.edu','history@example.org','graduate','inactive'),
  (90002,'Historical global officer',(select id from positions where name='Secretary'),null,'global@example.org',null,'active'),
  (90003,'Historical outreach lead',(select id from positions where name='Chief Outreach'),null,'outreach@example.org',null,'active');
insert into officer_branches(officer_id,branch_id) values (90001,1),(90001,2);
insert into events(id,name,type,starts_at,ends_at,status) values
  (90001,'Custom historical event',' Career Fair ','2026-09-20 09:00-06','2026-09-20 10:00-06','past'),
  (90002,'Same custom type','career fair','2026-09-20 11:00-06','2026-09-20 12:00-06','past'),
  (90003,'Seeded type variant',' WORKSHOP ','2027-09-20 09:00-06','2027-09-20 10:00-06','upcoming');
-- Legacy type labels do not make a timed historical Event disposable.
insert into events(id,name,type,starts_at,ends_at,status) values
  (90004,'Timed General history','General','2026-09-21 09:00-06','2026-09-21 10:00-06','past'),
  (90005,'Timed Intro history','Intro','2026-09-22 09:00-06','2026-09-22 10:00-06','past'),
  (90006,'Timed ICPC history','ICPC','2026-09-23 09:00-06','2026-09-23 10:00-06','past');
insert into event_branches(event_id,branch_id) values
  (90001,1),(90001,2),(90004,1),(90004,2),(90005,1),(90006,2);
insert into event_officers(event_id,officer_id) values
  (90001,90001),(90004,90001),(90005,90001),(90006,90001);
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,created_by) values
  (90001,90001,90001,2.5,'Historical participation','participation',null),
  (90002,90001,90001,-0.75,'Historical correction','correction','20000000-0000-0000-0000-000000000001');
-- Outside public: test-only snapshots, never an application migration/table.
create schema upgrade_fixture;
create table upgrade_fixture.officers as select to_jsonb(o) as original from officers o;
create table upgrade_fixture.events as select to_jsonb(e) as original from events e;
create table upgrade_fixture.points as select to_jsonb(p) as original from point_transactions p;
create table upgrade_fixture.officer_branches as select * from officer_branches;
create table upgrade_fixture.event_branches as select * from event_branches;
create table upgrade_fixture.event_officers as select * from event_officers;
