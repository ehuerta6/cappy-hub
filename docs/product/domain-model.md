# Product domain model

## Core domain model

| Record            | Meaning and relationship                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officer           | Durable identity, status, one Position, optional Branch memberships, and optional unique authentication link.                                                       |
| Position          | Club title with a stable database ID. The six required system Positions have stable machine codes for authorization; custom Positions keep a null code.             |
| Branch            | Organizational scope used for Officer membership and branch-scoped Events and Tasks.                                                                                |
| Event             | Scheduled occurrence with one catalog Event Type, optional Branches, native Officer signups, resource links, and participation Point transactions.                  |
| Task              | Dated unit of Officer work with one Branch, zero or more Officer assignments, completion state per assignment, and optional Task Points.                            |
| Point transaction | Attributed signed transaction for Event participation, Task work, manual award, or correction. Removed transactions remain in history but are excluded from totals. |
| Warning           | Admin-managed Officer record with audited corrections and preserved historical leadership decisions.                                                                |
| Event/Task series | Recurrence definition that creates and relates real, independently addressable Event or Task occurrence rows.                                                       |
| Audit entry       | Record of a meaningful mutation, with actor, entity, time, and useful context.                                                                                      |

Zero Event Branches means a global Event. Branches do not define Positions or application roles.
