-- All rows come from the existing synthetic populated upgrade fixtures.
-- Include legacy availability flags and every historical catalog reference.
create table upgrade_fixture.pre_recoverable_positions as
 select id,to_jsonb(p) original from public.positions p;
create table upgrade_fixture.pre_recoverable_branches as
 select id,to_jsonb(b) original from public.branches b;
create table upgrade_fixture.pre_recoverable_types as
 select id,to_jsonb(t) original from public.event_types t;
create table upgrade_fixture.pre_recoverable_locations as
 select id,to_jsonb(l) original from public.event_locations l;
create table upgrade_fixture.pre_recoverable_events as
 select id,event_type_id,location,location_id from public.events;
create table upgrade_fixture.pre_recoverable_memberships as
 select officer_id,branch_id from public.officer_branches;
