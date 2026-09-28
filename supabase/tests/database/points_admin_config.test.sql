begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000701','admin-pr7@example.org'),
 ('00000000-0000-4000-8000-000000000702','officer-pr7@example.org'),
 ('00000000-0000-4000-8000-000000000703','lead-pr7@example.org');
insert into officers(id,name,utep_email,position_id,application_role,auth_user_id) values
 (-701,'Admin PR7','admin-pr7@example.org',(select id from positions where name='Officer'),'admin','00000000-0000-4000-8000-000000000701'),
 (-702,'Officer PR7','officer-pr7@example.org',(select id from positions where name='Officer'),'officer','00000000-0000-4000-8000-000000000702'),
 (-703,'Lead PR7','lead-pr7@example.org',(select id from positions where name='Lead'),'officer','00000000-0000-4000-8000-000000000703');
insert into events(id,name,event_type_id,starts_at,ends_at,participation_points_per_hour_at_end)
 values(-701,'PR7 Event',(select id from event_types where name='General'),
 '2099-09-20 09:00-06','2099-09-20 10:00-06',2);
insert into point_transactions(id,officer_id,event_id,points,reason,award_type,created_at)
 values(-701,-702,-701,10,'Scheduled participation','participation',
   (select starts_at+interval '1 day' from private.half_year_bounds(now()))),
 (-702,-702,null,1,'At period start','manual',
   (select starts_at from private.half_year_bounds(now()))),
 (-703,-702,null,100,'Before period start','manual',
   (select starts_at-interval '1 second' from private.half_year_bounds(now())));
update application_config set updated_at=now()-interval '1 day' where id=1;

select ok(not has_table_privilege('authenticated','public.point_transactions','UPDATE')
 and not has_table_privilege('authenticated','public.application_config','UPDATE'),
 'raw point and configuration updates remain closed');
select ok(not has_function_privilege('anon','public.set_participation_rate(numeric)','EXECUTE')
 and not has_function_privilege('anon','public.remove_participation_award(bigint)','EXECUTE'),
 'anonymous caller cannot execute new mutations');
select is((select starts_at from private.half_year_bounds('2026-07-01 05:59:59+00')),
 '2026-01-01 07:00+00'::timestamptz,'June 30 Denver evening remains in H1');
select is((select ends_at from private.half_year_bounds('2026-07-01 05:59:59+00')),
 '2026-07-01 06:00+00'::timestamptz,'H1 ends at Denver midnight after DST shift');
select is((select starts_at from private.half_year_bounds('2026-07-01 06:00+00')),
 '2026-07-01 06:00+00'::timestamptz,'July 1 Denver midnight starts H2');
select is((select ends_at from private.half_year_bounds('2026-12-31 23:59:59-07')),
 '2027-01-01 07:00+00'::timestamptz,'December 31 Denver evening remains H2');
select is((select starts_at from private.half_year_bounds('2027-01-01 07:00+00')),
 '2027-01-01 07:00+00'::timestamptz,'January 1 Denver midnight starts H1');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
set local role authenticated;
select throws_ok($$select set_participation_rate(3)$$,'P0001','Admin required',
 'normal officer cannot change rate');
select throws_ok($$select remove_participation_award(-701)$$,'P0001','Admin required',
 'normal officer cannot remove award');
select throws_ok($$update application_config set participation_points_per_hour=3$$,
 '42501',null,'normal officer cannot update config directly');
select throws_ok($$update point_transactions set removed_at=now() where id=-701$$,
 '42501',null,'normal officer cannot remove award directly');
select is((select count(*) from point_history where removed_at is null),3::bigint,
 'approved officer can read active history view');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000703',true);
select throws_ok($$select set_participation_rate(3)$$,'P0001','Admin required',
 'Lead without admin role cannot change rate');
select throws_ok($$select remove_participation_award(-701)$$,'P0001','Admin required',
 'Lead without admin role cannot remove award');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
select is((select half_year_points from dashboard_summary),11::numeric,
 'Dashboard counts current Denver half-year rows and excludes prior boundary');
select is((select total_points from officer_point_totals where id=-702),111::numeric,
 'officer total includes all active history');
select throws_ok($$select set_participation_rate(0)$$,'P0001','Rate must be a finite positive number',
 'zero rate rejected');
select throws_ok($$select set_participation_rate(-1)$$,'P0001','Rate must be a finite positive number',
 'negative rate rejected');
select throws_ok($$select set_participation_rate('NaN'::numeric)$$,
 'P0001','Rate must be a finite positive number','NaN rate rejected');
select throws_ok($$select set_participation_rate('Infinity'::numeric)$$,
 'P0001','Rate must be a finite positive number','infinite rate rejected');
select throws_ok($$select set_participation_rate(null)$$,
 'P0001','Rate must be a finite positive number','null rate rejected');
select is((select count(*) from audit_logs where action='config.participation_rate_changed'),0::bigint,
 'invalid and unauthorized rate attempts produce no audit');
select lives_ok($$select set_participation_rate(1.25)$$,'fractional positive rate accepted');
select is((select participation_points_per_hour from application_config where id=1),1.25::numeric,
 'database row is current participation rate');
select ok((select updated_at > now()-interval '1 day' from application_config where id=1),
 'rate update advances updated_at');
select is((select details ->> 'old_rate' from audit_logs where action='config.participation_rate_changed'),
 '1','rate audit retains old value');
select is((select details ->> 'new_rate' from audit_logs where action='config.participation_rate_changed'),
 '1.25','rate audit retains new value');
