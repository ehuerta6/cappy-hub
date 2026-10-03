begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000441','admin-locations44@example.org'),
 ('00000000-0000-4000-8000-000000000442','officer-locations44@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
 (-441,'Admin locations #44','admin-locations44@example.org',
   (select id from positions where name='President'),'admin',
   '00000000-0000-4000-8000-000000000441'),
 (-442,'Officer locations #44','officer-locations44@example.org',
   (select id from positions where name='Officer'),'officer',
   '00000000-0000-4000-8000-000000000442');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000442',true);
set local role authenticated;
select throws_ok($$select create_event_location('Unauthorized room')$$,
  'P0001','Admin required','ordinary officer cannot manage the location catalog');
select throws_ok($$insert into event_locations(name) values('Direct write')$$,
  '42501',null,'authenticated clients cannot write directly to the location table');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000441',true);
select lives_ok($$select save_event_with_links(
  'First #44 room Event','Description',(select id from event_types where name='Meeting'),
  '  CCSB   1.032  ','2099-09-20','2099-09-20 09:00-06','2099-09-20 10:00-06',null
)$$,'saving an Event with a new location adds a reusable catalog entry');
select lives_ok($$select save_event_with_links(
  'Second #44 room Event','Description',(select id from event_types where name='Meeting'),
  'ccsb 1.032','2099-09-21','2099-09-21 09:00-06','2099-09-21 10:00-06',null
)$$,'a differently cased and spaced Event location reuses the catalog entry');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000442',true);
select is((select count(*) from event_locations where normalized_name='ccsb 1.032'),
  1::bigint,'authenticated Event creators can read reusable suggestions');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000441',true);
select is((select count(*) from event_locations
  where normalized_name='ccsb 1.032'),1::bigint,
  'normalized Event locations are stored once');
select is((select count(distinct location_id) from events
  where name in ('First #44 room Event','Second #44 room Event')),1::bigint,
  'both Events reference the same reusable location');
select is((select location from events where name='First #44 room Event'),
  'CCSB   1.032','the Event retains its entered location text');
reset role;
select throws_ok($$insert into event_locations(name) values('  CCSB   1.032  ')$$,
  '23505',null,'database uniqueness blocks formatting-only duplicates');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000441',true);

select lives_ok($$select rename_event_location(
  (select location_id from events where name='First #44 room Event'),'CCSB Room 1.032'
)$$,'admin can rename a reusable location');
select is((select location from events where name='First #44 room Event'),
  'CCSB   1.032','renaming a catalog entry preserves historical Event location text');
select is((select location from events where name='Second #44 room Event'),
  'ccsb 1.032','renaming does not rewrite other historical Event text');
select lives_ok($$select delete_event_location(
  (select location_id from events where name='First #44 room Event')
)$$,'admin can safely remove a reusable location referenced by historical Events');
select is((select count(*) from events where name in
  ('First #44 room Event','Second #44 room Event') and location_id is null),
  2::bigint,'removal clears optional catalog references');
select is((select location from events where name='First #44 room Event'),
  'CCSB   1.032','removal preserves historical Event location text');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000442',true);
select throws_ok($$select rename_event_location(1,'Unauthorized')$$,
  'P0001','Admin required','ordinary officer cannot rename a location');
select throws_ok($$select delete_event_location(1)$$,
  'P0001','Admin required','ordinary officer cannot remove a location');

select * from finish();
rollback;
