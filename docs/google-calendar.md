# Google Calendar Event mirror

Cappy Hub is the source of truth. Officers manage Events through the existing
Cappy Hub workflow; each successful Event operation directly mirrors the
canonical result to the existing private CIC Google Calendar.

## How synchronization works

After the Cappy Hub Supabase mutation commits, the server loads the current
Event state and calls Google Calendar. A stable Google event ID derived from
the Cappy Hub occurrence ID makes create and later edits target the same event.
Updates and deletes use Google ETags to avoid overwriting a newer Google-side
version. Recurring Events are already materialized as separate Cappy Hub Event
rows; a recurrence operation synchronizes its affected occurrences. Signup,
withdrawal, roster, Task, and Point operations do not call Google Calendar.

Cancellation keeps the Google event visible with a `Cancelled:` title and free
availability. Restoring cancellation returns the normal representation.
Archiving deletes the Google event; restoring an eligible Event publishes it
again with the same stable ID. Past and archived Events are not published.

The mirror includes Event name, Denver date and time, location, a plain-text
general description trimmed to 800 characters, and the protected Cappy Hub
Event link. It does not include attendees, invitations, RSVP, Slides, Meeting
notes, Signup sheet links, rosters, Points, or audit data. Google-side changes
never update Cappy Hub and may be overwritten by the next normal Event
operation.

If Google Calendar fails, the Cappy Hub mutation remains saved and the Officer
sees: “Cappy Hub saved this Event, but Google Calendar could not be updated.”
There is no queued retry or periodic recovery. A later normal modification of
the Event will send its then-current canonical state again. Google Calendar
may differ from Cappy Hub until that happens.

## Initial activation

For local integration testing, run `npm run local:reset` to restore the
synthetic local Events, configure the local test-calendar values below, then
run the explicit publication command:

```sh
GOOGLE_CALENDAR_ID='CAPPYHUB TEST calendar ID' \
CAPPYHUB_TEST_CALENDAR_ID='same CAPPYHUB TEST calendar ID' \
CAPPYHUB_APP_URL='http://localhost:3000' \
CAPPYHUB_GOOGLE_CALENDAR_TEST_OPT_IN=true \
CAPPYHUB_GOOGLE_CALENDAR_PUBLISH_TEST_EVENTS=true \
npm run calendar:publish-test
```

The command refuses to run in CI, Vercel, or production; verifies local
Supabase, explicit opt-in, matching test calendar IDs, and that Google reports
the target calendar name as `CAPPYHUB TEST`; then publishes eligible synthetic
upcoming and happening Events and reads each event back from Google Calendar.
It can be rerun safely because publication uses the existing deterministic
Google Event IDs and upsert logic. It does not delete other calendar entries.

For Production activation, the club must authorize the integration identity
and calendar write access first. Publish existing upcoming and happening
Events once by opening each eligible Event in Cappy Hub and saving it. No
scheduled job or special management screen is involved.

## Configuration and security

The application never changes calendar sharing. CIC keeps the calendar private
and grants the selected integration service account writer access directly in
Google Calendar. Use the existing `cappy-hub` Google Cloud project and
`CAPPYHUB TEST` calendar for opted-in integration checks. Do not use the
production CIC calendar for development or tests.

Configure these values server-side for the Production Vercel environment only:

| Variable                                 | Purpose                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `GOOGLE_CALENDAR_ID`                     | Existing CIC Calendar ID.                                                    |
| `CAPPYHUB_APP_URL`                       | Canonical production HTTPS origin used for protected Event links.            |
| `GCP_PROJECT_NUMBER`                     | Project number for the existing Google Cloud project.                        |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`          | Workload Identity Pool trusted for Vercel OIDC.                              |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | OIDC provider ID in that pool.                                               |
| `GCP_SERVICE_ACCOUNT_EMAIL`              | Appropriately scoped service account with writer access to the CIC calendar. |
| `GCP_AUDIENCE`                           | Audience configured for the Vercel OIDC provider.                            |

Configure Workload Identity Federation to trust only this Vercel project's
Production environment and allow it to impersonate the selected service
account. Google credentials remain server-side and short-lived; no service
account JSON key is used. Preview deployments skip Google synchronization.

For local opt-in testing, use Google Application Default Credentials (ADC)
configured for short-lived impersonation of the existing test service account.
Set `GOOGLE_CALENDAR_ID` and `CAPPYHUB_TEST_CALENDAR_ID` to the same calendar
ID, verified by the command to be named `CAPPYHUB TEST`, and set
`CAPPYHUB_APP_URL=http://localhost:3000`. Ordinary local work and CI tests do
not contact Google. Never create or commit long-lived service-account key
files.