select is((select actor_id from audit_logs where action='config.participation_rate_changed'),
 '00000000-0000-4000-8000-000000000701'::uuid,'rate actor comes from authenticated admin');
select lives_ok($$select set_participation_rate(1.25)$$,'same rate is harmless');
select is((select count(*) from audit_logs where action='config.participation_rate_changed'),1::bigint,
 'no-op rate update adds no duplicate audit');
select is((select participation_points_per_hour_at_end from events where id=-701),2::numeric,
 'historical event snapshot is unchanged');
select is((select points from point_transactions where id=-701),10::numeric,
 'historical award amount is unchanged');

select lives_ok($$select add_manual_transaction(-702,2.5,'Extra work','manual')$$,
 'admin creates positive fractional manual transaction');
select lives_ok($$select add_manual_transaction(-702,-1,'Manual deduction','manual')$$,
 'admin creates negative manual transaction');
select lives_ok($$select add_manual_transaction(-702,-0.5,'Fix earlier entry','correction',-701)$$,
 'admin creates explicit negative correction');
select is((select award_type from point_transactions where reason='Fix earlier entry'),
 'correction','correction intent is explicit');
select is((select created_by from point_transactions where reason='Fix earlier entry'),
 '00000000-0000-4000-8000-000000000701'::uuid,'manual/correction actor is authenticated admin');
select is((select points from point_transactions where id=-701),10::numeric,
 'correction does not rewrite original award');
select is((select total_points from officer_point_totals where id=-702),112::numeric,
 'signed manual and correction transactions change derived total');
select is((select count(*) from audit_logs where action='points.manual_created'),2::bigint,
 'manual transactions have one audit each');
select is((select count(*) from audit_logs where action='points.correction_created'),1::bigint,
 'correction has distinct audit action');
select throws_ok($$select add_manual_transaction(-702,0,'Zero','manual')$$,
 'P0001','Invalid point value','zero manual transaction rejected');
select throws_ok($$select add_manual_transaction(-702,1,' ','manual')$$,
 'P0001','Reason required','blank reason rejected');
select throws_ok($$select remove_participation_award((select id from point_transactions where reason='Fix earlier entry'))$$,
 'P0001','Only participation awards can be removed','correction cannot be logically removed');
select throws_ok($$select remove_participation_award(-999999)$$,
 'P0001','Point transaction not found','unknown award is rejected');
select is(remove_participation_award(-701),true,'admin removes active participation award');
select ok((select removed_at is not null from point_transactions where id=-701),
 'removal sets timestamp and retains row');
select is((select removed_by from point_transactions where id=-701),
 '00000000-0000-4000-8000-000000000701'::uuid,'removal actor comes from authenticated admin');
select is((select total_points from officer_point_totals where id=-702),102::numeric,
 'removed award leaves all-time officer total');
select is((select half_year_points from dashboard_summary),2::numeric,
 'removed award leaves Denver half-year Dashboard total');
select is((select count(*) from point_history where id=-701 and removed_at is null),0::bigint,
 'ordinary active history excludes removed award');
select is((select count(*) from point_history where id=-701 and removed_at is not null),1::bigint,
 'removed award remains available to admin history filter');
select is((select details ->> 'reason' from audit_logs where action='points.participation_removed'),
 'Scheduled participation','removal audit retains original reason');
select is((select details ->> 'points' from audit_logs where action='points.participation_removed'),
 '10','removal audit retains original amount');
select is((select details ->> 'created_at' from audit_logs where action='points.participation_removed'),
 (select to_jsonb(created_at) #>> '{}' from point_transactions where id=-701),
 'removal audit retains original creation timestamp');
select is((select actor_id from audit_logs where action='points.participation_removed'),
 '00000000-0000-4000-8000-000000000701'::uuid,'removal audit actor is admin');
select set_config('test.removed_at',(select removed_at::text from point_transactions where id=-701),true);
select is(remove_participation_award(-701),false,'repeat removal reports no-op');
select is((select removed_at::text from point_transactions where id=-701),
 current_setting('test.removed_at'),'repeat removal keeps original timestamp');
select is((select count(*) from audit_logs where action='points.participation_removed'),1::bigint,
 'repeat and failed removals add no success audit');
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-702,-701,10,'Regenerate','participation')$$,
 '42501',null,'authenticated caller cannot directly regenerate award');
reset role;
select throws_ok($$insert into point_transactions(officer_id,event_id,points,reason,award_type)
 values(-702,-701,10,'Regenerate','participation')$$,
 '23505',null,'database uniqueness also prevents regeneration after removal');

-- A matching old row remains findable even when newer history fills page one.
insert into point_transactions(officer_id,event_id,points,reason,award_type,created_at)
 select -702,null,1,'Filler '||n,'manual',now()-n*interval '1 minute'
 from generate_series(1,30) n;
insert into point_transactions(officer_id,event_id,points,reason,award_type,created_at)
 values(-702,null,1,'Needle older transaction','manual',now()-interval '1 day');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
set local role authenticated;
select ok((select count(*) from point_history
 where created_at>(select created_at from point_history where reason='Needle older transaction'))>25,
 'older transaction lies beyond first page');
select is((select count(*) from (select id from point_history
 where search_text ilike '%Needle%' order by created_at desc limit 25) matches),1::bigint,
 'database search finds matching older transaction before pagination');
select ok((select count(*) from point_history where search_text ilike '%PR7 Event%')>=1,
 'search includes event name');
select ok((select count(*) from point_history where search_text ilike '%Officer PR7%')>=1,
 'search includes officer name');
select * from finish();
rollback;
