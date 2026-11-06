# Officer profile and related work

**Actors:** an Officer viewing their own permitted information, or an authorized manager viewing the directory/profile. **Entry:** the Officers directory and an Officer profile.

1. The directory supports name/email search and status, Position, and Branch filters. Managers create/edit records and use the access workflow for application-role changes.
2. The profile presents the Officer identity and lifecycle/access context with related Event participation, Tasks, Warnings according to visibility rules, total Points, and Point history.
3. Deactivation preserves the Officer identity and historical relationships. It blocks protected access and eligibility for new signup, assignment, and manual Point recipient selection through trusted boundaries.
4. Historical records remain linked to the same Officer for review; changing Position or Branch membership is a separate management action and does not rewrite historical attribution.

**Sources:** [Officer contract](../product/officers.md), [authorization](../product/authorization.md), [Points](../product/points.md), [Warnings](../product/warnings.md), [design screens](../design/screens.md), `app/(protected)/officers/`, `lib/current-officer.ts`, migrations `20260927010717_officer_management.sql` and `20260928132955_authorization_foundation.sql`.
