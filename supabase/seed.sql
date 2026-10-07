-- Synthetic local development data for Cappy Hub.
-- This file contains no production CIC data. A synthetic audit actor keeps
-- removed-record attribution valid; login-capable users are created separately.

begin;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000999','seed-history@cappy.test');

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
  (-1024, 'Quinn Brown', 'quinn.brown@cappy.test', null, (select id from public.positions where name = 'Officer'), null, 'active', 'officer');

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
  (-1023, (select id from public.branches where name = 'icpc'));

insert into public.events
  (id,name,description,event_type_id,location,event_date,starts_at,ends_at,status,participation_points_per_hour_at_end,deleted_at,deleted_by)
values
  (-2001,'Mock: Intro Arrays Workshop','Past timed workshop with participation awards.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 20,(((now() at time zone 'America/Denver')::date - 20 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 20 + time '19:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2002,'Mock: ICPC Practice Contest','Past ICPC practice.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date - 14,(((now() at time zone 'America/Denver')::date - 14 + time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 14 + time '13:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2003,'Mock: CIC Game Night','Past social event.',(select id from public.event_types where name='Social'),'Union East',(now() at time zone 'America/Denver')::date - 7,(((now() at time zone 'America/Denver')::date - 7 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 7 + time '20:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2004,'Mock: Workshop Planning Meeting','Past workshop planning meeting.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 5,(((now() at time zone 'America/Denver')::date - 5 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 5 + time '17:00') at time zone 'America/Denver'),'past',2.5,null,null),
  (-2005,'Mock: Cancelled Meeting','Cancelled meeting.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202',(now() at time zone 'America/Denver')::date - 3,(((now() at time zone 'America/Denver')::date - 3 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 3 + time '18:00') at time zone 'America/Denver'),'cancelled',null,null,null),
  (-2006,'Mock: Removed Historical Workshop','Logically removed historical event.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date - 60,(((now() at time zone 'America/Denver')::date - 60 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date - 60 + time '17:30') at time zone 'America/Denver'),'past',2.5,now() - interval '50 days','00000000-0000-4000-8000-000000000999'),
  (-2010,'Mock: Intro Hash Maps','Upcoming intro workshop.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 1,(((now() at time zone 'America/Denver')::date + 1 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 1 + time '19:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2011,'Mock: Officer Meeting','Upcoming general meeting.',(select id from public.event_types where name='Meeting'),'CCSB 1.0202',(now() at time zone 'America/Denver')::date + 2,(((now() at time zone 'America/Denver')::date + 2 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 2 + time '19:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2012,'Mock: Career Fair','Global event with no branch associations.',(select id from public.event_types where name='Social'),'Union Building',(now() at time zone 'America/Denver')::date + 3,(((now() at time zone 'America/Denver')::date + 3 + time '10:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 3 + time '14:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2013,'Mock: ICPC Dynamic Programming','Upcoming ICPC practice.',(select id from public.event_types where name='Workshop'),'CCSB 1.0410',(now() at time zone 'America/Denver')::date + 4,(((now() at time zone 'America/Denver')::date + 4 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 4 + time '18:30') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2014,'Mock: Social Planning Meeting','Upcoming social planning meeting.',(select id from public.event_types where name='Meeting'),'Union East',(now() at time zone 'America/Denver')::date + 5,(((now() at time zone 'America/Denver')::date + 5 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 5 + time '17:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2015,'Mock: Outreach Tabling','Upcoming outreach event.',(select id from public.event_types where name='Social'),'Centennial Plaza',(now() at time zone 'America/Denver')::date + 6,(((now() at time zone 'America/Denver')::date + 6 + time '11:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 6 + time '13:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2016,'Mock: Intro and General Interview Night','Multi-branch event for scope testing.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 7,(((now() at time zone 'America/Denver')::date + 7 + time '17:30') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 7 + time '19:30') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2017,'Mock: Curriculum Meeting','Future global meeting.',(select id from public.event_types where name='Meeting'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 14,(((now() at time zone 'America/Denver')::date + 14 + time '16:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 14 + time '17:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2018,'Mock: Social Mixer','Upcoming social event.',(select id from public.event_types where name='Social'),'Union East',(now() at time zone 'America/Denver')::date + 9,(((now() at time zone 'America/Denver')::date + 9 + time '18:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 9 + time '20:00') at time zone 'America/Denver'),'upcoming',null,null,null),
  (-2019,'Mock: Cancelled Future Workshop','Future cancelled event.',(select id from public.event_types where name='Workshop'),'CCSB G.0208',(now() at time zone 'America/Denver')::date + 8,(((now() at time zone 'America/Denver')::date + 8 + time '17:00') at time zone 'America/Denver'),(((now() at time zone 'America/Denver')::date + 8 + time '18:00') at time zone 'America/Denver'),'cancelled',null,null,null);
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
  (-2019, (select id from public.branches where name = 'intro'));

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
  (-2018, -1007), (-2018, -1017), (-2018, -1018), (-2018, -1024);

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
  (-3006, -1015, 'Mock approved warning three of three.', 'approved', now() - interval '30 days');

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

commit;
