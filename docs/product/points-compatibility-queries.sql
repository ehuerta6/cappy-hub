-- Issue #326. Review points-compatibility.md BEFORE requesting live execution.
-- No production execution is authorized by this file. Use an independently
-- authorized read-only database session with visibility of all relevant rows;
-- an application/RLS-limited session cannot establish global completeness.
-- Output is aggregate only: no IDs, names, emails, reasons or raw audit JSON.
-- Do not invoke processors or mutation RPCs as part of an assessment.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

-- Q1: configured rate NOW is not the historical rate distribution.
select 'Q1_current_config' as evidence, participation_points_per_hour as rate, count(*) as rows
from public.application_config group by participation_points_per_hour;
select 'Q1_event_snapshots' as evidence, participation_points_per_hour_at_end as rate,
 count(*) as events
from public.events group by participation_points_per_hour_at_end order by rate nulls first;
-- Older/newer rate values are safe to emit only when they are numeric JSON.
select 'Q1_rate_audit' as evidence,
 case when jsonb_typeof(details->'old_rate')='number' then details->'old_rate' end as old_rate,
 case when jsonb_typeof(details->'new_rate')='number' then details->'new_rate' end as new_rate,
 count(*) as changes
from public.audit_logs where action='config.participation_rate_changed'
group by 2,3 order by 2,3;
select 'Q1_processing_audit' as evidence,
 case when jsonb_typeof(details->'rate')='number' then details->'rate' end as rate,
 count(*) as processed_records
from public.audit_logs where action='event.participation_processed'
group by 2 order by 2;
select 'Q1_award_creation_audit' as evidence,
 case when jsonb_typeof(details->'rate')='number' then details->'rate' end as rate,
 count(*) as creation_records
from public.audit_logs where action='points.participation_created'
group by 2 order by 2;

-- Q2: keep all categories, independent transactions, signed values, removals
-- and edit markers. A NULL Auth actor does not prove no human ever changed it.
select 'Q2_transactions' as evidence, award_type, event_id is not null as event_linked,
 task_id is not null as task_linked, event_time_slot_id is not null as slot_linked,
 removed_at is not null as removed, slot_selection_removed,
 updated_at is not null as has_edit_marker, count(*) as transactions,
 count(*) filter(where points<0) as negative, count(*) filter(where points=0) as zero,
 sum(points) as recorded_points
from public.point_transactions group by 2,3,4,5,6,7,8 order by 2,3,4,5,6,7,8;
select 'Q2_actor_coverage' as evidence, award_type, count(*) as transactions,
 count(*) filter(where created_by is not null and created_by_officer_id is null) as missing_stable_creator,
 count(*) filter(where updated_at is not null and updated_by_officer_id is null) as missing_stable_editor,
 count(*) filter(where removed_at is not null and removed_by_officer_id is null) as missing_stable_remover
from public.point_transactions group by award_type order by award_type;

-- Q3: inventory direct edits separately from known system slot recalculation.
-- Audit shapes differ: Admin edit has before/after, slot recalculation has
-- before_points/after_points and update_source. Never export entire details.
select 'Q3_edit_audit' as evidence,
 case when details->>'update_source'='slot_reconciliation' then 'slot_reconciliation'
   when details ? 'before' and details ? 'after' then 'before_after_edit'
   else 'other_or_legacy' end as shape,
 actor_officer_id is not null as stable_actor, count(*) as updates
from public.audit_logs where action='points.transaction_updated' group by 2,3 order by 2,3;
select 'Q3_edit_coverage' as evidence, p.award_type,
 count(*) filter(where p.updated_at is not null) as marked_edited,
 count(*) filter(where p.updated_at is not null and not exists(
   select 1 from public.audit_logs a where a.action='points.transaction_updated'
     and a.entity_type='point_transaction' and a.entity_id=p.id::text)) as marked_without_update_audit
