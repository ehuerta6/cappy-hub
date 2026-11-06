# Academic periods

**Status:** Shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); repository evidence does not establish production deployment. The approved #369 work is recorded as [PR #374](https://github.com/ehuerta6/cappy-hub/pull/374).

**Actors:** Admins configure date ranges; Officers choose the period context for domain views.

Admins create and maintain inclusive date ranges; Officers select a period context for viewing domain data. Period ranges may have gaps but cannot overlap or share a calendar day. The current period is computed from the database clock in America/Denver, not stored as a flag or advanced by a scheduled job. The selected period is carried in the URL. Full rules and rationale are in [approved decisions](../../docs/product/planned-accepted.md) and [product scope/status conventions](../../docs/product/scope-architecture.md).

Periods shape views over existing records rather than create period-specific copies: Events use event date, Tasks use due date, and Points use their domain activity date. Past views are read-only; future periods remain editable. Officer/catalog directories and Warnings stay global. This deserves a separate slice from [catalog administration](admin-catalogs.md): period ranges are a shared temporal context across domains, whereas catalogs configure selectable values within individual workflows. For record identity and access boundaries, see [Officers](officers.md) and [Identity and access](identity-access.md).

**Slice boundary:** Covers shared academic date ranges and period-selected domain views; individual Event/Task/Point behavior remains in the owning workflow slices.

Implementation evidence: [period page](../../app/%28protected%29/admin/periods/page.tsx), [period actions](../../app/%28protected%29/admin/periods/actions.ts), [academic-period migration](../../supabase/migrations/20261101000000_academic_periods.sql), [secure period views migration](../../supabase/migrations/20261102000000_secure_period_views.sql), and [database period tests](../../supabase/tests/database/academic_periods.test.sql).

**Aliases:** academic term, semester, date range, current period, period selector, URL period context, historical/future period.
