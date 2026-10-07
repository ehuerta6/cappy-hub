-- cappy-hub: approve-destructive-migration
-- reason: current app uses supported RPCs with no remaining callers; #135 already retired completion and approval access
drop function public.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint);
drop function private.save_event(text,text,bigint,text,timestamptz,timestamptz,bigint[],bigint);

drop function public.assign_task(bigint,bigint);
drop function private.assign_task(bigint,bigint);
drop function public.complete_task(bigint);
drop function public.approve_task(bigint);
drop function private.complete_task(bigint);
drop function private.approve_task(bigint);
drop function private.award_task(bigint);
