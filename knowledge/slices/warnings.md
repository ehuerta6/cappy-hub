# Warning workflow

**Status:** Direct Admin management and reversible deletion are shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); production deployment is not established here. Legacy approval records and decisions are historical data, not the normal current workflow.

**Actors:** Admins create, correct, Delete/Restore, and review Warnings; Officers see eligible Warnings on their own profiles; historical approvers remain relevant only for legacy records.

Admins create effective Warnings and may correct reasons. New records do not wait for leadership votes. Older pending/rejected statuses and approval assignments remain visible where needed for historical compatibility; an edit does not convert those records into approved Warnings. Current Warnings can be reversibly deleted/restored; this lifecycle is distinct from the older terminal Void action and preserves provenance. The approved sources are [Warnings](../../docs/product/warnings.md), [Administration and audit history](../../docs/product/administration-audit.md), and decisions for [#335 and #336](../../docs/product/planned-accepted.md).

Warnings connect to Officer profiles and review decisions but do not control Officer access automatically. Three active approved Warnings flag an Officer for Admin review; they do not deactivate the Officer. Keep warning counts, Officer lifecycle and account authorization distinct (see [Officers](officers.md) and [Identity and access](identity-access.md)).

Implementation evidence: [Warning actions](../../app/%28protected%29/officers/warning-actions.ts), [direct Admin Warning migration](../../supabase/migrations/20261030043535_direct_admin_warnings.sql), [reversible deletion migration](../../supabase/migrations/20261030180000_recoverable_warning_deletion.sql), [legacy lifecycle migration](../../supabase/migrations/20260929041159_warning_lifecycle.sql), and [action tests](../../tests/warning-actions.test.ts). The retirement of the everyday approval workflow did not erase historical rows.

**Aliases:** discipline, warning, threshold, active warning, pending/rejected legacy approval, Void, Delete/Restore, Admin review.
