# Officers

## Officers

### Current / shipped

Admins create and edit Officer profiles, manage application roles through the access workflow, and can deactivate or reactivate Officers. Profiles expose Officer identity, Position, Branches, status, associated Event participation, warnings according to visibility rules, total Points, and Point history. The directory supports name/email search and status, Position, and Branch filters.

Deactivation preserves the Officer row, authentication link, and Event, Task, Warning, Point, and audit references, including existing Event signups. It is a lifecycle change, not routine hard deletion. Inactive Officers cannot access protected workflows or be newly signed up, assigned, or selected as a manual Point recipient through trusted mutations. The Officers directory defaults to Active and offers explicit Active, Inactive, and All views; routine Point totals and new recipient selectors include only active Officers. Point history and Officer profiles remain available for historical records. Position, Branches, and application role are not implicitly changed by deactivation or reactivation.

Position authorization uses stable, non-null machine codes only for the six required Positions: President, Vice President of Operations, Vice President of Academics, Secretary, Lead, and Officer. These codes are independent of display names, and the required Positions cannot be renamed, deleted, or retired. Every Position has a stable database ID; custom Positions intentionally retain `code = NULL`, so changing or copying a display name cannot grant system privileges. Admins may create and rename custom Positions and use reversible Delete/Restore, including when historical records reference them. Branches use the same recoverable CRUD. Delete preserves catalog IDs and dependent records; previously retired values remain unavailable and recoverable from Deleted values. Retired Branches and custom Positions remain readable through existing relationships but cannot be newly assigned. An existing relationship can remain during an unrelated edit or be removed.

### Planned / accepted
