# Warnings

## Warnings

### Current / shipped

Admins create immediately effective Warnings with a nonblank reason; no leadership approval is required. Admins can correct the reason on current or historical records, including voided Warnings. Corrections preserve the recipient, original creation time, status, lifecycle and historical approval rows, and record meaningful before/after reasons with actor attribution in audit history. An unrelated edit never approves a historical pending or rejected Warning.

Historical pending and rejected Warnings remain visible to Admins; the read-only legacy assignment view preserves assigned approver visibility. The existing trusted decision RPC remains compatible with explicitly deciding a legacy pending snapshot; new Warnings have no approval rows and cannot receive votes. Officers see approved, non-voided Warnings on their own profile. Only active approved Warnings count toward the threshold. Three active approved Warnings flag the Officer for Admin review; they do not automatically deactivate the Officer. Admins void Warnings to remove them from active totals while preserving their reason, original status, approvers, decisions, and timestamps. Voided Warnings cannot receive decisions. Admins can deliberately inspect Voided or All history. Void is terminal; issuing a new Warning creates a new record. Voiding is audited, and historical `warning.deleted` entries remain unchanged.
