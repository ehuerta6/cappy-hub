-- Synthetic predecessor Warning states, with genuine historical shapes.
-- The migration must preserve statuses, void attribution and approval rows.
insert into public.officer_warnings(id,officer_id,reason,status,created_at,voided_at,voided_by)
select 933500+n,91002,'Synthetic Warning compatibility '||n,
 case when n in (1,4) then 'pending' when n in (2,5) then 'rejected' else 'approved' end,
 '2020-01-01'::timestamptz,
 case when n>3 then '2020-01-04'::timestamptz else null end,
 case when n>3 then 91004 else null end
from generate_series(1,6) n;
insert into public.warning_approvals(warning_id,approver_id,approver_officer_id,approver_role,decision,decided_at)
select id,'20000000-0000-0000-0000-000000009101',91001,'President',status,
 case when status='pending' then null else '2020-01-03'::timestamptz end
from public.officer_warnings where id between 933501 and 933506;
create table upgrade_fixture.pre_direct_admin_warnings as
 select id,to_jsonb(w) original from public.officer_warnings w;
create table upgrade_fixture.pre_direct_admin_approvals as
 select warning_id,approver_id,to_jsonb(a) original from public.warning_approvals a;
