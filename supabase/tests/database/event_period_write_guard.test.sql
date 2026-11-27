begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000004840', 'period-guard-admin@example.test'),
  ('00000000-0000-4000-8000-000000004841', 'period-guard-officer@example.test');
insert into officers(id, name, utep_email, position_id, application_role, auth_user_id) values
  (-4840, 'Period Guard Admin', 'period-guard-admin@example.test',
    (select id from positions where name = 'Officer'), 'admin',
    '00000000-0000-4000-8000-000000004840'),
  (-4841, 'Period Guard Officer', 'period-guard-officer@example.test',
    (select id from positions where name = 'Officer'), 'officer',
    '00000000-0000-4000-8000-000000004841');

-- Configure one ended historical period and one current open period, leaving a
-- gap date outside any period.
insert into academic_periods(id, name, starts_on, ends_on) values
  (-4841, 'Historical Guard Term', '2020-01-01', '2020-05-15'),
  (-4842, 'Current Guard Term',
    ((now() at time zone 'America/Denver')::date - 5),
    ((now() at time zone 'America/Denver')::date + 30));

-- Seed Events across:
--   1. Gap date (2022-06-15): writable until a retroactive historical period covers it.
--   2. Historical period (2020-03-10): always read-only.
--   3. Current open period past Event: writable for authorized historical corrections.
--   4. Recurring series spanning historical + future occurrences.
with wt as (select id from event_types where name = 'Workshop' limit 1)
insert into events(id, name, description, event_type_id, location, event_date, starts_at, ends_at, status)
select id, name, 'Details', wt.id, 'Campus', event_date, starts_at, ends_at, status
from wt, (values
  (-48410, 'Gap Unslotted Event', '2098-06-15'::date, '2098-06-15 16:00Z'::timestamptz, '2098-06-15 17:00Z'::timestamptz, 'upcoming'),
  (-48411, 'Gap Slotted Event', '2098-06-16'::date, '2098-06-16 16:00Z'::timestamptz, '2098-06-16 17:00Z'::timestamptz, 'upcoming'),
  (-48412, 'Gap Retroactive Event', '2022-06-15'::date, '2022-06-15 16:00Z'::timestamptz, '2022-06-15 17:00Z'::timestamptz, 'past'),
  (-48413, 'Historical Unslotted Event', '2020-03-10'::date, '2020-03-10 16:00Z'::timestamptz, '2020-03-10 17:00Z'::timestamptz, 'past'),
  (-48414, 'Historical Slotted Event', '2020-03-11'::date, '2020-03-11 16:00Z'::timestamptz, '2020-03-11 17:00Z'::timestamptz, 'past'),
  (-48415, 'Historical Cancelled Event', '2020-03-12'::date, '2020-03-12 16:00Z'::timestamptz, '2020-03-12 17:00Z'::timestamptz, 'cancelled'),
  (-48416, 'Current Period Past Event',
    ((now() at time zone 'America/Denver')::date - 2),
    ((now() at time zone 'America/Denver')::date - 2 + time '10:00') at time zone 'America/Denver',
    ((now() at time zone 'America/Denver')::date - 2 + time '11:00') at time zone 'America/Denver',
    'past')
) as rows(id, name, event_date, starts_at, ends_at, status);

insert into event_time_slots(id, event_id, starts_at, ends_at, capacity) values
  (-48420, -48411, '2098-06-16 16:00Z', '2098-06-16 17:00Z', 5),
  (-48421, -48414, '2020-03-11 16:00Z', '2020-03-11 17:00Z', 5);

insert into event_officers(event_id, officer_id, participation_type) values
  (-48414, -4841, 'volunteer');
insert into event_time_slot_officers(event_id, slot_id, officer_id) values
  (-48414, -48421, -4841);

insert into event_series(id, request_key, recurrence_rule, created_by, starts_on, ends_on) values
  (-48430, '00000000-0000-4000-8000-000000004849', 'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2', -4840, '2020-03-10', '2098-06-18');
with wt as (select id from event_types where name = 'Workshop' limit 1)
insert into events(id, name, description, event_type_id, location, event_date, starts_at, ends_at, status, recurrence_series_id, recurrence_key)
select id, name, 'Details', wt.id, 'Campus', event_date, starts_at, ends_at, status, -48430, event_date
from wt, (values
  (-48431, 'Mixed Series Historical', '2020-03-10'::date, '2020-03-10 16:00Z'::timestamptz, '2020-03-10 17:00Z'::timestamptz, 'past'),
  (-48432, 'Mixed Series Future', '2098-06-18'::date, '2098-06-18 16:00Z'::timestamptz, '2098-06-18 17:00Z'::timestamptz, 'upcoming')
) as rows(id, name, event_date, starts_at, ends_at, status);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000004840', true);
set local role authenticated;