from public.point_transactions p group by p.award_type order by p.award_type;
-- Diagnostic ONLY: a mismatch can be a schedule correction, changed slot,
-- direct edit or legacy origin. Current schedule is not the original basis.
select 'Q3_current_basis_comparison' as evidence,
 p.event_time_slot_id is not null as slotted, p.updated_at is not null as marked_edited,
 e.participation_points_per_hour_at_end is null as missing_snapshot, count(*) as awards,
 count(*) filter(where e.participation_points_per_hour_at_end is not null and p.points is distinct from
   (extract(epoch from (coalesce(s.ends_at,e.ends_at)-coalesce(s.starts_at,e.starts_at)))::numeric/3600
     * e.participation_points_per_hour_at_end)) as differs_from_current_basis
from public.point_transactions p join public.events e on e.id=p.event_id
left join public.event_time_slots s on s.id=p.event_time_slot_id and s.event_id=p.event_id
where p.award_type='participation' group by 2,3,4 order by 2,3,4;

-- Q4: these are observable states, NEVER intent classifications. In particular
-- removed_at before a schedule edit does not mean the removal was premature.
select 'Q4_removed_awards' as evidence, p.award_type, p.slot_selection_removed,
 e.status='cancelled' as event_cancelled, e.deleted_at is not null as event_archived,
 count(*) as removed_transactions,
 count(*) filter(where exists(select 1 from public.audit_logs a
   where a.entity_type='point_transaction' and a.entity_id=p.id::text
     and a.action in ('points.participation_removed','points.transaction_removed'))) as with_removal_audit
from public.point_transactions p left join public.events e on e.id=p.event_id
where p.removed_at is not null group by 2,3,4,5 order by 2,3,4,5;
with state as (
 select e.status,e.deleted_at is not null as archived,
   e.participation_points_per_hour_at_end is not null as snapshotted,
   e.ends_at<=transaction_timestamp() as ended,
   (select count(*) from public.event_officers x where x.event_id=e.id) as signups,
   (select count(*) from public.point_transactions p where p.event_id=e.id) as all_points,
   (select count(*) from public.point_transactions p where p.event_id=e.id
     and p.removed_at is null) as active_points,
   (select count(*) from public.point_transactions p where p.event_id=e.id
     and p.award_type='participation') as participation
 from public.events e
)
select 'Q4_event_lifecycle' as evidence, status,archived,snapshotted,ended,count(*) as events,
 sum(signups) as signups,sum(all_points) as transactions,sum(active_points) as unremoved_transactions,
 count(*) filter(where snapshotted and participation=0) as snapshot_without_participation,
 count(*) filter(where not snapshotted and participation>0) as participation_without_snapshot
from state group by 2,3,4,5 order by 2,3,4,5;

-- Q5: Warning status and void are independent; no pending/rejected promotion.
select 'Q5_warning_states' as evidence, status,voided_at is not null as voided,count(*) as warnings
from public.officer_warnings group by 2,3 order by 2,3;
select 'Q5_approval_states' as evidence, w.status,w.voided_at is not null as voided,
 a.decision,count(*) as approvals,
 count(*) filter(where a.approver_officer_id is null) as missing_stable_approver
from public.warning_approvals a join public.officer_warnings w on w.id=a.warning_id
group by 2,3,4 order by 2,3,4;
select 'Q5_warning_gaps' as evidence,
 count(*) filter(where not exists(select 1 from public.warning_approvals a where a.warning_id=w.id)) as without_approvals,
 count(*) filter(where w.voided_at is not null and not exists(select 1 from public.audit_logs a
   where a.entity_type='warning' and a.entity_id=w.id::text and a.action='warning.voided')) as void_without_audit
from public.officer_warnings w;

-- Q6: scope and completeness of available audit evidence, including older
-- deletion history which may be the only surviving evidence of deleted rows.
select 'Q6_audit_coverage' as evidence, action,count(*) as records,
 count(*) filter(where actor_officer_id is not null) as stable_actor_records
from public.audit_logs where action in (
 'event.updated','event.cancelled','event.archived','event.removed','event.restored',
 'event.participation_processed','points.participation_created','points.participation_removed',
 'points.manual_created','points.correction_created','points.transaction_updated','points.transaction_removed',
 'warning.created','warning.deleted','warning.voided','warning.approved_by_approver','warning.rejected_by_approver')
group by action order by action;

rollback;
