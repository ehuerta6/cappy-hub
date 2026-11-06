# Administration and audit history

## Admin and audit history

### Current / shipped

The Admin landing page is an Admin-only directory to the existing workflows: Officer access and warning management, Position/Branch/reusable Event location catalogs, academic period configuration, and Point configuration and corrections. It does not duplicate those workflows or provide a separate analytics area.

Catalog management supports creating, renaming and reversible Delete/Restore for Event Types, Branches, custom Positions and reusable Event locations. Deleted values have a discoverable view, retain their IDs and existing relationships, and cannot be newly assigned; Restore makes the same value available again. Retired values remain readable on existing records and are omitted from new relationship choices; existing relationships can remain during unrelated edits or be removed. The six required Positions are protected from renaming, deletion, and retirement. Reusable Event locations are suggested choices; a valid Event may use a new location. Catalog Delete confirmations explain recovery and retained historical relationships. Event Type availability uses its existing catalog flag; legacy unavailable types remain in Deleted values until an explicit Admin Restore. Session type guards remain unchanged. Reusable locations remain free text on Events; deleting a suggestion retains historical text/FKs and new free-text use does not silently restore it.

**System Log was retired under #367.** The application has no user-facing audit history page or navigation destination. Audit records, their actor/target/context, trusted writers, database authorization, and integrity remain in place for Point provenance, accountability, historical compatibility, and verification.

## Audit and history expectations

Meaningful mutations should retain enough context to understand what changed, who acted, which record was affected, and when. The former System Log page was retired under #367; audit rows and trusted writers remain available to the application for provenance, accountability and historical compatibility. Actor attribution should refer to the Officer identity where supported and retain system attribution for scheduled processing. Routine reads and navigation are not audit events.

Logical removal, deactivation, cancellation, correction, retirement, void, and restore transitions preserve prior history rather than rewriting unrelated relationships. A correction changes the current effective data through an explicit action; it does not make the original action disappear. Historical compatibility fields and older audit event names may remain in data without defining a current workflow.
