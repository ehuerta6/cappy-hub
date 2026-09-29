begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();


insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000000101','utep@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000102','personal@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000103','unknown@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000104','inactive@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000105','original-owner@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000106','claimed@example.org',now(),' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000107','unconfirmed@example.org',null,' {"provider":"google"} '::jsonb),
  ('00000000-0000-4000-8000-000000000108','nongoogle@example.org',now(),' {"provider":"email"} '::jsonb),
  ('00000000-0000-4000-8000-000000000109','ambiguous@example.org',now(),' {"provider":"google"} '::jsonb);

insert into officers(id,name,position_id,utep_email,personal_email,status) values
  (-101,'UTEP test',(select id from positions where name='Officer'),'UTEP@Example.org',null,'active'),
  (-102,'Personal test',(select id from positions where name='Officer'),null,'PERSONAL@Example.org','active'),
  (-104,'Inactive test',(select id from positions where name='Officer'),'inactive@example.org',null,'inactive'),
  (-105,'Claimed test',(select id from positions where name='Officer'),'claimed@example.org',null,'active'),
  (-107,'Unconfirmed test',(select id from positions where name='Officer'),'unconfirmed@example.org',null,'active'),
  (-108,'Non-Google test',(select id from positions where name='Officer'),'nongoogle@example.org',null,'active');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
set local role authenticated;
select is(claim_current_officer_identity(),-101::bigint,'verified UTEP email links ignoring case');
reset role;
update auth.users set email='changed@example.org' where id=auth.uid();
select is(claim_current_officer_identity(),-101::bigint,'existing link survives a later contact email change');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select is(claim_current_officer_identity(),-102::bigint,'verified personal email links ignoring case');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select is(claim_current_officer_identity(),null::bigint,'unknown email is rejected without creating an officer');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000104',true);
select is(claim_current_officer_identity(),null::bigint,'inactive officer cannot first link');

update officers set auth_user_id='00000000-0000-4000-8000-000000000105' where id=-105;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000106',true);
select is(claim_current_officer_identity(),null::bigint,'another account cannot steal a claimed officer');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000107',true);
select is(claim_current_officer_identity(),null::bigint,'unconfirmed email is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000108',true);
select is(claim_current_officer_identity(),null::bigint,'non-Google identity is rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
update officers set status='inactive' where id=-101;
select is(claim_current_officer_identity(),null::bigint,'deactivation denies an already linked account');

-- Simulate damaged legacy data despite the current cross-column identity trigger.
alter table officers disable trigger officers_email_identity;
insert into officers(id,name,position_id,utep_email) values
  (-109,'Ambiguous one',(select id from positions where name='Officer'),'ambiguous@example.org');
insert into officers(id,name,position_id,personal_email) values
  (-110,'Ambiguous two',(select id from positions where name='Officer'),'ambiguous@example.org');
alter table officers enable trigger officers_email_identity;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000109',true);
select is(claim_current_officer_identity(),null::bigint,'ambiguous officer email fails closed');

select * from finish();
rollback;
