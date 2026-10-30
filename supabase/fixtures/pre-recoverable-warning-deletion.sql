create table upgrade_fixture.pre_recoverable_warning_rows as
  select id,officer_id,reason,status,created_at,voided_at,voided_by
  from public.officer_warnings;
create table upgrade_fixture.pre_recoverable_warning_approvals as
  select warning_id,approver_id,to_jsonb(a) original
  from public.warning_approvals a;
