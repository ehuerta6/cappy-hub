# Maintainers

Cappy Hub is maintained by the **Coding Interview Club**. Maintainers review contributions, clarify expected behavior, and decide what is merged into `main`.

Keep the application and its documentation understandable so future CIC officers can continue maintaining it.

Before enabling production smoke verification, configure the non-secret `PRODUCTION_APP_URL` variable in GitHub's `production` environment and confirm Vercel system environment variables are enabled. See [Production deployment](database-development.md#production-deployment) for the ordered deployment steps and configuration, and [Production smoke verification](database-development.md#production-smoke-verification) for checks, timeouts, limitations, and failure troubleshooting. A failed smoke check requires inspection; it does not roll back migrations or deployment.

## Semester Officer and Admin access review

At each semester transition and leadership turnover, an authorized maintainer should review the Officer directory and application access:

- Compare the active Officer roster with current CIC membership and leadership. Deactivate Officers who left active CIC operations; create or reactivate incoming Officers as needed.
- Verify each Officer's Position and Branch memberships reflect current responsibilities. A leadership Position does not itself grant Admin privileges.
- Review every Officer with `application_role = admin` and remove Admin privileges no longer required. Confirm the existing last-active-Admin safeguard leaves valid administration access.
- After roster changes, verify expected Officer authentication links and sign-in. Do not share or record credentials or privileged secrets as part of this review.
- If retired catalog entries are available, confirm they remain retired and are not assigned to current Officers; retain referenced catalog records and historical relationships.
- Confirm historical Event, Task, Point, and Warning records remain intact. Record the review and any follow-up in the team's existing maintainer record; do not delete former Officers or rewrite history.
