-- =============================================================================
-- Synthetic local development data for Cappy Hub
-- =============================================================================
-- Contains NO production CIC data. Login-capable Auth users are created
-- separately by `scripts/setup-local-dev.mjs` (`npm run local:setup` / `local:reset`).

begin;
select pg_catalog.set_config('cappy.seed_loading','on',true);

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000999','seed-history@cappy.test')
on conflict (id) do nothing;

update public.application_config
set participation_points_per_hour = 2.5,
    updated_at = now()
where id = 1;

-- =============================================================================
-- Negative ID map (keeps synthetic rows separate from identity sequences):
--   -1001 .. -1012  Local login accounts (linked by setup-local-dev.mjs)
--   -1013 .. -1022  Club roster Officers (varied branches, classes, active/inactive)
--   -1201 .. -1207  Dedicated Negative Point & Automatic Warning scenario Officers
--   -2001 .. -2063  Events (past, happening, upcoming, slotted, recurring, cancelled, deleted)
--   -2101 .. -2104  Historical Academic Period Events
--   -2201 .. -2203  Recurring Event series
--   -2301 .. -2303  Recurring Task series
--   -3001 .. -3010  Legacy approval-era / voided Warnings
--   -3101 .. -3104  Historical Academic Period Tasks
--   -3201 .. -3210  Manual & Automatic Warnings (Issue #402 lifecycles)
--   -4001 .. -4591  Participation & Negative Point transactions
--   -5001 .. -5014  Manual Point transactions (and Academic Periods -5004..-5001)
--   -6001 .. -6004  Point corrections
--   -7001 .. -7204  Audit logs & Academic Period Point transactions
--   -8001 .. -8311  Tasks (open, assigned, overdue, no-longer-needed, deleted, recurring)
--   -9001 .. -9312  Historical presentation slots & Volunteer Time Slots
--   -9501 .. -9510  Event & Task Resource Links
-- =============================================================================

-- =============================================================================
-- 1. Academic Periods (Fixed, inclusive, adjacent ranges)
-- =============================================================================

insert into public.academic_periods (id, name, starts_on, ends_on)
values
  (-5004, 'Winter 2025', '2025-12-01', '2026-01-10'),
  (-5003, 'Spring 2026', '2026-01-11', '2026-05-15'),
  (-5002, 'Summer 2026', '2026-05-16', '2026-08-15'),
  (-5001, 'Fall 2026',   '2026-08-16', '2026-12-20');

-- =============================================================================
-- 2. Officers & Branch Memberships
-- =============================================================================

with officer_seed (id, name, utep_email, personal_email, position_name, classification, status, application_role) as (
  values
    -- Local login accounts (linked by scripts/setup-local-dev.mjs)
    (-1001, 'Local Admin',             'admin@cappy.test',         'admin.personal@cappy.test',     'Officer',                      'senior', 'active',   'admin'),
    (-1002, 'Local President',         'president@cappy.test',     'president.personal@cappy.test', 'President',                    'senior', 'active',   'officer'),
    (-1003, 'Local VP Operations',     'vp-operations@cappy.test', null,                            'Vice President of Operations', 'senior', 'active',   'officer'),
    (-1004, 'Local VP Academics',      'vp-academics@cappy.test',  null,                            'Vice President of Academics',  'senior', 'active',   'officer'),
    (-1005, 'Local Intro Lead',        'intro-lead@cappy.test',    'intro.lead@cappy.test',         'Lead',                         'junior', 'active',   'officer'),
    (-1006, 'Local ICPC Lead',         'icpc-lead@cappy.test',     null,                            'Lead',                         'junior', 'active',   'officer'),
    (-1007, 'Local Social Lead',       'social-lead@cappy.test',   null,                            'Lead',                         'junior', 'active',   'officer'),
    (-1008, 'Local Outreach Lead',     'outreach-lead@cappy.test', null,                            'Lead',                         'junior', 'active',   'officer'),
    (-1009, 'Local Multi Branch Lead', 'multi-lead@cappy.test',    null,                            'Lead',                         'senior', 'active',   'officer'),
    (-1010, 'Local Officer',           'officer@cappy.test',       'officer.personal@cappy.test',   'Officer',                      'junior', 'active',   'officer'),
    (-1011, 'Local Inactive Officer',  'inactive@cappy.test',      null,                            'Officer',                      'senior', 'inactive', 'officer'),
    (-1012, 'Local Secretary',         'secretary@cappy.test',     null,                            'Secretary',                    'senior', 'active',   'officer'),

    -- Club roster Officers (varied classifications, branches, and personal emails)
    (-1013, 'Avery Chen',    'avery.chen@cappy.test',    'avery.personal@cappy.test',  'Officer', 'freshman',  'active',   'officer'),
    (-1014, 'Jordan Patel',  'jordan.patel@cappy.test',  null,                         'Officer', 'sophomore', 'active',   'officer'),
    (-1015, 'Taylor Morgan', 'taylor.morgan@cappy.test', null,                         'Officer', 'junior',    'active',   'officer'),
    (-1016, 'Riley Garcia',  'riley.garcia@cappy.test',  'riley.personal@cappy.test',  'Officer', 'senior',    'active',   'officer'),
    (-1017, 'Casey Nguyen',  'casey.nguyen@cappy.test',  null,                         'Officer', 'graduate',  'active',   'officer'),
    (-1018, 'Morgan Lee',    'morgan.lee@cappy.test',    null,                         'Officer', 'sophomore', 'active',   'officer'),
    (-1019, 'Jamie Rivera',  'jamie.rivera@cappy.test',  'jamie.personal@cappy.test',  'Officer', 'freshman',  'active',   'officer'),
    (-1020, 'Alex Kim',      'alex.kim@cappy.test',      null,                         'Officer', 'junior',    'active',   'officer'),
    (-1021, 'Sam Wilson',    'sam.wilson@cappy.test',    null,                         'Officer', null,        'active',   'officer'),
    (-1022, 'Rowan Ellis',   'rowan.ellis@cappy.test',   'rowan.personal@cappy.test',  'Officer', 'sophomore', 'inactive', 'officer'),

    -- Dedicated Negative Point & Automatic Warning scenario Officers (Issue #402)
    (-1201, 'Mock: Two negative Points',             'negative-two@cappy.test',      null, 'Officer', 'junior',   'active', 'officer'),
    (-1202, 'Mock: Automatic Warning group',         'negative-three@cappy.test',    null, 'Officer', 'junior',   'active', 'officer'),
    (-1203, 'Mock: Two automatic Warning groups',    'negative-six@cappy.test',      null, 'Officer', 'senior',   'active', 'officer'),
    (-1204, 'Mock: Warning limit with extra Points', 'warning-limit@cappy.test',     null, 'Officer', 'senior',   'active', 'officer'),
    (-1205, 'Mock: Third Warning notification',      'warning-threshold@cappy.test', null, 'Officer', 'senior',   'active', 'officer'),
    (-1206, 'Mock: Mixed manual and automatic',      'warning-mixed@cappy.test',     null, 'Officer', 'junior',   'active', 'officer'),
    (-1207, 'Mock: Negative Point leaderboard',      'negative-ranking@cappy.test',  null, 'Officer', 'freshman', 'active', 'officer')
)
insert into public.officers
  (id, name, utep_email, personal_email, position_id, classification, status, application_role)
select
  s.id, s.name, s.utep_email, s.personal_email, p.id, s.classification, s.status, s.application_role
from officer_seed s
join public.positions p on p.name = s.position_name;

with branch_seed (officer_id, branch_name) as (
  values
    (-1001, 'general'),
    (-1005, 'intro'),
    (-1006, 'icpc'),
    (-1007, 'social'),
    (-1008, 'outreach'),
    (-1009, 'intro'),    (-1009, 'general'),
    (-1010, 'intro'),    (-1010, 'general'),
    (-1011, 'general'),
    (-1013, 'intro'),
    (-1014, 'intro'),
    (-1015, 'general'),
    (-1016, 'icpc'),
    (-1017, 'social'),
    (-1018, 'social'),
    (-1019, 'outreach'),
    (-1020, 'outreach'),
    (-1021, 'general'),  (-1021, 'icpc'),
    (-1022, 'social'),
    (-1201, 'general'),  (-1202, 'general'), (-1203, 'general'), (-1204, 'general'),
    (-1205, 'general'),  (-1206, 'general'), (-1207, 'general')
)
insert into public.officer_branches (officer_id, branch_id)
select s.officer_id, b.id
from branch_seed s
join public.branches b on b.name = s.branch_name;

-- =============================================================================
-- 3. Events & Recurring Event Series
-- =============================================================================

with base as (
  select (now() at time zone 'America/Denver')::date as today
)
insert into public.event_series (id, request_key, recurrence_rule, created_by, starts_on, ends_on)
select
  s.id, s.request_key, s.recurrence_rule, s.created_by, base.today + s.start_off, base.today + s.end_off
from base,
(values
  (-2201, '00000000-0000-4000-8000-000000002201'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2', -1002, 15, 22),
  (-2202, '00000000-0000-4000-8000-000000002202'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2', -1006, 8,  15),
  (-2203, '00000000-0000-4000-8000-000000002203'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3', -1005, 8,  22)
) as s(id, request_key, recurrence_rule, created_by, start_off, end_off);

-- 3a. Relative-date Events (past, happening, upcoming, cancelled, deleted, slotted, recurring)
with base as (
  select (now() at time zone 'America/Denver')::date as today
),
event_seed (
  id, name, description, type_name, location, day_off, start_t, end_t,
  status, rate_at_end, rate_ver, max_vol, series_id, del_at, del_by
) as (
  values
    -- Past, cancelled & soft-deleted Events
    (-2001, 'Mock: Intro Arrays Workshop',                  'Past timed workshop with participation awards.',                                      'Workshop', 'CCSB G.0208',      -20, time '17:00', time '19:00', 'past',      2.5::numeric, null,                 null::int, null::bigint, null::timestamptz,          null::uuid),
    (-2002, 'Mock: ICPC Practice Contest',                  'Past ICPC practice contest.',                                                         'Workshop', 'CCSB 1.0410',      -14, time '10:00', time '13:00', 'past',      2.5,          null,                 null,      null,         null,                       null),
    (-2003, 'Mock: CIC Game Night',                         'Past social event.',                                                                  'Social',   'Union East',       -7,  time '18:00', time '20:00', 'past',      2.5,          null,                 null,      null,         null,                       null),
    (-2005, 'Mock: Cancelled Meeting',                      'Historical cancelled meeting.',                                                       'Meeting',  'CCSB 1.0202',      -3,  time '17:00', time '18:00', 'cancelled', null,         null,                 null,      null,         null,                       null),
    (-2006, 'Mock: Removed Historical Workshop',            'Soft-deleted Event for Deleted view & Restore testing.',                              'Workshop', 'CCSB G.0208',      -45, time '16:00', time '17:30', 'past',      2.5,          null,                 null,      null,         now() - interval '35 days', '00000000-0000-4000-8000-000000000999'::uuid),
    (-2022, 'Mock: Processed Slots Career Day',             'Past slotted Event with per-shift awards and one removed selection.',                 'Meeting',  'Union Building',   -2,  time '10:00', time '14:00', 'past',      2.5,          null,                 null,      null,         null,                       null),
    (-2060, 'Mock: Volunteer & Attendee Awards',            'Completed two-hour Event: Volunteers earn 4 pts (2/hr), Attendees earn 2 pts (1/hr).', 'Workshop', 'CCSB G.0208',     -1,  time '10:00', time '12:00', 'past',      2.0,          'volunteer_attendee', null,      null,         null,                       null),
    (-2062, 'Mock: Missed commitment — remove award',       'Separate past Event for removing a positive participation award.',                    'Meeting',  'CCSB G.0208',      -2,  time '13:00', time '14:00', 'past',      1.0,          null,                 null,      null,         null,                       null),
    (-2063, 'Mock: Missed commitment — add negative Point', 'Separate past Event for adding a -1 negative Point.',                                 'Meeting',  'CCSB G.0208',      -2,  time '15:00', time '16:00', 'past',      1.0,          null,                 null,      null,         null,                       null),

    -- Happening & upcoming ordinary / capacity / slotted / recurring Events
    (-2023, 'Mock: Happening Officer Meeting',              'Happening today for Dashboard and Event status views.',                               'Meeting',  'CCSB 1.0202',       0,  time '10:00', time '11:00', 'happening', null,         null,                 null,      null,         null,                       null),
    (-2010, 'Mock: Intro Hash Maps',                        'Upcoming Intro Session with resource links and linked Task.',                         'Session',  'CCSB G.0208',       1,  time '17:00', time '19:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2011, 'Mock: Officer Meeting',                        'Upcoming general Officer meeting with slides & meeting notes.',                       'Meeting',  'CCSB 1.0202',       2,  time '18:00', time '19:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2012, 'Mock: Career Fair',                            'Global Event (no branch associations) with all-active notification audience.',        'Social',   'Union Building',    3,  time '10:00', time '14:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2013, 'Mock: ICPC Dynamic Programming',               'Upcoming ICPC Session with linked roster Task.',                                      'Session',  'CCSB 1.0410',       4,  time '16:00', time '18:30', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2061, 'Mock: Choose Volunteer or Attend',             'Upcoming Event for trying the one-choice Volunteer (2/hr) or Attend (1/hr) signup.',  'Workshop', 'CCSB G.0208',       5,  time '10:00', time '12:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2015, 'Mock: Outreach Tabling',                       'Upcoming outreach Event with a synthetic Google Calendar sync failure.',              'Social',   'Centennial Plaza',  6,  time '11:00', time '13:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2016, 'Mock: Intro & General Interview Night',        'Multi-branch Event for branch-scope testing.',                                        'Session',  'CCSB G.0208',       7,  time '17:30', time '19:30', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2020, 'Mock: Equal Slots Volunteer Fair',             'Three equal 1-hour shifts (capacities: 3, 2, unlimited).',                            'Workshop', 'Union Building',   10,  time '09:00', time '12:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2021, 'Mock: Custom Slots Outreach Booth',            'Custom shifts with a 30-minute gap, one full shift, and one open shift.',             'Social',   'Centennial Plaza', 11,  time '13:00', time '17:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2024, 'Mock: Full Capacity Workshop',                 'Both Time Slots are full; no Event-wide Max volunteers limit.',                       'Workshop', 'CCSB G.0208',      12,  time '10:00', time '12:00', 'upcoming',  null,         null,                 null,      null,         null,                       null),
    (-2025, 'Mock: Event Capacity Workshop',                'Unslotted Event with Event-wide Max volunteers = 3.',                                 'Workshop', 'CCSB G.0208',      13,  time '10:00', time '12:00', 'upcoming',  null,         null,                 3,         null,         null,                       null),
    (-2030, 'Mock: Weekly Coding Workshop',                 'First occurrence of an independently slotted weekly Event.',                          'Workshop', 'CCSB 1.0410',      15,  time '16:00', time '18:00', 'upcoming',  null,         null,                 null,      -2201,        null,                       null),
    (-2031, 'Mock: Weekly Coding Workshop',                 'Second occurrence owns independent Time Slots and signups.',                          'Workshop', 'CCSB 1.0410',      22,  time '16:00', time '18:00', 'upcoming',  null,         null,                 null,      -2201,        null,                       null),
    (-2040, 'Mock: Reminder Scope — All Occurrences',       'Recurring Event with shared reminder settings across all occurrences.',               'Workshop', 'CCSB 1.0410',       8,  time '16:00', time '17:00', 'upcoming',  null,         null,                 null,      -2202,        null,                       null),
    (-2041, 'Mock: Reminder Scope — All Occurrences',       'Second occurrence shares all-occurrences reminder settings.',                         'Workshop', 'CCSB 1.0410',      15,  time '16:00', time '17:00', 'upcoming',  null,         null,                 null,      -2202,        null,                       null),
    (-2050, 'Mock: Reminder Scope — This and Following',    'First occurrence keeps default reminders.',                                           'Session',  'CCSB G.0208',       8,  time '17:00', time '18:00', 'upcoming',  null,         null,                 null,      -2203,        null,                       null),
    (-2051, 'Mock: Reminder Scope — This and Following',    'Following occurrences share customized reminders.',                                   'Session',  'CCSB G.0208',      15,  time '17:00', time '18:00', 'upcoming',  null,         null,                 null,      -2203,        null,                       null),
    (-2052, 'Mock: Reminder Scope — This and Following',    'Following occurrences share customized reminders.',                                   'Session',  'CCSB G.0208',      22,  time '17:00', time '18:00', 'upcoming',  null,         null,                 null,      -2203,        null,                       null)
)
insert into public.events (
  id, name, description, event_type_id, location, event_date, starts_at, ends_at,
  status, participation_points_per_hour_at_end, participation_rate_version,
  max_volunteers, recurrence_series_id, recurrence_key, deleted_at, deleted_by
)
select
  s.id, s.name, s.description, et.id, s.location,
  base.today + s.day_off,
  ((base.today + s.day_off + s.start_t) at time zone 'America/Denver'),
  ((base.today + s.day_off + s.end_t)   at time zone 'America/Denver'),
  s.status, s.rate_at_end, s.rate_ver, s.max_vol,
  s.series_id,
  case when s.series_id is not null then base.today + s.day_off else null end,
  s.del_at, s.del_by
from base
cross join event_seed s
join public.event_types et on et.name = s.type_name;

-- 3b. Historical Academic Period Events
with period_events (id, name, description, type_name, location, event_date, start_ts, end_ts) as (
  values
    (-2101, 'Demo: Winter 2025 Showcase', 'Historical period browsing example.',                       'Meeting',  'CCSB 1.0202', date '2025-12-10', '2025-12-10 17:00'::timestamp, '2025-12-10 18:00'::timestamp),
    (-2102, 'Demo: Spring 2026 Workshop', 'Historical period browsing example.',                       'Workshop', 'CCSB G.0208', date '2026-04-15', '2026-04-15 17:00'::timestamp, '2026-04-15 19:00'::timestamp),
    (-2103, 'Demo: Summer 2026 Social',   'Historical period browsing example.',                       'Social',   'Union East',  date '2026-07-10', '2026-07-10 18:00'::timestamp, '2026-07-10 20:00'::timestamp),
    (-2104, 'Demo: Fall 2026 Session',    'Past Session with read-only historical presentation rows.', 'Session',  'CCSB 1.0410', date '2026-10-15', '2026-10-15 17:00'::timestamp, '2026-10-15 19:00'::timestamp)
)
insert into public.events
  (id, name, description, event_type_id, location, event_date, starts_at, ends_at, status, participation_points_per_hour_at_end)
select
  s.id, s.name, s.description, et.id, s.location, s.event_date,
  (s.start_ts at time zone 'America/Denver'),
  (s.end_ts   at time zone 'America/Denver'),
  'past', 1
from period_events s
join public.event_types et on et.name = s.type_name;

with event_branch_seed (event_id, branch_name) as (
  values
    (-2001, 'intro'),    (-2002, 'icpc'),    (-2003, 'social'),
    (-2005, 'general'),  (-2006, 'general'), (-2010, 'intro'),
    (-2011, 'general'),  (-2013, 'icpc'),    (-2015, 'outreach'),
    (-2016, 'intro'),    (-2016, 'general'), (-2020, 'general'),
    (-2021, 'outreach'), (-2022, 'general'), (-2024, 'intro'),
    (-2025, 'general'),  (-2030, 'icpc'),    (-2031, 'icpc'),
    (-2040, 'icpc'),     (-2041, 'icpc'),    (-2050, 'intro'),
    (-2051, 'intro'),    (-2052, 'intro'),   (-2060, 'general'),
    (-2061, 'general'),  (-2062, 'general'), (-2063, 'general'),
    (-2101, 'general'),  (-2102, 'intro'),   (-2103, 'social'),
    (-2104, 'icpc')
)
insert into public.event_branches (event_id, branch_id)
select s.event_id, b.id
from event_branch_seed s
join public.branches b on b.name = s.branch_name;

-- Synthetic Google Calendar sync failure for testing the manager recovery banner
insert into public.event_calendar_sync_failures (event_id, failed_at)
values (-2015, now() - interval '3 hours');

-- =============================================================================
-- 4. Event Signups, Volunteer Time Slots & Historical Presentation Rows
-- =============================================================================

insert into public.event_officers (event_id, officer_id, participation_type)
values
  (-2001, -1010, 'volunteer'), (-2001, -1013, 'volunteer'), (-2001, -1014, 'volunteer'), (-2001, -1015, 'volunteer'),
  (-2002, -1006, 'volunteer'), (-2002, -1010, 'volunteer'), (-2002, -1016, 'volunteer'),
  (-2003, -1007, 'volunteer'), (-2003, -1017, 'volunteer'), (-2003, -1018, 'attendee'),
  (-2005, -1001, 'volunteer'), (-2005, -1015, 'volunteer'),
  (-2006, -1001, 'volunteer'), (-2006, -1010, 'volunteer'),
  (-2010, -1005, 'volunteer'), (-2010, -1010, 'volunteer'), (-2010, -1013, 'volunteer'), (-2010, -1014, 'attendee'),
  (-2011, -1001, 'volunteer'), (-2011, -1002, 'volunteer'), (-2011, -1003, 'volunteer'), (-2011, -1004, 'volunteer'), (-2011, -1012, 'volunteer'),
  (-2012, -1001, 'volunteer'), (-2012, -1010, 'volunteer'), (-2012, -1013, 'attendee'),  (-2012, -1016, 'volunteer'), (-2012, -1019, 'volunteer'),
  (-2013, -1006, 'volunteer'), (-2013, -1010, 'attendee'),  (-2013, -1016, 'volunteer'), (-2013, -1021, 'volunteer'),
  (-2015, -1008, 'volunteer'), (-2015, -1019, 'volunteer'), (-2015, -1020, 'volunteer'),
  (-2016, -1005, 'volunteer'), (-2016, -1009, 'volunteer'), (-2016, -1010, 'volunteer'), (-2016, -1013, 'volunteer'),
  (-2020, -1010, 'volunteer'), (-2020, -1013, 'volunteer'), (-2020, -1015, 'volunteer'), (-2020, -1019, 'volunteer'),
  (-2021, -1008, 'volunteer'), (-2021, -1019, 'volunteer'), (-2021, -1020, 'volunteer'),
  (-2022, -1013, 'volunteer'), (-2022, -1016, 'volunteer'),
  (-2023, -1002, 'volunteer'), (-2023, -1003, 'volunteer'), (-2023, -1010, 'attendee'),  (-2023, -1012, 'volunteer'),
  (-2024, -1013, 'volunteer'), (-2024, -1014, 'volunteer'),
  (-2025, -1010, 'volunteer'),
  (-2030, -1006, 'volunteer'), (-2030, -1016, 'volunteer'),
  (-2031, -1021, 'volunteer'),
  (-2040, -1016, 'volunteer'), (-2041, -1016, 'volunteer'),
  (-2050, -1010, 'volunteer'), (-2051, -1010, 'volunteer'), (-2052, -1010, 'volunteer'),
  (-2060, -1201, 'volunteer'), (-2060, -1202, 'attendee'),
  (-2062, -1207, 'volunteer'), (-2063, -1207, 'volunteer'),
  (-2101, -1022, 'volunteer'), (-2102, -1013, 'volunteer'), (-2103, -1017, 'volunteer'), (-2104, -1016, 'volunteer');

with base as (
  select (now() at time zone 'America/Denver')::date as today
)
insert into public.event_time_slots (id, event_id, starts_at, ends_at, capacity)
select
  s.id, s.event_id,
  ((base.today + s.day_off + s.start_t) at time zone 'America/Denver'),
  ((base.today + s.day_off + s.end_t)   at time zone 'America/Denver'),
  s.capacity
from base,
(values
  (-9201, -2020, 10, time '09:00', time '10:00', 3::int),
  (-9202, -2020, 10, time '10:00', time '11:00', 2),
  (-9203, -2020, 10, time '11:00', time '12:00', null),
  (-9211, -2021, 11, time '13:00', time '14:30', 1),
  (-9212, -2021, 11, time '15:00', time '17:00', 3),
  (-9221, -2022, -2, time '10:00', time '11:00', null),
  (-9222, -2022, -2, time '11:00', time '13:00', null),
  (-9223, -2022, -2, time '13:00', time '14:00', null),
  (-9241, -2024, 12, time '10:00', time '11:00', 1),
  (-9242, -2024, 12, time '11:00', time '12:00', 1),
  (-9301, -2030, 15, time '16:00', time '17:00', 3),
  (-9302, -2030, 15, time '17:00', time '18:00', null),
  (-9311, -2031, 22, time '16:00', time '17:00', 3),
  (-9312, -2031, 22, time '17:00', time '18:00', null)
) as s(id, event_id, day_off, start_t, end_t, capacity);

insert into public.event_time_slot_officers (event_id, slot_id, officer_id)
values
  (-2020, -9201, -1010), (-2020, -9201, -1013), (-2020, -9201, -1015),
  (-2020, -9202, -1010), (-2020, -9202, -1015),
  (-2020, -9203, -1019),
  (-2021, -9211, -1008),
  (-2021, -9212, -1019), (-2021, -9212, -1020),
  (-2022, -9221, -1013), (-2022, -9222, -1013), (-2022, -9223, -1013),
  (-2022, -9222, -1016),
  (-2024, -9241, -1013), (-2024, -9242, -1014),
  (-2030, -9301, -1006), (-2030, -9301, -1016), (-2030, -9302, -1016),
  (-2031, -9311, -1021);

-- Read-only historical presentation rows on a past Session Event (retired workflow)
insert into public.presentation_slots
  (id, event_id, position, officer_id, presentation_title, resource_url, difficulty, prep_notes)
values
  (-9001, -2104, 1, -1013, 'Two Sum (Historical)',  'https://cappy.test/problems/two-sum',     'Easy',   'Walk through the hash map approach.'),
  (-9002, -2104, 2, -1016, 'Interview Prep Advice', 'https://cappy.test/notes/interview-prep', 'Medium', 'Practical behavioral & whiteboard tips.');

-- =============================================================================
-- 5. Tasks, Recurring Task Series, Assignments & Event Links
-- =============================================================================

with base as (
  select (now() at time zone 'America/Denver')::date as today
)
insert into public.task_series (id, request_key, recurrence_rule, created_by, starts_on, ends_on)
select
  s.id, s.request_key, s.recurrence_rule, s.created_by, base.today + s.start_off, base.today + s.end_off
from base,
(values
  (-2301, '00000000-0000-4000-8000-000000002301'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2', -1006, 5,  12),
  (-2302, '00000000-0000-4000-8000-000000002302'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3', -1006, 8,  22),
  (-2303, '00000000-0000-4000-8000-000000002303'::uuid, 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2', -1005, 10, 17)
) as s(id, request_key, recurrence_rule, created_by, start_off, end_off);

-- 5a. Relative-date Tasks (active, overdue, pending approval, no-longer-needed, deleted, recurring)
with base as (
  select (now() at time zone 'America/Denver')::date as today
),
task_seed (
  id, title, description, task_type, branch_name, day_off, due_time, points,
  approval_req, created_by, series_id, nln_at, nln_by, rem_at, rem_by
) as (
  values
    (-8001, 'Make intro flyer',                          'Prepare a flyer for the upcoming Intro Hash Maps Session.',        'Flyer',    'intro',    7,  null::time,   5::numeric, false, -1005, null::bigint, null::timestamptz,         null::bigint, null::timestamptz,        null::bigint),
    (-8002, 'Write LinkedIn recap',                      'Draft a recap for the club LinkedIn page.',                        'LinkedIn', 'general',  8,  null,         4,          false, -1002, null,         null,                      null,         null,                     null),
    (-8003, 'Update ICPC roster',                        'Update the practice roster before the DP session.',                'Airtable', 'icpc',     3,  null,         3,          false, -1006, null,         null,                      null,         null,                     null),
    (-8004, 'Post social story',                         'Create an Instagram story for the upcoming social.',               'Story',    'social',   2,  null,         2,          false, -1007, null,         null,                      null,         null,                     null),
    (-8005, 'Publish workshop post',                     'Past completed Task with automatic Task Point award.',             'Post',     'intro',   -2,  null,         6,          false, -1005, null,         null,                      null,         null,                     null),
    (-8006, 'Prepare outreach flyer',                    'Design a flyer for Outreach Tabling at Centennial Plaza.',         'Flyer',    'outreach', 5,  null,         5,          false, -1008, null,         null,                      null,         null,                     null),
    (-8007, 'Past outreach checklist',                   'Overdue Task with one completed and one incomplete assignment.',   'Airtable', 'outreach',-4,  null,         4,          false, -1008, null,         null,                      null,         null,                     null),
    (-8010, 'Prepare volunteer sign-in sheet',           'Create a sign-in sheet for the Equal Slots Volunteer Fair.',       'Airtable', 'general',  3,  null,         3,          false, -1002, null,         null,                      null,         null,                     null),
    (-8011, 'Draft outreach recap',                      'Write a recap for the outreach booth.',                            'Post',     'outreach', 1,  null,         4,          true,  -1008, null,         null,                      null,         null,                     null),
    (-8012, 'Refresh ICPC practice guide',               'Past completed Task with awarded Points.',                         'Airtable', 'icpc',    -3,  null,         5,          false, -1006, null,         null,                      null,         null,                     null),
    (-8013, 'Promote coding workshop',                   'Timed-due-date Task (3:00 PM El Paso) with multiple assignees.',   'Story',    'icpc',    10,  time '15:00', 2.5,        false, -1006, null,         null,                      null,         null,                     null),
    (-8014, 'Design career fair poster',                 'Overdue Task assigned to Local Officer for Dashboard testing.',    'Flyer',    'general', -1,  null,         6,          false, -1002, null,         null,                      null,         null,                     null),
    (-8015, 'Review completion approval example',        'Has a pending Officer completion report awaiting Lead review.',    'Flyer',    'intro',    5,  null,         3,          false, -1005, null,         null,                      null,         null,                     null),
    (-8016, 'Archive legacy room reservation',           'Overdue Task closed as No longer needed (Issue #469 example).',    'Airtable', 'intro',   -6,  null,         2,          false, -1005, null,         now() - interval '2 days', -1005,        null,                     null),
    (-8017, 'Deleted draft flyer',                       'Soft-deleted Task for testing Deleted view & Restore.',            'Flyer',    'general',  9,  null,         3,          false, -1001, null,         null,                      null,         now() - interval '1 day', -1001),
    (-8301, 'Mock: Reminder Scope — This Occurrence',    'Only this occurrence has a custom reminder.',                      'Post',     'icpc',     5,  null,         1,          false, -1006, -2301,        null,                      null,         null,                     null),
    (-8302, 'Mock: Reminder Scope — This Occurrence',    'Following occurrence keeps the default reminder.',                 'Post',     'icpc',    12,  null,         1,          false, -1006, -2301,        null,                      null,         null,                     null),
    (-8303, 'Mock: Reminder Scope — This and Following', 'First occurrence keeps the default reminder.',                     'Post',     'intro',    8,  null,         1,          false, -1006, -2302,        null,                      null,         null,                     null),
    (-8304, 'Mock: Reminder Scope — This and Following', 'Selected and following occurrences share a custom reminder.',      'Post',     'intro',   15,  null,         1,          false, -1006, -2302,        null,                      null,         null,                     null),
    (-8305, 'Mock: Reminder Scope — This and Following', 'Selected and following occurrences share a custom reminder.',      'Post',     'intro',   22,  null,         1,          false, -1006, -2302,        null,                      null,         null,                     null),
    (-8310, 'Mock: Reminder Scope — All Occurrences',    'Every occurrence shares the same custom reminder.',                'Story',    'social',  10,  null,         1,          false, -1007, -2303,        null,                      null,         null,                     null),
    (-8311, 'Mock: Reminder Scope — All Occurrences',    'Every occurrence shares the same custom reminder.',                'Story',    'social',  17,  null,         1,          false, -1007, -2303,        null,                      null,         null,                     null)
)
insert into public.tasks (
  id, title, description, task_type, branch_id, due_date, due_time, points,
  approval_required, created_by, recurrence_series_id, recurrence_key,
  no_longer_needed_at, no_longer_needed_by, removed_at, removed_by
)
select
  s.id, s.title, s.description, s.task_type, b.id, base.today + s.day_off, s.due_time, s.points,
  s.approval_req, s.created_by, s.series_id,
  case when s.series_id is not null then base.today + s.day_off else null end,
  s.nln_at, s.nln_by, s.rem_at, s.rem_by
from base
cross join task_seed s
join public.branches b on b.name = s.branch_name;

-- 5b. Historical Academic Period Tasks
with period_tasks (id, title, description, task_type, branch_name, due_date, points, created_by) as (
  values
    (-3101, 'Winter 2025 report',         'Historical completed Task for Winter 2025.', 'Post',     'general', date '2025-12-18', 3, -1001),
    (-3102, 'Spring 2026 workshop flyer', 'Historical completed Task for Spring 2026.', 'Flyer',    'intro',   date '2026-04-20', 4, -1005),
    (-3103, 'Summer 2026 social recap',   'Historical completed Task for Summer 2026.', 'Story',    'social',  date '2026-07-20', 2, -1007),
    (-3104, 'Fall 2026 practice guide',   'Completed Task for Fall 2026.',              'Airtable', 'icpc',    date '2026-10-20', 5, -1006)
)
insert into public.tasks (id, title, description, task_type, branch_id, due_date, points, approval_required, created_by)
select s.id, s.title, s.description, s.task_type, b.id, s.due_date, s.points, false, s.created_by
from period_tasks s
join public.branches b on b.name = s.branch_name;

insert into public.task_officer_assignments
  (task_id, officer_id, assigned_by, completed_at, completion_approval_pending)
values
  (-8002, -1002, -1002, now() - interval '1 day',  false),
  (-8002, -1003, -1002, null,                      false),
  (-8003, -1016, -1006, null,                      false),
  (-8004, -1017, -1007, now() - interval '1 day',  false),
  (-8005, -1013, -1013, now() - interval '2 days', false),
  (-8006, -1010, -1008, null,                      false),
  (-8007, -1019, -1008, now() - interval '3 days', false),
  (-8007, -1020, -1008, null,                      false),
  (-8011, -1019, -1008, null,                      false),
  (-8012, -1021, -1006, now() - interval '1 day',  false),
  (-8013, -1013, -1006, null,                      false),
  (-8013, -1016, -1006, null,                      false),
  (-8013, -1021, -1006, null,                      false),
  (-8014, -1010, -1002, null,                      false),
  (-8015, -1013, -1005, now() - interval '2 hours', true),
  (-8016, -1010, -1005, null,                      false),
  (-8301, -1016, -1006, null,                      false),
  (-8302, -1016, -1006, null,                      false),
  (-8303, -1010, -1006, null,                      false),
  (-8304, -1010, -1006, null,                      false),
  (-8305, -1010, -1006, null,                      false),
  (-8310, -1017, -1007, null,                      false),
  (-8311, -1017, -1007, null,                      false),
  (-3101, -1022, -1001, '2025-12-18 18:00-07',     false),
  (-3102, -1013, -1005, '2026-04-20 18:00-06',     false),
  (-3103, -1017, -1007, '2026-07-20 18:00-06',     false),
  (-3104, -1016, -1006, '2026-10-20 18:00-06',     false);

-- Link Tasks to Events so both Event detail and Task detail show cross-links
insert into public.task_events (task_id, event_id)
values
  (-8001, -2010),
  (-8003, -2013),
  (-8006, -2015),
  (-8010, -2020),
  (-8014, -2012);

-- =============================================================================
-- 6. Resource Links (Events & Tasks)
-- =============================================================================

insert into public.resource_links (id, event_id, task_id, kind, label, url, sort_order, legacy_key)
values
  (-9501, -2010, null,  'slides',        'Slides',          'https://cappy.test/cic/intro-hash-maps-slides',    0, 'slides'),
  (-9502, -2010, null,  'documentation', 'Documentation',   'https://cappy.test/cic/hash-maps-practice-set',    1, null),
  (-9503, -2011, null,  'slides',        'Slides',          'https://cappy.test/cic/officer-meeting-deck',      0, 'slides'),
  (-9504, -2011, null,  'meeting_notes', 'Meeting notes',   'https://cappy.test/cic/officer-meeting-notes',     1, 'meeting_notes'),
  (-9505, -2012, null,  'signup_sheet',  'Signup sheet',    'https://cappy.test/cic/career-fair-checkin',       0, 'signup_sheet'),
  (-9506, -2013, null,  'slides',        'Slides',          'https://cappy.test/cic/icpc-dp-slides',            0, 'slides'),
  (-9507, -2020, null,  'custom',        'Volunteer Guide', 'https://cappy.test/cic/volunteer-fair-guide',      0, null),
  (-9508, null,  -8001, 'custom',        'Canva Template',  'https://cappy.test/cic/intro-flyer-template',      0, null),
  (-9509, null,  -8002, 'documentation', 'Documentation',   'https://cappy.test/cic/linkedin-brand-guidelines', 0, null),
  (-9510, null,  -8013, 'custom',        'Social Assets',   'https://cappy.test/cic/workshop-social-kit',       0, null);

-- =============================================================================
-- 7. Point Transactions (Participation, Tasks, Manual, Corrections, Negative)
-- =============================================================================

-- 7a. Event Participation Awards (ordinary & Volunteer/Attendee rates)
with base as (
  select (now() at time zone 'America/Denver')::date as today
)
insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at, removed_at, removed_by)
select
  s.id, s.officer_id, s.event_id, s.points, s.reason, 'participation',
  ((base.today + s.day_off + s.clock_t) at time zone 'America/Denver'),
  s.rem_at, s.rem_by
from base,
(values
  (-4001, -1010, -2001, 5::numeric, 'Event participation: Intro Arrays Workshop', -20, time '19:01', null::timestamptz,          null::uuid),
  (-4002, -1013, -2001, 5,          'Event participation: Intro Arrays Workshop', -20, time '19:01', null,                       null),
  (-4003, -1014, -2001, 5,          'Event participation: Intro Arrays Workshop', -20, time '19:01', null,                       null),
  (-4004, -1015, -2001, 5,          'Event participation: Intro Arrays Workshop', -20, time '19:01', null,                       null),
  (-4005, -1006, -2002, 7.5,        'Event participation: ICPC Practice Contest', -14, time '13:01', null,                       null),
  (-4006, -1010, -2002, 7.5,        'Event participation: ICPC Practice Contest', -14, time '13:01', null,                       null),
  (-4007, -1016, -2002, 7.5,        'Event participation: ICPC Practice Contest', -14, time '13:01', null,                       null),
  (-4008, -1007, -2003, 5,          'Event participation: CIC Game Night',        -7,  time '20:01', null,                       null),
  (-4009, -1017, -2003, 5,          'Event participation: CIC Game Night',        -7,  time '20:01', null,                       null),
  (-4010, -1018, -2003, 5,          'Event participation: CIC Game Night',        -7,  time '20:01', null,                       null),
  (-4014, -1001, -2006, 3.75,       'Historical participation (deleted Event)',   -44, time '18:00', null,                       null),
  (-4015, -1010, -2006, 3.75,       'Removed historical participation',           -44, time '18:00', now() - interval '30 days', '00000000-0000-4000-8000-000000000999'::uuid),
  (-4590, -1201, -2060, 4,          'Volunteer participation (2 pts/hr)',         -1,  time '12:01', null,                       null),
  (-4591, -1202, -2060, 2,          'Attendee participation (1 pt/hr)',           -1,  time '12:01', null,                       null)
) as s(id, officer_id, event_id, points, reason, day_off, clock_t, rem_at, rem_by);

-- 7b. Slotted Event Participation Awards (active & removed slot selection)
insert into public.point_transactions
  (id, officer_id, event_id, event_time_slot_id, points, reason, award_type, created_at, removed_at, removed_by, slot_selection_removed)
values
  (-4101, -1013, -2022, -9221, 2.5, 'Career Day shift 1 (1 hr)',  'participation', now() - interval '2 days', null,                     null,                                   false),
  (-4102, -1013, -2022, -9222, 5,   'Career Day shift 2 (2 hrs)', 'participation', now() - interval '2 days', null,                     null,                                   false),
  (-4103, -1013, -2022, -9223, 2.5, 'Career Day shift 3 (1 hr)',  'participation', now() - interval '2 days', null,                     null,                                   false),
  (-4104, -1016, -2022, -9221, 2.5, 'Removed Career Day shift 1', 'participation', now() - interval '2 days', now() - interval '1 day', '00000000-0000-4000-8000-000000000999', true),
  (-4105, -1016, -2022, -9222, 5,   'Career Day shift 2 (2 hrs)', 'participation', now() - interval '2 days', null,                     null,                                   false);

-- 7c. Task Completion Awards
insert into public.point_transactions (officer_id, task_id, points, reason, award_type, created_by_officer_id)
values
  (-1013, -8005, 6, 'Task completion: Publish workshop post',       'task', -1005),
  (-1019, -8007, 4, 'Task completion: Past outreach checklist',     'task', -1008),
  (-1021, -8012, 5, 'Task completion: Refresh ICPC practice guide', 'task', -1006);

-- 7d. Realistic Manual Awards & Corrections (replaces 300 repetitive filler rows)
insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at, removed_at, removed_by)
values
  (-5001, -1010, -2001, 3,    'Helped set up projector and check-in table', 'manual',     now() - interval '18 days', null,                    null),
  (-5002, -1013, null,  5,    'Coordinated freshmen study group',           'manual',     now() - interval '15 days', null,                    null),
  (-5003, -1014, null,  4,    'Designed semester welcome banner',           'manual',     now() - interval '12 days', null,                    null),
  (-5004, -1015, null,  6,    'Led mock technical interview panel',         'manual',     now() - interval '10 days', null,                    null),
  (-5005, -1016, -2002, 4,    'Curated ICPC contest problem set',           'manual',     now() - interval '9 days',  null,                    null),
  (-5006, -1017, null,  3,    'Organized snacks and games for Game Night',  'manual',     now() - interval '6 days',  null,                    null),
  (-5007, -1018, null,  5,    'Captured event photography for social feed', 'manual',     now() - interval '5 days',  null,                    null),
  (-5008, -1019, null,  4,    'Hosted department outreach info table',      'manual',     now() - interval '4 days',  null,                    null),
  (-5009, -1020, null,  3,    'Updated club sponsor contact sheet',         'manual',     now() - interval '3 days',  null,                    null),
  (-5010, -1021, null,  4,    'Maintained Discord bot announcements',       'manual',     now() - interval '2 days',  null,                    null),
  (-5011, -1005, null,  5,    'Prepared Intro curriculum roadmap',          'manual',     now() - interval '11 days', null,                    null),
  (-5012, -1006, null,  5,    'Hosted weekend ICPC scrimmage',              'manual',     now() - interval '8 days',  null,                    null),
  (-5013, -1010, null,  2,    'Duplicate entry removed by admin',           'manual',     now() - interval '7 days',  now() - interval '6 days','00000000-0000-4000-8000-000000000999'),
  (-5014, -1014, null,  3,    'Reviewed resume submissions',                'manual',     now() - interval '1 day',   null,                    null),
  (-6001, -1010, null,  1.5,  'Schedule adjustment credit',                 'correction', now() - interval '13 days', null,                    null),
  (-6002, -1013, null, -1.5,  'Duplicate hour adjustment',                  'correction', now() - interval '8 days',  null,                    null),
  (-6003, -1016, null,  2,    'Late check-in credit adjustment',            'correction', now() - interval '4 days',  null,                    null),
  (-6004, -1017, null, -1,    'Early departure time correction',            'correction', now() - interval '3 days',  null,                    null);

-- 7e. Historical Academic Period Points
insert into public.point_transactions (id, officer_id, event_id, points, reason, award_type, created_at)
values
  (-7101, -1022, -2101, 1, 'Winter 2025 participation', 'participation', '2025-12-10 18:01-07'),
  (-7102, -1013, -2102, 2, 'Spring 2026 participation', 'participation', '2026-04-15 19:01-06'),
  (-7103, -1017, -2103, 2, 'Summer 2026 participation', 'participation', '2026-07-10 20:01-06'),
  (-7104, -1016, -2104, 2, 'Fall 2026 participation',   'participation', '2026-10-15 19:01-06');

insert into public.point_transactions (id, officer_id, task_id, points, reason, award_type, created_at, created_by_officer_id)
values
  (-7201, -1022, -3101, 3, 'Winter 2025 task completion', 'task', '2025-12-18 18:01-07', -1001),
  (-7202, -1013, -3102, 4, 'Spring 2026 task completion', 'task', '2026-04-20 18:01-06', -1005),
  (-7203, -1017, -3103, 2, 'Summer 2026 task completion', 'task', '2026-07-20 18:01-06', -1007),
  (-7204, -1016, -3104, 5, 'Fall 2026 task completion',   'task', '2026-10-20 18:01-06', -1006);

-- 7f. Negative Point & Missed-Commitment Scenarios (Issue #402)
insert into public.point_transactions
  (id, officer_id, event_id, task_id, points, reason, award_type, created_at)
values
  (-4511, -1201, null,  -8001, -1, 'Negative Point linked to Task (1 of 2)',         'negative', now() - interval '2 days'),
  (-4512, -1201, -2063, null,  -1, 'Negative Point linked to Event (2 of 2)',        'negative', now() - interval '1 day'),
  (-4521, -1202, -2060, null,  -1, 'Automatic Warning group A — point 1',            'negative', now() - interval '6 days'),
  (-4522, -1202, null,  -8001, -1, 'Automatic Warning group A — point 2',            'negative', now() - interval '5 days'),
  (-4523, -1202, null,  -8002, -1, 'Automatic Warning group A — point 3',            'negative', now() - interval '4 days'),
  (-4531, -1203, null,  -8001, -1, 'First automatic group — point 1',                'negative', now() - interval '12 days'),
  (-4532, -1203, null,  -8002, -1, 'First automatic group — point 2',                'negative', now() - interval '11 days'),
  (-4533, -1203, null,  -8003, -1, 'First automatic group — point 3',                'negative', now() - interval '10 days'),
  (-4534, -1203, null,  -8004, -1, 'Second automatic group — point 1',               'negative', now() - interval '9 days'),
  (-4535, -1203, null,  -8005, -1, 'Second automatic group — point 2',               'negative', now() - interval '8 days'),
  (-4536, -1203, null,  -8006, -1, 'Second automatic group — point 3',               'negative', now() - interval '7 days'),
  (-4541, -1204, null,  -8001, -1, 'Over-limit ungrouped negative — point 1',        'negative', now() - interval '4 days'),
  (-4542, -1204, null,  -8002, -1, 'Over-limit ungrouped negative — point 2',        'negative', now() - interval '3 days'),
  (-4543, -1204, null,  -8003, -1, 'Over-limit ungrouped negative — point 3',        'negative', now() - interval '2 days'),
  (-4544, -1204, null,  -8004, -1, 'Extra negative beyond three-Warning cap',        'negative', now() - interval '1 day'),
  (-4551, -1205, null,  -8001, -1, 'Third-Warning trigger group — point 1',          'negative', now() - interval '3 days'),
  (-4552, -1205, null,  -8002, -1, 'Third-Warning trigger group — point 2',          'negative', now() - interval '2 days'),
  (-4553, -1205, null,  -8003, -1, 'Third-Warning trigger group — point 3',          'negative', now() - interval '1 day'),
  (-4561, -1206, null,  -8001, -1, 'Mixed Warning Officer — ungrouped negative 1',   'negative', now() - interval '2 days'),
  (-4562, -1206, null,  -8002, -1, 'Mixed Warning Officer — ungrouped negative 2',   'negative', now() - interval '1 day'),
  (-4571, -1207, -2063, null,  -1, 'Missed commitment: negative Point selected',     'negative', now() - interval '1 day'),
  (-4581, -1207, null,  null,  12, 'Positive leaderboard credit for net-score demo', 'manual',   now() - interval '4 days');

insert into public.point_transactions
  (id, officer_id, event_id, points, reason, award_type, created_at, removed_at, removed_by, removed_by_officer_id)
values
  (-4583, -1207, -2062, 4, 'Missed commitment: positive award removed', 'participation',
   now() - interval '3 days', now() - interval '1 day', '00000000-0000-4000-8000-000000000999', -1001);

-- =============================================================================
-- 8. Officer Warnings & Automatic Warning Links
-- =============================================================================

-- 8a. Legacy approval-era & voided Warnings (trimmed to 1 per historical state)
insert into public.officer_warnings (id, officer_id, reason, status, created_at, origin, voided_at, voided_by)
values
  (-3001, -1010, 'Legacy pending Warning retained for historical view.',  'pending',  now() - interval '2 days',  'manual', null,                     null),
  (-3002, -1013, 'Approved manual Warning.',                              'approved', now() - interval '20 days', 'manual', null,                     null),
  (-3003, -1014, 'Legacy rejected Warning retained for historical view.', 'rejected', now() - interval '15 days', 'manual', null,                     null),
  (-3010, -1017, 'Historical voided Warning retained for history.',       'approved', now() - interval '40 days', 'manual', now() - interval '20 days', -1001);

-- 8b. Manual & Automatic Warnings (Issue #402 lifecycles, cap, and soft-delete)
insert into public.officer_warnings (id, officer_id, reason, status, created_at, origin, deleted_at, deleted_by)
values
  (-3201, -1202, 'Automatic Warning from three linked negative Points', 'approved', now() - interval '4 days',  'automatic', null,                    null),
  (-3202, -1203, 'Automatic Warning group one',                         'approved', now() - interval '10 days', 'automatic', null,                    null),
  (-3203, -1203, 'Automatic Warning group two',                         'approved', now() - interval '7 days',  'automatic', null,                    null),
  (-3204, -1204, 'Manual Warning one of three',                         'approved', now() - interval '30 days', 'manual',    null,                    null),
  (-3205, -1204, 'Manual Warning two of three',                         'approved', now() - interval '20 days', 'manual',    null,                    null),
  (-3206, -1204, 'Manual Warning three of three (at cap)',              'approved', now() - interval '10 days', 'manual',    null,                    null),
  (-3207, -1205, 'Deleted manual Warning (frees a slot for Restore)',   'approved', now() - interval '30 days', 'manual',    now() - interval '1 day', -1001),
  (-3208, -1205, 'Manual Warning two',                                  'approved', now() - interval '20 days', 'manual',    null,                    null),
  (-3209, -1205, 'Automatic Warning (reached threshold)',               'approved', now() - interval '1 day',   'automatic', null,                    null),
  (-3210, -1206, 'Manual Warning paired with two ungrouped negatives',  'approved', now() - interval '5 days',  'manual',    null,                    null);

insert into public.automatic_warning_point_links (warning_id, point_transaction_id)
values
  (-3201, -4521), (-3201, -4522), (-3201, -4523),
  (-3202, -4531), (-3202, -4532), (-3202, -4533),
  (-3203, -4534), (-3203, -4535), (-3203, -4536),
  (-3209, -4551), (-3209, -4552), (-3209, -4553);

-- =============================================================================
-- 9. Notifications, Audiences & Reminder Offsets
-- =============================================================================

with target_seed (event_id, all_active, branch_name, position_code) as (
  values
    (-2010, false, 'intro',     null),
    (-2010, false, null,        'lead'),
    (-2012, true,  null,        null),
    (-2030, false, null,        'lead'),
    (-2031, false, 'icpc',      null),
    (-2040, false, 'icpc',      null),
    (-2041, false, 'icpc',      null),
    (-2050, false, 'intro',     null),
    (-2051, false, 'intro',     null),
    (-2052, false, 'intro',     null)
)
insert into public.event_notification_targets (event_id, all_active, branch_id, position_id)
select s.event_id, s.all_active, b.id, p.id
from target_seed s
left join public.branches b on b.name = s.branch_name
left join public.positions p on p.code = s.position_code;

insert into public.event_reminder_offsets (event_id, minutes_before)
values
  (-2010, 1440), (-2010, 60),
  (-2012, 120),
  (-2030, 30),   (-2031, 1440),
  (-2040, 60),   (-2041, 60),
  (-2050, 1440), (-2050, 60), (-2051, 120), (-2052, 120);

with target_seed (task_id, all_active, branch_name, position_code) as (
  values
    (-8001, true,  null,      null),
    (-8002, false, 'general', null),
    (-8002, false, null,      'officer'),
    (-8003, false, null,      'lead'),
    (-8013, false, 'icpc',    null),
    (-8301, false, null,      'officer'),
    (-8302, false, null,      'officer'),
    (-8303, false, 'intro',   null),
    (-8304, false, 'intro',   null),
    (-8305, false, 'intro',   null)
)
insert into public.task_notification_targets (task_id, all_active, branch_id, position_id)
select s.task_id, s.all_active, b.id, p.id
from target_seed s
left join public.branches b on b.name = s.branch_name
left join public.positions p on p.code = s.position_code;

insert into public.task_reminder_offsets (task_id, minutes_before)
values
  (-8001, 1440),
  (-8002, 1440),
  (-8011, 60),   (-8011, 15),
  (-8013, 120),
  (-8301, 30),   (-8302, 1440),
  (-8303, 1440), (-8304, 120), (-8305, 120),
  (-8310, 60),   (-8311, 60);

insert into public.notifications
  (recipient_officer_id, kind, title, message, entity_type, entity_id, href, priority, created_at, read_at, reviewed_at, dedupe_key)
values
  -- Local Officer (-1010) inbox: unread, read, reviewed, confirmations, and every major category
  (-1010, 'event.created',            'New Event: Mock: Intro Hash Maps',                     'Tomorrow · CCSB G.0208',                                                             'event',   -2010, '/events/-2010',   'important',    now() - interval '2 minutes', null,                         null,                         'seed:event.created:2010:1010'),
  (-1010, 'event.changed',            'Event updated: Mock: Intro Hash Maps',                 'The date or location changed.',                                                      'event',   -2010, '/events/-2010',   'important',    now() - interval '1 hour',    now() - interval '55 minutes',now() - interval '55 minutes','seed:event.changed:2010:1010'),
  (-1010, 'event.signup',             'Event signup confirmed',                               'Mock: Intro Hash Maps',                                                              'event',   -2010, '/events/-2010',   'confirmation', now() - interval '3 hours',   now() - interval '2 hours',   null,                         'seed:event.signup:2010:1010'),
  (-1010, 'event.reminder',           'Event reminder: Mock: Intro Hash Maps',                'Tomorrow',                                                                           'event',   -2010, '/events/-2010',   'important',    now() - interval '4 hours',   null,                         null,                         'seed:event.reminder:2010:1010'),
  (-1010, 'task.assigned',            'Task assigned: Prepare outreach flyer',                'You have a Task to complete.',                                                       'task',    -8006, '/tasks/-8006',    'important',    now() - interval '5 hours',   null,                         null,                         'seed:task.assigned:8006:1010'),
  (-1010, 'task.reminder',            'Task reminder: Design career fair poster',             'Due soon',                                                                           'task',    -8014, '/tasks/-8014',    'important',    now() - interval '1 day',     null,                         null,                         'seed:task.reminder:8014:1010'),
  (-1010, 'task.need_status_changed', 'Task no longer needed: Archive legacy room reservation','A Lead or Admin closed this Task because the work is no longer needed.',            'task',    -8016, '/tasks/-8016',    'important',    now() - interval '2 days',    null,                         null,                         'seed:task.need_status:8016:1010'),
  (-1010, 'point.changed',            'Points updated',                                       '+5 Points',                                                                          'point',   -4001, '/points',         'important',    now() - interval '2 days',    now() - interval '2 days',    null,                         'seed:point.changed:4001:1010'),
  (-1010, 'warning.changed',          'Warning updated',                                      'A Warning on your record changed.',                                                  'warning', -3001, '/officers/-1010', 'important',    now() - interval '3 days',    null,                         null,                         'seed:warning.changed:3001:1010'),
  (-1010, 'event.left',               'Event signup removed',                                 'Mock: Cancelled Meeting',                                                            'event',   -2005, '/events/-2005',   'confirmation', now() - interval '10 days',   now() - interval '9 days',    null,                         'seed:event.left:2005:1010'),

  -- Leadership & other Officers: threshold notices, completion, rejection, cancellation, removal
  (-1001, 'warning.threshold',        'Officer reached 3 active Warnings',                    'Review Mock: Third Warning notification.',                                           'warning', -3209, '/officers/-1205', 'important',    now() - interval '20 hours',  null,                         null,                         'seed:warning.threshold:3209:1001'),
  (-1002, 'warning.threshold',        'Officer reached 3 active Warnings',                    'Review Mock: Third Warning notification.',                                           'warning', -3209, '/officers/-1205', 'important',    now() - interval '20 hours',  null,                         null,                         'seed:warning.threshold:3209:1002'),
  (-1003, 'warning.threshold',        'Officer reached 3 active Warnings',                    'Review Mock: Third Warning notification.',                                           'warning', -3209, '/officers/-1205', 'important',    now() - interval '20 hours',  null,                         null,                         'seed:warning.threshold:3209:1003'),
  (-1004, 'warning.threshold',        'Officer reached 3 active Warnings',                    'Review Mock: Third Warning notification.',                                           'warning', -3209, '/officers/-1205', 'important',    now() - interval '20 hours',  null,                         null,                         'seed:warning.threshold:3209:1004'),
  (-1005, 'task.completed',           'Task completed: Publish workshop post',                'An Officer completed a Task for your Branch.',                                       'task',    -8005, '/tasks/-8005',    'important',    now() - interval '6 hours',   null,                         null,                         'seed:task.completed:8005:1005'),
  (-1013, 'task.changed',             'Task updated: Draft outreach recap',                   'The Task details or due date changed.',                                              'task',    -8011, '/tasks/-8011',    'important',    now() - interval '7 hours',   now() - interval '6 hours',   null,                         'seed:task.changed:8011:1013'),
  (-1013, 'task.completion_rejected', 'Completion not approved: Review completion approval example', 'A Lead or Admin did not approve this completion. You can mark it complete again.', 'task', -8015, '/tasks/-8015', 'important',  now() - interval '8 hours',   null,                         null,                         'seed:task.completion_rejected:8015:1013'),
  (-1001, 'event.cancelled',          'Event cancelled: Mock: Cancelled Meeting',             'The Event was cancelled.',                                                           'event',   -2005, '/events/-2005',   'important',    now() - interval '10 days',   null,                         null,                         'seed:event.cancelled:2005:1001'),
  (-1016, 'point.changed',            'Points removed',                                       '2.5 Points',                                                                         'point',   -4104, '/points',         'important',    now() - interval '5 days',    null,                         null,                         'seed:point.removed:4104:1016'),
  (-1017, 'warning.changed',          'Warning voided',                                       'A Warning was voided on your record.',                                               'warning', -3010, '/officers/-1017', 'important',    now() - interval '4 days',    now() - interval '3 days',    null,                         'seed:warning.voided:3010:1017');

-- =============================================================================
-- 10. System Audit Log Examples
-- =============================================================================

insert into public.audit_logs (id, actor_id, action, entity_type, entity_id, details, created_at)
values
  (-7001, null, 'event.participation_awarded', 'event', '-2001', '{"source":"local-seed","note":"Synthetic system audit entry"}'::jsonb, now() - interval '20 days'),
  (-7002, null, 'event.participation_awarded', 'event', '-2002', '{"source":"local-seed","note":"Synthetic system audit entry"}'::jsonb, now() - interval '14 days'),
  (-7003, null, 'event.removed',               'event', '-2006', '{"source":"local-seed","note":"Synthetic removed-event history"}'::jsonb, now() - interval '35 days');

commit;
