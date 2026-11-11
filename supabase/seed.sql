-- Synthetic local development data for Cappy Hub.
-- This file contains no production CIC data. A synthetic audit actor keeps
-- removed-record attribution valid; login-capable users are created separately.

begin;
select pg_catalog.set_config('cappy.seed_loading','on',true);

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000999','seed-history@cappy.test')
on conflict (id) do nothing;

update public.application_config
set participation_points_per_hour = 2.5,
    updated_at = now()
where id = 1;

insert into public.officers
  (id, name, utep_email, personal_email, position_id, classification, status, application_role)
values
  (-1001, 'Local Admin', 'admin@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'active', 'admin'),
  (-1002, 'Local President', 'president@cappy.test', null, (select id from public.positions where name = 'President'), 'senior', 'active', 'officer'),
  (-1003, 'Local VP Operations', 'vp-operations@cappy.test', null, (select id from public.positions where name = 'Vice President of Operations'), 'senior', 'active', 'officer'),
  (-1004, 'Local VP Academics', 'vp-academics@cappy.test', null, (select id from public.positions where name = 'Vice President of Academics'), 'senior', 'active', 'officer'),
  (-1005, 'Local Intro Lead', 'intro-lead@cappy.test', null, (select id from public.positions where name = 'Lead'), 'junior', 'active', 'officer'),
  (-1006, 'Local ICPC Lead', 'icpc-lead@cappy.test', null, (select id from public.positions where name = 'Lead'), 'junior', 'active', 'officer'),
  (-1007, 'Local Social Lead', 'social-lead@cappy.test', null, (select id from public.positions where name = 'Lead'), 'junior', 'active', 'officer'),
  (-1008, 'Local Outreach Lead', 'outreach-lead@cappy.test', null, (select id from public.positions where name = 'Lead'), 'junior', 'active', 'officer'),
  (-1009, 'Local Multi Branch Lead', 'multi-lead@cappy.test', null, (select id from public.positions where name = 'Lead'), 'senior', 'active', 'officer'),
  (-1010, 'Local Officer', 'officer@cappy.test', null, (select id from public.positions where name = 'Officer'), 'junior', 'active', 'officer'),
  (-1011, 'Local Inactive Officer', 'inactive@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'inactive', 'officer'),
  (-1012, 'Local Secretary', 'secretary@cappy.test', null, (select id from public.positions where name = 'Secretary'), 'senior', 'active', 'officer'),
  (-1013, 'Avery Chen', 'avery.chen@cappy.test', null, (select id from public.positions where name = 'Officer'), 'freshman', 'active', 'officer'),
  (-1014, 'Jordan Patel', 'jordan.patel@cappy.test', null, (select id from public.positions where name = 'Officer'), 'sophomore', 'active', 'officer'),
  (-1015, 'Taylor Morgan', 'taylor.morgan@cappy.test', null, (select id from public.positions where name = 'Officer'), 'junior', 'active', 'officer'),
  (-1016, 'Riley Garcia', 'riley.garcia@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'active', 'officer'),
  (-1017, 'Casey Nguyen', 'casey.nguyen@cappy.test', null, (select id from public.positions where name = 'Officer'), 'graduate', 'active', 'officer'),
  (-1018, 'Morgan Lee', 'morgan.lee@cappy.test', null, (select id from public.positions where name = 'Officer'), 'sophomore', 'active', 'officer'),
  (-1019, 'Jamie Rivera', 'jamie.rivera@cappy.test', null, (select id from public.positions where name = 'Officer'), 'freshman', 'active', 'officer'),
  (-1020, 'Alex Kim', 'alex.kim@cappy.test', null, (select id from public.positions where name = 'Officer'), 'junior', 'active', 'officer'),
  (-1021, 'Sam Wilson', 'sam.wilson@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'active', 'officer'),
  (-1022, 'Cameron Smith', 'cameron.smith@cappy.test', null, (select id from public.positions where name = 'Officer'), 'sophomore', 'active', 'officer'),
  (-1023, 'Drew Martinez', 'drew.martinez@cappy.test', null, (select id from public.positions where name = 'Officer'), 'junior', 'active', 'officer'),
  (-1024, 'Quinn Brown', 'quinn.brown@cappy.test', null, (select id from public.positions where name = 'Officer'), null, 'active', 'officer'),
  (-1025, 'Skylar Brooks', 'skylar.brooks@cappy.test', null, (select id from public.positions where name = 'Officer'), 'freshman', 'active', 'officer'),
  (-1026, 'Reese Carter', 'reese.carter@cappy.test', null, (select id from public.positions where name = 'Officer'), 'junior', 'active', 'officer'),
  (-1027, 'Finley Park', 'finley.park@cappy.test', null, (select id from public.positions where name = 'Officer'), 'graduate', 'active', 'officer'),
  (-1028, 'Rowan Ellis', 'rowan.ellis@cappy.test', null, (select id from public.positions where name = 'Officer'), 'sophomore', 'inactive', 'officer'),
  (-1029, 'Devon Bailey', 'devon.bailey@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'active', 'officer'),
  (-1030, 'Blair Thompson', 'blair.thompson@cappy.test', null, (select id from public.positions where name = 'Officer'), 'senior', 'active', 'officer'),
  (-1031, 'Kai Bennett', 'kai.bennett@cappy.test', null, (select id from public.positions where name = 'Officer'), 'sophomore', 'active', 'officer'),
  (-1032, 'Emery Diaz', 'emery.diaz@cappy.test', null, (select id from public.positions where name = 'Officer'), null, 'active', 'officer');

-- Dedicated Issue #402 synthetic Officers keep the new Points and Warning
-- scenarios easy to identify without changing the existing local accounts.
insert into public.officers(id,name,utep_email,position_id,classification,status,application_role)
values
  (-1201,'Mock: Two negative Points','negative-two@cappy.test',(select id from public.positions where name='Officer'),'junior','active','officer'),
  (-1202,'Mock: Automatic Warning group','negative-three@cappy.test',(select id from public.positions where name='Officer'),'junior','active','officer'),
  (-1203,'Mock: Two automatic Warning groups','negative-six@cappy.test',(select id from public.positions where name='Officer'),'senior','active','officer'),
  (-1204,'Mock: Warning limit with extra Points','warning-limit@cappy.test',(select id from public.positions where name='Officer'),'senior','active','officer'),
  (-1205,'Mock: Third Warning notification','warning-threshold@cappy.test',(select id from public.positions where name='Officer'),'senior','active','officer'),
  (-1206,'Mock: Mixed manual and automatic','warning-mixed@cappy.test',(select id from public.positions where name='Officer'),'junior','active','officer'),
  (-1207,'Mock: Negative Point leaderboard','negative-ranking@cappy.test',(select id from public.positions where name='Officer'),'freshman','active','officer');
insert into public.officer_branches(officer_id,branch_id)
select id,(select id from public.branches where name='general')
from public.officers where id between -1207 and -1201;

insert into public.officer_branches (officer_id, branch_id)
values
  (-1001, (select id from public.branches where name = 'general')),
  (-1005, (select id from public.branches where name = 'intro')),
  (-1006, (select id from public.branches where name = 'icpc')),
  (-1007, (select id from public.branches where name = 'social')),
  (-1008, (select id from public.branches where name = 'outreach')),
  (-1009, (select id from public.branches where name = 'intro')),
  (-1009, (select id from public.branches where name = 'general')),
  (-1010, (select id from public.branches where name = 'intro')),
  (-1010, (select id from public.branches where name = 'general')),
  (-1011, (select id from public.branches where name = 'general')),
  (-1013, (select id from public.branches where name = 'intro')),
  (-1014, (select id from public.branches where name = 'intro')),
  (-1015, (select id from public.branches where name = 'general')),
  (-1016, (select id from public.branches where name = 'icpc')),
  (-1017, (select id from public.branches where name = 'social')),
  (-1018, (select id from public.branches where name = 'social')),
  (-1019, (select id from public.branches where name = 'outreach')),
  (-1020, (select id from public.branches where name = 'outreach')),
  (-1021, (select id from public.branches where name = 'general')),
  (-1022, (select id from public.branches where name = 'icpc')),
  (-1023, (select id from public.branches where name = 'intro')),
  (-1023, (select id from public.branches where name = 'icpc')),
  (-1025, (select id from public.branches where name = 'general')),
  (-1025, (select id from public.branches where name = 'outreach')),
  (-1026, (select id from public.branches where name = 'general')),
  (-1026, (select id from public.branches where name = 'icpc')),
  (-1027, (select id from public.branches where name = 'outreach')),
  (-1028, (select id from public.branches where name = 'social')),
  (-1029, (select id from public.branches where name = 'general')),
  (-1030, (select id from public.branches where name = 'outreach')),
  (-1031, (select id from public.branches where name = 'icpc')),
  (-1032, (select id from public.branches where name = 'social'));

insert into public.event_series
  (id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values
  (-2201,'00000000-0000-4000-8000-000000002201',
   'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2',-1002,
   (now() at time zone 'America/Denver')::date+15,
   (now() at time zone 'America/Denver')::date+22),
  (-2202,'00000000-0000-4000-8000-000000002202',
   'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2',-1006,
   (now() at time zone 'America/Denver')::date+8,
   (now() at time zone 'America/Denver')::date+15),
  (-2203,'00000000-0000-4000-8000-000000002203',
   'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3',-1005,
   (now() at time zone 'America/Denver')::date+8,
   (now() at time zone 'America/Denver')::date+22);

insert into public.events
  (id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,participation_points_per_hour_at_end,deleted_at,deleted_by)
values
  (-2001,'Mock: Intro Arrays Workshop','Past timed workshop with participation awards.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 20,(((now() at time zone 'America/Denver')::date - 20 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 20 + time '19:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2002,'Mock: ICPC Practice Contest','Past ICPC practice.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date - 14,(((now() at time zone 'America/Denver')::date - 14 + time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 14 + time '13:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2003,'Mock: CIC Game Night','Past social event.',(select id from public.event_types where name='Social'),'Union East',(now() at time zone 'America/Denver')::date - 7,(((now() at time zone 'America/Denver')::date - 7 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 7 + time '20:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2004,'Mock: Workshop Planning Meeting','Past workshop planning meeting.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 5,(((now() at time zone 'America/Denver')::date - 5 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 5 + time '17:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2005,'Mock: Cancelled Meeting','Cancelled meeting.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202',(now() at time zone 'America/Denver')::date - 3,(((now() at time zone 'America/Denver')::date - 3 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 3 + time '18:00') at time zone 'America/Denver'),'cancelled',null,null,null),
  (-2006,'Mock: Removed Historical Workshop','Logically removed historical event.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 60,(((now() at time zone 'America/Denver')::date - 60 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 60 + time '17:30') at time zone 'America/Denver'),'past',2.5,now() - interval '50 days','00000000-0000-4000-8000-000000000999'),
  (-2010,'Mock: Intro Hash Maps','Upcoming intro Session.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 1,(((now() at time zone 'America/Denver')::date + 1 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 1 + time '19:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2011,'Mock: Officer Meeting','Upcoming general meeting.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202',(now() at time zone 'America/Denver')::date + 2,(((now() at time zone 'America/Denver')::date + 2 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 2 + time '19:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2012,'Mock: Career Fair','Global event with no branch associations.',(select id from public.event_types where name='Social'),'Union Building',(now() at time zone 'America/Denver')::date + 3,(((now() at time zone 'America/Denver')::date + 3 + time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 3 + time '14:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2013,'Mock: ICPC Dynamic Programming','Upcoming ICPC Session.',(select id from public.event_types where name='Session'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date + 4,(((now() at time zone 'America/Denver')::date + 4 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 4 + time '18:30') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2014,'Mock: Social Planning Meeting','Upcoming social planning meeting.',(select id from public.event_types where name='Meeting'),'Union East',(now() at time zone 'America/Denver')::date + 5,(((now() at time zone 'America/Denver')::date + 5 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 5 + time '17:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2015,'Mock: Outreach Tabling','Upcoming outreach event.',(select id from public.event_types where name='Social'),'Centennial Plaza',(now() at time zone 'America/Denver')::date + 6,(((now() at time zone 'America/Denver')::date + 6 + time '11:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 6 + time '13:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2016,'Mock: Intro and General Interview Night','Multi-branch event for scope testing.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 7,(((now() at time zone 'America/Denver')::date + 7 + time '17:30') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 7 + time '19:30') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2017,'Mock: Curriculum Meeting','Future global meeting.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 14,(((now() at time zone 'America/Denver')::date + 14 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 14 + time '17:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2018,'Mock: Social Mixer','Upcoming social event.',(select id from public.event_types where name='Social'),'Union East',(now() at time zone 'America/Denver')::date + 9,(((now() at time zone 'America/Denver')::date + 9 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 9 + time '20:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2019,'Mock: Cancelled Future Workshop','Future cancelled event.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 8,(((now() at time zone 'America/Denver')::date + 8 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 8 + time '18:00') at time zone 'America/Denver'),'cancelled',null,null,null);
insert into public.events
  (id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,participation_points_per_hour_at_end)
values
  (-2020,'Mock: Equal Slots Volunteer Fair','Three equal volunteer shifts with mixed capacities.',(select id from public.event_types where name='Workshop'),'Union Building',(now() at time zone 'America/Denver')::date+10,(((now() at time zone 'America/Denver')::date+10+time '09:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+10+time '12:00') at time zone 'America/Denver'),'upcoming',null),
  (-2021,'Mock: Custom Slots Outreach Booth','Custom shifts have a gap, a full slot, and remaining capacity.',(select id from public.event_types where name='Social'),'Centennial Plaza',(now() at time zone 'America/Denver')::date+11,(((now() at time zone 'America/Denver')::date+11+time '13:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+11+time '17:00') at time zone 'America/Denver'),'upcoming',null),
  (-2022,'Mock: Processed Slots Career Day','Historical slotted Event with separate awards per selected shift.',(select id from public.event_types where name='Meeting'),'Union Building',(now() at time zone 'America/Denver')::date-2,(((now() at time zone 'America/Denver')::date-2+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '14:00') at time zone 'America/Denver'),'past',2.5),
  (-2023,'Mock: Happening Officer Meeting','Happening status example for Dashboard and Event views.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202',(now() at time zone 'America/Denver')::date,(((now() at time zone 'America/Denver')::date+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+time '11:00') at time zone 'America/Denver'),'happening',null),
  (-2024,'Mock: Full Capacity Workshop','Each Time Slot is full; there is no Event-wide Max volunteers limit.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+12,(((now() at time zone 'America/Denver')::date+12+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+12+time '12:00') at time zone 'America/Denver'),'upcoming',null),
  (-2025,'Mock: Event Capacity Workshop','Unslotted Event with an Event-wide Max volunteers limit.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+13,(((now() at time zone 'America/Denver')::date+13+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+13+time '12:00') at time zone 'America/Denver'),'upcoming',null),
  (-2030,'Mock: Weekly Coding Workshop','First occurrence of an independently slotted weekly Event.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date+15,(((now() at time zone 'America/Denver')::date+15+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+15+time '18:00') at time zone 'America/Denver'),'upcoming',null),
  (-2031,'Mock: Weekly Coding Workshop','Following occurrence owns its own slots and selections.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date+22,(((now() at time zone 'America/Denver')::date+22+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+22+time '18:00') at time zone 'America/Denver'),'upcoming',null),
  (-2040,'Mock: Reminder Scope — All Occurrences','Synthetic recurring Event with shared reminder settings.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date+8,(((now() at time zone 'America/Denver')::date+8+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+8+time '17:00') at time zone 'America/Denver'),'upcoming',null),
  (-2041,'Mock: Reminder Scope — All Occurrences','Second occurrence shares the all-occurrences reminder settings.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date+15,(((now() at time zone 'America/Denver')::date+15+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+15+time '17:00') at time zone 'America/Denver'),'upcoming',null),
  (-2050,'Mock: Reminder Scope — This and Following','First occurrence keeps its own default reminders.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+8,(((now() at time zone 'America/Denver')::date+8+time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+8+time '18:00') at time zone 'America/Denver'),'upcoming',null),
  (-2051,'Mock: Reminder Scope — This and Following','Following occurrences share customized reminders.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+15,(((now() at time zone 'America/Denver')::date+15+time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+15+time '18:00') at time zone 'America/Denver'),'upcoming',null),
  (-2052,'Mock: Reminder Scope — This and Following','Following occurrences share customized reminders.',(select id from public.event_types where name='Session'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+22,(((now() at time zone 'America/Denver')::date+22+time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+22+time '18:00') at time zone 'America/Denver'),'upcoming',null);
insert into public.events(id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,participation_points_per_hour_at_end)
values
  (-2060,'Mock: Issue 402 Volunteer and Attendee awards','Completed two-hour Event. Volunteers earn 4 Points and Attendees earn 2 without an attendance check.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date-1,(((now() at time zone 'America/Denver')::date-1+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-1+time '12:00') at time zone 'America/Denver'),'past',2),
  (-2061,'Mock: Issue 402 choose Volunteer or Attend','Upcoming Event for trying either one-choice signup type.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date+5,(((now() at time zone 'America/Denver')::date+5+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+5+time '12:00') at time zone 'America/Denver'),'upcoming',null),
  (-2062,'Mock: Missed commitment — remove award','Separate synthetic case for removing the related positive participation award.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date-2,(((now() at time zone 'America/Denver')::date-2+time '13:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '14:00') at time zone 'America/Denver'),'past',1),
  (-2063,'Mock: Missed commitment — add negative Point','Separate synthetic case for adding one negative Point instead of removing an award.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date-2,(((now() at time zone 'America/Denver')::date-2+time '15:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '16:00') at time zone 'America/Denver'),'past',1);
update public.events set recurrence_series_id=-2201,
  recurrence_key=(now() at time zone 'America/Denver')::date+15 where id=-2030;
update public.events set recurrence_series_id=-2201,
  recurrence_key=(now() at time zone 'America/Denver')::date+22 where id=-2031;
update public.events set recurrence_series_id=-2202,
  recurrence_key=(now() at time zone 'America/Denver')::date+8 where id=-2040;
update public.events set recurrence_series_id=-2202,
  recurrence_key=(now() at time zone 'America/Denver')::date+15 where id=-2041;
update public.events set recurrence_series_id=-2203,
  recurrence_key=(now() at time zone 'America/Denver')::date+8 where id=-2050;
update public.events set recurrence_series_id=-2203,
  recurrence_key=(now() at time zone 'America/Denver')::date+15 where id=-2051;
update public.events set recurrence_series_id=-2203,
  recurrence_key=(now() at time zone 'America/Denver')::date+22 where id=-2052;
update public.events set max_volunteers=3 where id=-2025;
insert into public.event_branches (event_id, branch_id)
values
  (-2001, (select id from public.branches where name = 'intro')),
  (-2002, (select id from public.branches where name = 'icpc')),
  (-2003, (select id from public.branches where name = 'social')),
  (-2004, (select id from public.branches where name = 'general')),
  (-2005, (select id from public.branches where name = 'general')),
  (-2006, (select id from public.branches where name = 'general')),
  (-2010, (select id from public.branches where name = 'intro')),
  (-2011, (select id from public.branches where name = 'general')),
  (-2013, (select id from public.branches where name = 'icpc')),
  (-2014, (select id from public.branches where name = 'social')),
  (-2015, (select id from public.branches where name = 'outreach')),
  (-2016, (select id from public.branches where name = 'intro')),
  (-2016, (select id from public.branches where name = 'general')),
  (-2018, (select id from public.branches where name = 'social')),
  (-2019, (select id from public.branches where name = 'intro')),
  (-2020, (select id from public.branches where name = 'general')),
  (-2021, (select id from public.branches where name = 'outreach')),
  (-2022, (select id from public.branches where name = 'general')),
  (-2024, (select id from public.branches where name = 'intro')),
  (-2025, (select id from public.branches where name = 'general')),
  (-2030, (select id from public.branches where name = 'icpc')),
  (-2031, (select id from public.branches where name = 'icpc')),
  (-2040, (select id from public.branches where name = 'icpc')),
  (-2041, (select id from public.branches where name = 'icpc')),
  (-2050, (select id from public.branches where name = 'intro')),
  (-2051, (select id from public.branches where name = 'intro')),
  (-2052, (select id from public.branches where name = 'intro')),
  (-2060, (select id from public.branches where name = 'general')),
  (-2061, (select id from public.branches where name = 'general')),
  (-2062, (select id from public.branches where name = 'general')),
  (-2063, (select id from public.branches where name = 'general'));

insert into public.event_officers (event_id, officer_id)
values
  (-2001, -1010), (-2001, -1013), (-2001, -1014), (-2001, -1015),
  (-2002, -1006), (-2002, -1010), (-2002, -1016),
  (-2003, -1007), (-2003, -1017), (-2003, -1018),
  (-2004, -1004), (-2004, -1009), (-2004, -1013),
  (-2005, -1001), (-2005, -1015),
  (-2006, -1001), (-2006, -1010),
  (-2010, -1005), (-2010, -1010), (-2010, -1013), (-2010, -1014), (-2010, -1023),
  (-2011, -1001), (-2011, -1002), (-2011, -1003), (-2011, -1004), (-2011, -1012), (-2011, -1015),
  (-2012, -1001), (-2012, -1010), (-2012, -1013), (-2012, -1016), (-2012, -1019), (-2012, -1021),
  (-2013, -1006), (-2013, -1010), (-2013, -1016), (-2013, -1022), (-2013, -1023),
  (-2014, -1007), (-2014, -1017), (-2014, -1018),
  (-2015, -1008), (-2015, -1019), (-2015, -1020),
  (-2016, -1005), (-2016, -1009), (-2016, -1010), (-2016, -1013), (-2016, -1015), (-2016, -1021),
  (-2017, -1001), (-2017, -1002), (-2017, -1003), (-2017, -1004),
  (-2018, -1007), (-2018, -1017), (-2018, -1018), (-2018, -1024),
  (-2020, -1010), (-2020, -1025), (-2020, -1026), (-2020, -1030),
  (-2021, -1008), (-2021, -1027), (-2021, -1031),
  (-2022, -1025), (-2022, -1026),
  (-2023, -1002), (-2023, -1003), (-2023, -1012),
  (-2024, -1025), (-2024, -1026),
  (-2025, -1010),
  (-2030, -1006), (-2030, -1025),
  (-2031, -1026),
  (-2040, -1025), (-2041, -1025),
  (-2050, -1010), (-2051, -1010), (-2052, -1010),
  (-2060, -1201), (-2060, -1202),
  (-2062, -1207), (-2063, -1207);
update public.event_officers set participation_type='attendee' where event_id=-2060 and officer_id=-1202;
update public.events set participation_rate_version='volunteer_attendee' where id=-2060;

insert into public.event_time_slots (id,event_id,starts_at,ends_at,capacity)
values
  (-9201,-2020,(((now() at time zone 'America/Denver')::date+10+time '09:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+10+time '10:00') at time zone 'America/Denver'),3),
  (-9202,-2020,(((now() at time zone 'America/Denver')::date+10+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+10+time '11:00') at time zone 'America/Denver'),2),
  (-9203,-2020,(((now() at time zone 'America/Denver')::date+10+time '11:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+10+time '12:00') at time zone 'America/Denver'),null),
  (-9211,-2021,(((now() at time zone 'America/Denver')::date+11+time '13:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+11+time '14:30') at time zone 'America/Denver'),1),
  (-9212,-2021,(((now() at time zone 'America/Denver')::date+11+time '15:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+11+time '17:00') at time zone 'America/Denver'),3),
  (-9221,-2022,(((now() at time zone 'America/Denver')::date-2+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '11:00') at time zone 'America/Denver'),null),
  (-9222,-2022,(((now() at time zone 'America/Denver')::date-2+time '11:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '13:00') at time zone 'America/Denver'),null),
  (-9223,-2022,(((now() at time zone 'America/Denver')::date-2+time '13:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date-2+time '14:00') at time zone 'America/Denver'),null),
  (-9241,-2024,(((now() at time zone 'America/Denver')::date+12+time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+12+time '11:00') at time zone 'America/Denver'),1),
  (-9242,-2024,(((now() at time zone 'America/Denver')::date+12+time '11:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+12+time '12:00') at time zone 'America/Denver'),1),
  (-9301,-2030,(((now() at time zone 'America/Denver')::date+15+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+15+time '17:00') at time zone 'America/Denver'),3),
  (-9302,-2030,(((now() at time zone 'America/Denver')::date+15+time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+15+time '18:00') at time zone 'America/Denver'),null),
  (-9311,-2031,(((now() at time zone 'America/Denver')::date+22+time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+22+time '17:00') at time zone 'America/Denver'),3),
  (-9312,-2031,(((now() at time zone 'America/Denver')::date+22+time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date+22+time '18:00') at time zone 'America/Denver'),null);

insert into public.event_time_slot_officers(event_id,slot_id,officer_id)
values
  (-2020,-9201,-1010),(-2020,-9201,-1025),(-2020,-9201,-1026),
  (-2020,-9202,-1010),(-2020,-9202,-1026),(-2020,-9203,-1030),
  (-2021,-9211,-1008),(-2021,-9212,-1027),(-2021,-9212,-1031),
  (-2022,-9221,-1025),
  (-2022,-9222,-1025),(-2022,-9222,-1026),(-2022,-9223,-1025),
  (-2024,-9241,-1025),(-2024,-9242,-1026),
  (-2030,-9301,-1006),(-2030,-9301,-1025),(-2030,-9302,-1025),
  (-2031,-9311,-1026);

-- Synthetic Session slots demonstrate repeated difficulty and one Officer
-- holding multiple presentations, including an optional non-problem topic.
insert into public.presentation_slots
  (id, event_id, position, officer_id, presentation_title, resource_url, difficulty, prep_notes)
values
  (-9001, -2010, 1, -1013, 'Mock: Two Sum', 'https://example.org/problems/two-sum', 'Easy', 'Walk through the hash map approach.'),
  (-9002, -2010, 2, null, 'Mock: Group Anagrams', 'https://example.org/problems/group-anagrams', 'Medium', null),
  (-9003, -2010, 3, -1013, null, null, 'Medium', null),
  (-9004, -2013, 1, -1016, 'Interview preparation advice', null, null, 'Share practical interview tips.'),
  (-9005, -2013, 2, null, null, null, 'Nightmare', null);

insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at, removed_at, removed_by)
values
  (-4001, -1010, -2001, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 20 + time '19:01') at time zone 'America/Denver'), null, null),
  (-4002, -1013, -2001, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 20 + time '19:01') at time zone 'America/Denver'), null, null),
  (-4003, -1014, -2001, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 20 + time '19:01') at time zone 'America/Denver'), null, null),
  (-4004, -1015, -2001, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 20 + time '19:01') at time zone 'America/Denver'), null, null),
  (-4005, -1006, -2002, 7.5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 14 + time '13:01') at time zone 'America/Denver'), null, null),
  (-4006, -1010, -2002, 7.5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 14 + time '13:01') at time zone 'America/Denver'), null, null),
  (-4007, -1016, -2002, 7.5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 14 + time '13:01') at time zone 'America/Denver'), null, null),
  (-4008, -1007, -2003, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 7 + time '20:01') at time zone 'America/Denver'), null, null),
  (-4009, -1017, -2003, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 7 + time '20:01') at time zone 'America/Denver'), null, null),
  (-4010, -1018, -2003, 5, 'Mock timed participation', 'participation',
    (((now() at time zone 'America/Denver')::date - 7 + time '20:01') at time zone 'America/Denver'), null, null),
  (-4011, -1004, -2004, 8, 'Mock meeting participation', 'participation', now() - interval '4 days', null,null),
  (-4012, -1009, -2004, 8, 'Mock meeting participation', 'participation', now() - interval '4 days', null,null),
  (-4013, -1013, -2004, 8, 'Mock meeting participation', 'participation', now() - interval '4 days', null,null),
  (-4014, -1001, -2006, 3.75, 'Mock historical participation', 'participation', now() - interval '59 days', null,null),
  (-4015, -1010, -2006, 3.75, 'Mock historical participation', 'participation', now() - interval '59 days', now() - interval '40 days','00000000-0000-4000-8000-000000000999');
insert into public.point_transactions
  (id,officer_id,event_id,event_time_slot_id,points,reason,award_type,created_at,
   removed_at,removed_by,slot_selection_removed)
values
  (-4101,-1025,-2022,-9221,2.5,'Mock participation: one-hour slot','participation',now()-interval '2 days',null,null,false),
  (-4102,-1025,-2022,-9222,5,'Mock participation: two-hour slot','participation',now()-interval '2 days',null,null,false),
  (-4103,-1025,-2022,-9223,2.5,'Mock participation: final one-hour slot','participation',now()-interval '2 days',null,null,false),
  (-4104,-1026,-2022,-9221,2.5,'Mock removed slot selection','participation',now()-interval '2 days',now()-interval '1 day','00000000-0000-4000-8000-000000000999',true),
  (-4105,-1026,-2022,-9222,5,'Mock participation: selected two-hour slot','participation',now()-interval '2 days',null,null,false);
insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at, removed_at, removed_by)
select
  -5000 - gs,
  -1013 - ((gs - 1) % 12),
  case
    -- Keep a small number of linked Event manual awards while avoiding
    -- duplicate Officer/Event primary awards in the synthetic history.
    when gs <= 12 and gs % 4 = 0 then -2001
    when gs <= 12 and gs % 4 in (1, 2) then -2002
    else null
  end,
  case when gs % 11 = 0 then -2 else ((gs % 9) + 1)::numeric end,
  'Mock manual activity #' || gs,
  'manual',
  now() - ((gs % 210) || ' days')::interval - ((gs % 18) || ' hours')::interval,
  case when gs % 29 = 0 then now() - ((gs % 20) || ' days')::interval else null end,
  case when gs % 29 = 0 then '00000000-0000-4000-8000-000000000999'::uuid else null end
from generate_series(1, 240) as gs;

insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at)
select
  -6000 - gs,
  -1013 - ((gs - 1) % 12),
  null,
  case when gs % 2 = 0 then 1.5 else -1.5 end,
  'Mock correction #' || gs,
  'correction',
  now() - ((gs * 3 % 330) || ' days')::interval
from generate_series(1, 60) as gs;

insert into public.officer_warnings (id, officer_id, reason, status, created_at)
values
  (-3001, -1010, 'Mock pending warning for local approval testing.', 'pending', now() - interval '2 days'),
  (-3002, -1013, 'Mock approved warning.', 'approved', now() - interval '20 days'),
  (-3003, -1014, 'Mock rejected warning.', 'rejected', now() - interval '15 days'),
  (-3004, -1015, 'Mock approved warning one of three.', 'approved', now() - interval '90 days'),
  (-3005, -1015, 'Mock approved warning two of three.', 'approved', now() - interval '60 days'),
  (-3006, -1015, 'Mock approved warning three of three.', 'approved', now() - interval '30 days'),
  (-3007, -1025, 'Mock pending warning with all approvals open.', 'pending', now() - interval '1 day'),
  (-3008, -1026, 'Mock approved warning for a second Officer.', 'approved', now() - interval '12 days'),
  (-3009, -1032, 'Mock warning awaiting the remaining approvals.', 'pending', now() - interval '3 days'),
  (-3010, -1027, 'Mock voided warning retained for history.', 'approved', now() - interval '40 days');
update public.officer_warnings set voided_at=now()-interval '20 days',voided_by=-1001 where id=-3010;

insert into public.audit_logs (id, actor_id, action, entity_type, entity_id, details, created_at)
values
  (-7001, null, 'event.participation_awarded', 'event', '-2001',
    '{"source":"local-seed","note":"Synthetic system audit entry"}'::jsonb, now() - interval '20 days'),
  (-7002, null, 'event.participation_awarded', 'event', '-2002',
    '{"source":"local-seed","note":"Synthetic system audit entry"}'::jsonb, now() - interval '14 days'),
  (-7003, null, 'event.removed', 'event', '-2006',
    '{"source":"local-seed","note":"Synthetic removed-event history"}'::jsonb, now() - interval '50 days');

insert into public.tasks (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (-8001,'Make intro flyer','Prepare a flyer for the next intro workshop.','Flyer',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date+7,5,false,-1005),
  (-8002,'Write LinkedIn recap','Draft a recap for the club page.','LinkedIn',(select id from public.branches where name='general'),(now() at time zone 'America/Denver')::date+8,4,false,-1002),
  (-8003,'Update ICPC roster','Update the practice roster.','Airtable',(select id from public.branches where name='icpc'),(now() at time zone 'America/Denver')::date+3,3,false,-1006),
  (-8004,'Post social story','Create a story for the mixer.','Story',(select id from public.branches where name='social'),(now() at time zone 'America/Denver')::date+2,2,false,-1007),
  (-8005,'Publish workshop post','Prepare a post about the workshop.','Post',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date-2,6,false,-1005),
  (-8006,'Prepare outreach flyer','Design a flyer for outreach tabling.','Flyer',(select id from public.branches where name='outreach'),(now() at time zone 'America/Denver')::date+5,5,false,-1008),
  (-8007,'Past outreach checklist','Review the completed outreach checklist.','Airtable',(select id from public.branches where name='outreach'),(now() at time zone 'America/Denver')::date-4,4,false,-1008);
insert into public.task_officer_assignments
  (task_id,officer_id,assigned_by,completed_at)
values
  (-8003,-1016,-1006,null),
  (-8002,-1002,-1002,now()-interval '1 day'),
  (-8004,-1017,-1007,now()-interval '1 day'),
  (-8005,-1013,-1013,now()-interval '2 days'),
  (-8007,-1023,-1008,now()-interval '3 days'),
  (-8002,-1003,-1002,null),
  (-8007,-1022,-1008,null);
insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by_officer_id)
values
  (-1013,-8005,6,'Task completion: Publish workshop post','task',-1005),
  (-1023,-8007,4,'Task completion: Past outreach checklist','task',-1008);

insert into public.tasks (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (-8010,'Prepare volunteer sign-in sheet','Create a sign-in sheet for the volunteer fair.','Airtable',(select id from public.branches where name='general'),(now() at time zone 'America/Denver')::date+3,3,false,-1002),
  (-8011,'Draft outreach recap','Write a recap for the outreach booth.','Post',(select id from public.branches where name='outreach'),(now() at time zone 'America/Denver')::date+1,4,true,-1008),
  (-8012,'Refresh ICPC practice guide','Update the practice guide with new links.','Airtable',(select id from public.branches where name='icpc'),(now() at time zone 'America/Denver')::date-3,5,false,-1006),
  (-8013,'Promote coding workshop','Prepare social posts for the weekly workshop.','Story',(select id from public.branches where name='icpc'),(now() at time zone 'America/Denver')::date+10,2.5,false,-1006),
  (-8014,'Design career fair poster','Make a poster for the upcoming career fair.','Flyer',(select id from public.branches where name='general'),(now() at time zone 'America/Denver')::date-1,6,true,-1002),
  (-8015,'Review completion approval example','Prepare the workshop materials.','Flyer',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date+5,3,false,-1005);
insert into public.task_officer_assignments
  (task_id,officer_id,assigned_by,completed_at)
values
  (-8011,-1027,-1008,null),
  (-8012,-1031,-1006,now()-interval '1 day'),
  (-8013,-1025,-1006,null),
  (-8013,-1026,-1006,null),
  (-8013,-1032,-1006,null),
  (-8014,-1029,-1002,now()-interval '2 hours'),
  (-8015,-1013,-1005,now()-interval '2 hours');
update public.task_officer_assignments set completion_approval_pending=true
where task_id=-8015 and officer_id=-1013;
insert into public.point_transactions(officer_id,task_id,points,reason,award_type,created_by_officer_id)
values (-1031,-8012,5,'Task completion: Refresh ICPC practice guide','task',-1006);

-- Issue #402 fixtures: manual and automatic Warning origins, complete groups,
-- an incomplete group, the three-Warning cap, and extra ungrouped negatives.
insert into public.point_transactions(id,officer_id,event_id,task_id,points,reason,award_type,created_at)
values
  (-4511,-1201,null,-8001,-1,'Mock #402 negative linked to Task','negative',now()-interval '2 days'),
  (-4512,-1201,-2063,null,-1,'Mock #402 second negative Point','negative',now()-interval '1 day'),
  (-4521,-1202,-2060,null,-1,'Mock #402 group A point one','negative',now()-interval '6 days'),
  (-4522,-1202,null,-8001,-1,'Mock #402 group A point two','negative',now()-interval '5 days'),
  (-4523,-1202,null,-8002,-1,'Mock #402 group A point three','negative',now()-interval '4 days'),
  (-4531,-1203,null,-8001,-1,'Mock #402 first group point one','negative',now()-interval '12 days'),
  (-4532,-1203,null,-8002,-1,'Mock #402 first group point two','negative',now()-interval '11 days'),
  (-4533,-1203,null,-8003,-1,'Mock #402 first group point three','negative',now()-interval '10 days'),
  (-4534,-1203,null,-8004,-1,'Mock #402 second group point one','negative',now()-interval '9 days'),
  (-4535,-1203,null,-8005,-1,'Mock #402 second group point two','negative',now()-interval '8 days'),
  (-4536,-1203,null,-8006,-1,'Mock #402 second group point three','negative',now()-interval '7 days'),
  (-4541,-1204,null,-8001,-1,'Mock #402 over-limit point one','negative',now()-interval '4 days'),
  (-4542,-1204,null,-8002,-1,'Mock #402 over-limit point two','negative',now()-interval '3 days'),
  (-4543,-1204,null,-8003,-1,'Mock #402 over-limit point three','negative',now()-interval '2 days'),
  (-4544,-1204,null,-8004,-1,'Mock #402 extra point beyond Warning limit','negative',now()-interval '1 day'),
  (-4551,-1205,null,-8001,-1,'Mock #402 third-warning point one','negative',now()-interval '3 days'),
  (-4552,-1205,null,-8002,-1,'Mock #402 third-warning point two','negative',now()-interval '2 days'),
  (-4553,-1205,null,-8003,-1,'Mock #402 third-warning point three','negative',now()-interval '1 day'),
  (-4561,-1206,null,-8001,-1,'Mock #402 mixed warning point one','negative',now()-interval '2 days'),
  (-4562,-1206,null,-8002,-1,'Mock #402 mixed warning point two','negative',now()-interval '1 day'),
  (-4571,-1207,-2063,null,-1,'Mock #402 missed commitment: negative Point selected','negative',now()-interval '1 day'),
  (-4581,-1207,null,null,12,'Mock #402 leaderboard normal Points','manual',now()-interval '4 days');
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,created_at,removed_at,removed_by,removed_by_officer_id)
values (-4583,-1207,-2062,4,'Mock #402 missed commitment: positive award removed','participation',
  now()-interval '3 days',now()-interval '1 day','00000000-0000-4000-8000-000000000999',-1001);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,created_at)
values
  (-4590,-1201,-2060,4,'Mock #402 Volunteer participation: 2 Points per hour','participation',now()-interval '1 day'),
  (-4591,-1202,-2060,2,'Mock #402 Attendee participation: 1 Point per hour','participation',now()-interval '1 day');
insert into public.officer_warnings(id,officer_id,reason,status,created_at,origin)
values
  (-3201,-1202,'Mock #402 automatic Warning from three linked negative Points','approved',now()-interval '4 days','automatic'),
  (-3202,-1203,'Mock #402 automatic Warning group one','approved',now()-interval '10 days','automatic'),
  (-3203,-1203,'Mock #402 automatic Warning group two','approved',now()-interval '7 days','automatic'),
  (-3204,-1204,'Mock #402 manual Warning one of three','approved',now()-interval '30 days','manual'),
  (-3205,-1204,'Mock #402 manual Warning two of three','approved',now()-interval '20 days','manual'),
  (-3206,-1204,'Mock #402 manual Warning three of three','approved',now()-interval '10 days','manual'),
  (-3207,-1205,'Mock #402 manual Warning one','approved',now()-interval '30 days','manual'),
  (-3208,-1205,'Mock #402 manual Warning two','approved',now()-interval '20 days','manual'),
  (-3209,-1205,'Mock #402 automatic third Warning','approved',now()-interval '1 day','automatic'),
  (-3210,-1206,'Mock #402 manual Warning paired with two negatives','approved',now()-interval '5 days','manual');
update public.officer_warnings set deleted_at=now()-interval '1 day',deleted_by=-1001 where id=-3207;
insert into public.automatic_warning_point_links(warning_id,point_transaction_id)
values
  (-3201,-4521),(-3201,-4522),(-3201,-4523),
  (-3202,-4531),(-3202,-4532),(-3202,-4533),
  (-3203,-4534),(-3203,-4535),(-3203,-4536),
  (-3209,-4551),(-3209,-4552),(-3209,-4553);

-- Recurring reminder settings show the saved result of each edit scope:
-- one occurrence, this-and-following occurrences, and all occurrences.
insert into public.task_series
  (id,request_key,recurrence_rule,created_by,starts_on,ends_on)
values
  (-2301,'00000000-0000-4000-8000-000000002301','RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2',-1006,(now() at time zone 'America/Denver')::date+5,(now() at time zone 'America/Denver')::date+12),
  (-2302,'00000000-0000-4000-8000-000000002302','RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3',-1006,(now() at time zone 'America/Denver')::date+8,(now() at time zone 'America/Denver')::date+22),
  (-2303,'00000000-0000-4000-8000-000000002303','RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2',-1005,(now() at time zone 'America/Denver')::date+10,(now() at time zone 'America/Denver')::date+17);
insert into public.tasks
  (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by,recurrence_series_id,recurrence_key)
values
  (-8301,'Mock: Reminder Scope — This Occurrence','Only this occurrence has a custom reminder.','Post',(select id from public.branches where name='icpc'),(now() at time zone 'America/Denver')::date+5,1,false,-1006,-2301,(now() at time zone 'America/Denver')::date+5),
  (-8302,'Mock: Reminder Scope — This Occurrence','Following occurrence keeps the shared default reminder.','Post',(select id from public.branches where name='icpc'),(now() at time zone 'America/Denver')::date+12,1,false,-1006,-2301,(now() at time zone 'America/Denver')::date+12),
  (-8303,'Mock: Reminder Scope — This and Following','First occurrence keeps the shared default reminder.','Post',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date+8,1,false,-1006,-2302,(now() at time zone 'America/Denver')::date+8),
  (-8304,'Mock: Reminder Scope — This and Following','Selected and following occurrences share a custom reminder.','Post',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date+15,1,false,-1006,-2302,(now() at time zone 'America/Denver')::date+15),
  (-8305,'Mock: Reminder Scope — This and Following','Selected and following occurrences share a custom reminder.','Post',(select id from public.branches where name='intro'),(now() at time zone 'America/Denver')::date+22,1,false,-1006,-2302,(now() at time zone 'America/Denver')::date+22),
  (-8310,'Mock: Reminder Scope — All Occurrences','Every occurrence shares the same custom reminder.','Story',(select id from public.branches where name='social'),(now() at time zone 'America/Denver')::date+10,1,false,-1007,-2303,(now() at time zone 'America/Denver')::date+10),
  (-8311,'Mock: Reminder Scope — All Occurrences','Every occurrence shares the same custom reminder.','Story',(select id from public.branches where name='social'),(now() at time zone 'America/Denver')::date+17,1,false,-1007,-2303,(now() at time zone 'America/Denver')::date+17);
insert into public.task_officer_assignments(task_id,officer_id,assigned_by)
values
  (-8301,-1025,-1006),(-8302,-1025,-1006),
  (-8303,-1010,-1006),(-8304,-1010,-1006),(-8305,-1010,-1006),
  (-8310,-1017,-1007),(-8311,-1017,-1007);

-- Academic-period scenarios are synthetic and fixed so the same four views
-- remain available after every local reset. Ranges are inclusive and adjacent.
insert into public.academic_periods (id,name,starts_on,ends_on)
values
  (-5004,'Winter 2025','2025-12-01','2026-01-10'),
  (-5003,'Spring 2026','2026-01-11','2026-05-15'),
  (-5002,'Summer 2026','2026-05-16','2026-08-15'),
  (-5001,'Fall 2026','2026-08-16','2026-12-20');

insert into public.officers
  (id,name,utep_email,personal_email,position_id,classification,status,application_role)
values
  (-1101,'Winter Demo Officer','winter.demo@cappy.test',null,(select id from public.positions where name='Officer'),'senior','inactive','officer'),
  (-1102,'Spring Demo Officer','spring.demo@cappy.test',null,(select id from public.positions where name='Officer'),'junior','active','officer'),
  (-1103,'Summer Demo Officer','summer.demo@cappy.test',null,(select id from public.positions where name='Officer'),'sophomore','active','officer'),
  (-1104,'Fall Demo Officer','fall.demo@cappy.test',null,(select id from public.positions where name='Officer'),'freshman','active','officer');

insert into public.officer_branches (officer_id,branch_id)
values
  (-1101,(select id from public.branches where name='general')),
  (-1102,(select id from public.branches where name='intro')),
  (-1103,(select id from public.branches where name='social')),
  (-1104,(select id from public.branches where name='icpc'));

insert into public.events
  (id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,participation_points_per_hour_at_end)
values
  (-2101,'Demo: Winter 2025 Showcase','Synthetic event for historical period browsing.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202','2025-12-10',('2025-12-10 17:00'::timestamp at time zone 'America/Denver'),('2025-12-10 18:00'::timestamp at time zone 'America/Denver'),'past',1),
  (-2102,'Demo: Spring 2026 Workshop','Synthetic event for historical period browsing.',(select id from public.event_types where name='Workshop'),'CCSB G.0208','2026-04-15',('2026-04-15 17:00'::timestamp at time zone 'America/Denver'),('2026-04-15 19:00'::timestamp at time zone 'America/Denver'),'past',1),
  (-2103,'Demo: Summer 2026 Social','Synthetic event for historical period browsing.',(select id from public.event_types where name='Social'),'Union East','2026-07-10',('2026-07-10 18:00'::timestamp at time zone 'America/Denver'),('2026-07-10 20:00'::timestamp at time zone 'America/Denver'),'past',1),
  (-2104,'Demo: Fall 2026 Session','Synthetic event for current-period browsing.',(select id from public.event_types where name='Session'),'CCSB 1.0410','2026-10-15',('2026-10-15 17:00'::timestamp at time zone 'America/Denver'),('2026-10-15 19:00'::timestamp at time zone 'America/Denver'),'past',1);

insert into public.event_branches (event_id,branch_id)
values
  (-2101,(select id from public.branches where name='general')),
  (-2102,(select id from public.branches where name='intro')),
  (-2103,(select id from public.branches where name='social')),
  (-2104,(select id from public.branches where name='icpc'));
insert into public.event_officers (event_id,officer_id)
values (-2101,-1101),(-2102,-1102),(-2103,-1103),(-2104,-1104);

insert into public.tasks
  (id,title,description,task_type,branch_id,due_date,points,approval_required,created_by)
values
  (-3101,'Winter 2025 report','Synthetic completed task for period history.','Post',(select id from public.branches where name='general'),'2025-12-18',3,false,-1001),
  (-3102,'Spring 2026 workshop flyer','Synthetic task for period history.','Flyer',(select id from public.branches where name='intro'),'2026-04-20',4,false,-1005),
  (-3103,'Summer 2026 social recap','Synthetic task for period history.','Story',(select id from public.branches where name='social'),'2026-07-20',2,false,-1007),
  (-3104,'Fall 2026 practice guide','Synthetic task for current period.','Airtable',(select id from public.branches where name='icpc'),'2026-10-20',5,false,-1006);
insert into public.task_officer_assignments (task_id,officer_id,assigned_by,completed_at)
values
  (-3101,-1101,-1001,'2025-12-18 18:00-07'),
  (-3102,-1102,-1005,'2026-04-20 18:00-06'),
  (-3103,-1103,-1007,'2026-07-20 18:00-06'),
  (-3104,-1104,-1006,'2026-10-20 18:00-06');
insert into public.point_transactions
  (id,officer_id,event_id,points,reason,award_type,created_at)
values
  (-7101,-1101,-2101,1,'Demo: Winter participation','participation','2025-12-10 18:01-07'),
  (-7102,-1102,-2102,2,'Demo: Spring participation','participation','2026-04-15 19:01-06'),
  (-7103,-1103,-2103,2,'Demo: Summer participation','participation','2026-07-10 20:01-06'),
  (-7104,-1104,-2104,2,'Demo: Fall participation','participation','2026-10-15 19:01-06');
insert into public.point_transactions
  (id,officer_id,task_id,points,reason,award_type,created_at,created_by_officer_id)
values
  (-7201,-1101,-3101,3,'Demo: Winter task completion','task','2025-12-18 18:01-07',-1001),
  (-7202,-1102,-3102,4,'Demo: Spring task completion','task','2026-04-20 18:01-06',-1005),
  (-7203,-1103,-3103,2,'Demo: Summer task completion','task','2026-07-20 18:01-06',-1007),
  (-7204,-1104,-3104,5,'Demo: Fall task completion','task','2026-10-20 18:01-06',-1006);

-- Issue #403: personal in-app history, audience configuration, shared
-- reminders, and Dashboard action states. These fixtures remain synthetic.
update public.tasks set due_time='15:00' where id=-8013;
insert into public.event_notification_targets(event_id,all_active,branch_id,position_id)
values
  (-2010,false,(select id from public.branches where name='intro'),null),
  (-2010,false,null,(select id from public.positions where code='lead')),
  (-2012,true,null,null),
  (-2030,false,null,(select id from public.positions where code='lead')),
  (-2031,false,(select id from public.branches where name='icpc'),null),
  (-2040,false,(select id from public.branches where name='icpc'),null),
  (-2041,false,(select id from public.branches where name='icpc'),null),
  (-2050,false,(select id from public.branches where name='intro'),null),
  (-2051,false,(select id from public.branches where name='intro'),null),
  (-2052,false,(select id from public.branches where name='intro'),null);
insert into public.event_reminder_offsets(event_id,minutes_before)
values (-2010,1440),(-2010,60),(-2012,120),(-2030,30),(-2031,1440);
insert into public.event_reminder_offsets(event_id,minutes_before)
values
  (-2040,60),(-2041,60),
  (-2050,1440),(-2050,60),(-2051,120),(-2052,120);
insert into public.task_notification_targets(task_id,all_active,branch_id,position_id)
values
  (-8001,true,null,null),
  (-8002,false,(select id from public.branches where name='general'),null),
  (-8002,false,null,(select id from public.positions where code='officer')),
  (-8003,false,null,(select id from public.positions where code='lead')),
  (-8013,false,(select id from public.branches where name='icpc'),null),
  (-8301,false,null,(select id from public.positions where code='officer')),
  (-8302,false,null,(select id from public.positions where code='officer')),
  (-8303,false,(select id from public.branches where name='intro'),null),
  (-8304,false,(select id from public.branches where name='intro'),null),
  (-8305,false,(select id from public.branches where name='intro'),null);
insert into public.task_reminder_offsets(task_id,minutes_before)
values (-8001,1440),(-8002,1440),(-8011,60),(-8011,15),(-8013,120);
insert into public.task_reminder_offsets(task_id,minutes_before)
values
  (-8301,30),(-8302,1440),
  (-8303,1440),(-8304,120),(-8305,120),
  (-8310,60),(-8311,60);

insert into public.notifications
  (recipient_officer_id,kind,title,message,entity_type,entity_id,href,priority,created_at,read_at,reviewed_at,dedupe_key)
values
  (-1010,'event.created','New Event: Mock: Intro Hash Maps','Tomorrow · CCSB G.0208','event',-2010,'/events/-2010','important',now()-interval '2 minutes',null,null,'seed403:event.created:2010:1010'),
  (-1010,'event.changed','Event updated: Mock: Intro Hash Maps','The date or location changed.','event',-2010,'/events/-2010','important',now()-interval '1 hour',now()-interval '55 minutes',null,'seed403:event.changed:2010:1010'),
  (-1010,'event.signup','Event signup confirmed','Mock: Intro Hash Maps','event',-2010,'/events/-2010','confirmation',now()-interval '3 hours',now()-interval '2 hours',null,'seed403:event.signup:2010:1010'),
  (-1010,'event.reminder','Event reminder: Mock: Intro Hash Maps','Tomorrow','event',-2010,'/events/-2010','important',now()-interval '4 hours',null,null,'seed403:event.reminder:2010:1010'),
  (-1010,'task.assigned','Task assigned: Make intro flyer','You have a Task to complete.','task',-8001,'/tasks/-8001','important',now()-interval '5 hours',null,null,'seed403:task.assigned:8001:1010'),
  (-1010,'task.reminder','Task reminder: Make intro flyer','Due soon','task',-8001,'/tasks/-8001','important',now()-interval '1 day',null,null,'seed403:task.reminder:8001:1010'),
  (-1010,'point.changed','Points updated','5 Points','point',-4001,'/points','important',now()-interval '2 days',now()-interval '2 days',null,'seed403:point.changed:4001:1010'),
  (-1010,'warning.changed','Warning updated','A Warning on your record changed.','warning',-3001,'/officers/-1010','important',now()-interval '3 days',null,null,'seed403:warning.changed:3001:1010'),
  (-1027,'warning.changed','Warning removed','A Warning was removed from your record.','warning',-3010,'/officers/-1027','important',now()-interval '4 days',now()-interval '3 days',null,'seed403:warning.removed:3010:1027'),
  (-1001,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3006,'/officers/-1015','important',now()-interval '1 day',null,null,'seed403:warning.threshold:3006:1001'),
  (-1001,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1001'),
  (-1002,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1002'),
  (-1003,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1003'),
  (-1004,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1004'),
  (-1005,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1005'),
  (-1006,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1006'),
  (-1007,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1007'),
  (-1008,'warning.threshold','Officer reached 3 active Warnings','Review the Officer record.','warning',-3209,'/officers/-1205','important',now()-interval '20 hours',null,null,'seed402:warning.threshold:3209:1008'),
  (-1005,'task.completed','Task completed: Refresh ICPC practice guide','An Officer completed a Task for your Branch.','task',-8003,'/tasks/-8003','important',now()-interval '6 hours',null,null,'seed403:task.completed:8003:1005'),
  (-1013,'task.changed','Task updated: Draft outreach recap','The Task details or due date changed.','task',-8011,'/tasks/-8011','important',now()-interval '7 hours',now()-interval '6 hours',null,'seed403:task.changed:8011:1013'),
  (-1013,'task.completion_rejected','Completion not approved: Review completion approval example','A Lead or Admin did not approve this completion. You can mark the Task complete again when it is done.','task',-8015,'/tasks/-8015','important',now()-interval '8 hours',null,null,'seed433:task.completion_rejected:8015:1013'),
  (-1001,'event.cancelled','Event cancelled: Mock: Cancelled Meeting','The Event was cancelled.','event',-2005,'/events/-2005','important',now()-interval '10 days',null,null,'seed403:event.cancelled:2005:1001'),
  (-1026,'point.changed','Points removed','2.5 Points','point',-4104,'/points','important',now()-interval '5 days',null,null,'seed403:point.removed:4104:1026'),
  (-1010,'event.left','Event signup removed','Mock: Cancelled Meeting','event',-2005,'/events/-2005','confirmation',now()-interval '15 days',now()-interval '14 days',null,'seed403:event.left:2005:1010');

update public.notifications set reviewed_at=read_at
where dedupe_key='seed403:event.changed:2010:1010';

commit;
