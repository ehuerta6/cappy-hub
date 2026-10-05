-- Retire the legacy Task completion and approval API after production moved to
-- the manager-controlled Task workflow. Keep all function definitions and
-- historical assignment, approval, point, and audit data intact.
revoke all on function public.complete_task(bigint),
  public.approve_task(bigint),
  private.complete_task(bigint),
  private.approve_task(bigint),
  private.award_task(bigint)
  from public, anon, authenticated;