-- 1. Gap-date Events work while no historical period covers their date.
select lives_ok(
  $$select public.change_event_signup(-48410, -4841, false, 'volunteer')$$,
  'gap-date Event allows signup'
);
select lives_ok(
  $$select public.bulk_add_event_officers(-48410, array[-4840]::bigint[], 'attendee')$$,
  'gap-date Event allows bulk roster add'
);
select lives_ok(
  $$select public.delete_event(-48410)$$,
  'gap-date Event allows delete'
);
select lives_ok(
  $$select public.restore_deleted_event(-48410)$$,
  'gap-date Event allows restore'
);
select lives_ok(
  $$select public.change_event_time_slot_signup(-48411, -4841, array[-48420]::bigint[], 'join_selected')$$,
  'gap-date slotted Event allows Time Slot signup'
);
select lives_ok(
  $$select public.bulk_add_event_officers_to_slots(-48411, array[-4840]::bigint[], array[-48420]::bigint[])$$,
  'gap-date slotted Event allows bulk Time Slot assignment'
);

-- 2. Past Events inside the current open period remain writable for authorized corrections.
select lives_ok(
  $$select public.bulk_add_event_officers(-48416, array[-4841]::bigint[], 'volunteer')$$,
  'past Event in current open period still allows authorized roster correction'
);

-- 3. Historical-period Events are blocked in the mutating transaction for every Event detail RPC.
select throws_ok(
  $$select public.change_event_signup(-48413, -4841, false, 'volunteer')$$,
  'P0001', 'Historical period is read-only',
  'change_event_signup blocks historical-period Event'
);
select throws_ok(
  $$select public.bulk_add_event_officers(-48413, array[-4841]::bigint[], 'volunteer')$$,
  'P0001', 'Historical period is read-only',
  'bulk_add_event_officers blocks historical-period Event'
);
select throws_ok(
  $$select public.delete_event(-48413)$$,
  'P0001', 'Historical period is read-only',
  'delete_event blocks historical-period Event'
);
select throws_ok(
  $$select public.restore_event(-48415)$$,
  'P0001', 'Historical period is read-only',
  'restore_event blocks historical-period cancelled Event'
);
select throws_ok(
  $$select public.change_event_time_slot_signup(-48414, -4840, array[-48421]::bigint[], 'join_selected')$$,
  'P0001', 'Historical period is read-only',
  'change_event_time_slot_signup blocks historical-period Event'
);
select throws_ok(
  $$select public.bulk_add_event_officers_to_slots(-48414, array[-4840]::bigint[], array[-48421]::bigint[])$$,
  'P0001', 'Historical period is read-only',
  'bulk_add_event_officers_to_slots blocks historical-period Event'
);
select throws_ok(
  $$select public.correct_historical_event_time_slots(-48414, -4841, '{}'::bigint[])$$,
  'P0001', 'Historical period is read-only',
  'correct_historical_event_time_slots blocks historical-period Event'
);
select throws_ok(
  $$select public.mutate_recurring_event_lifecycle(
    -48432, 'series', 'delete', '00000000-0000-4000-8000-00000000484a', -48430, 0
  )$$,
  'P0001', 'Historical period is read-only',
  'mutate_recurring_event_lifecycle rejects series delete when any occurrence is historical'
);
select is(
  (select count(*) from events where recurrence_series_id = -48430 and deleted_at is not null),
  0::bigint,
  'no occurrence was deleted when recurring lifecycle check failed'
);

-- 4. Retroactively creating a historical period covering a gap-date Event immediately blocks writes.
select lives_ok(
  $$select public.save_academic_period('Retroactive 2022 Term', '2022-06-01', '2022-06-30')$$,
  'Admin creates a retroactive historical academic period'
);
select throws_ok(
  $$select public.delete_event(-48412)$$,
  'P0001', 'Historical period is read-only',
  'stale form cannot delete Event retroactively covered by a historical period'
);

-- Mark -48413 deleted directly as superuser and verify restore_deleted_event blocks it.
reset role;
update events set deleted_at = now(), deleted_by = '00000000-0000-4000-8000-000000004840' where id = -48413;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000004840', true);
set local role authenticated;

select throws_ok(
  $$select public.restore_deleted_event(-48413)$$,
  'P0001', 'Historical period is read-only',
  'restore_deleted_event blocks historical-period Event'
);

select * from finish();
rollback;
