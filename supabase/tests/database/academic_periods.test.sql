begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000009691', 'period-admin@example.test'),
  ('00000000-0000-4000-8000-000000009692', 'period-officer@example.test');
insert into officers(id, name, utep_email, position_id, application_role, auth_user_id)
values
  (-9691, 'Period Admin', 'period-admin@example.test',
    (select id from positions where code='president'), 'admin',
    '00000000-0000-4000-8000-000000009691'),
  (-9692, 'Period Officer', 'period-officer@example.test',
    (select id from positions where code='officer'), 'officer',
    '00000000-0000-4000-8000-000000009692');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009691',true);
set local role authenticated;
select set_config('test.period_today',
  ((pg_catalog.statement_timestamp() at time zone 'America/Denver')::date)::text, true);
select set_config('test.period_past_id', save_academic_period(
  'Period test past', (current_setting('test.period_today')::date - 4),
  (current_setting('test.period_today')::date - 1))::text, true);
select set_config('test.period_current_id', save_academic_period(
  'Period test current', current_setting('test.period_today')::date,
  (current_setting('test.period_today')::date + 3))::text, true);
select set_config('test.period_future_id', save_academic_period(
  'Period test future', (current_setting('test.period_today')::date + 4),
  (current_setting('test.period_today')::date + 8))::text, true);

select is((select current_period_id from academic_period_context()),
  current_setting('test.period_current_id')::bigint,
  'database Denver date selects exactly the covering period');
select lives_ok(format('select assert_academic_period_writable(%s)',
  current_setting('test.period_current_id')),
  'current period allows writes');
select lives_ok(format('select assert_academic_period_writable(%s)',
  current_setting('test.period_future_id')),
  'future period allows writes');
select throws_ok(format('select assert_academic_period_writable(%s)',
  current_setting('test.period_past_id')),
  'P0001', 'Historical period is read-only',
  'past period rejects writes');
select throws_ok(format($sql$select save_academic_period(
  'Period test overlapping', current_setting('test.period_today')::date + 3,
  current_setting('test.period_today')::date + 5)$sql$),
  '23P01', null, 'periods cannot share an inclusive date');
select is((select count(*) from academic_periods), 3::bigint,
  'rejected overlapping period was not saved');

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009692',true);
set local role authenticated;
select is((select count(*) from academic_periods), 3::bigint,
  'authenticated officers can read configured periods');
select throws_ok($$select save_academic_period(
  'Unauthorized period', current_date + 20, current_date + 25)$$,
  'P0001', 'Admin required', 'non-admin cannot create periods');

select * from finish();
rollback;
