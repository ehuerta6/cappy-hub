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

For the optional local test, see [the contributor setup below](#optional-local-contributor-test-against-cappyhub-test). It covers approved access, ADC impersonation, local synthetic data, the required variables, and the real Calendar API writes.

For Production activation, the club must authorize the integration identity
and calendar write access first. Publish existing upcoming and happening
Events once by opening each eligible Event in Cappy Hub and saving it. No
scheduled job or special management screen is involved.

## Optional local contributor test against `CAPPYHUB TEST`

Ordinary local development and the mocked Google Calendar tests do not need Google Cloud access. The opt-in `npm run calendar:publish-test` test makes real Google Calendar API writes, so use it only when the project maintainer has approved access to the existing `CAPPYHUB TEST` calendar.

### Prerequisites and access

- Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and Node/npm versions required by this repository.
- Ask the Cappy Hub maintainer for the existing test Google Cloud **project ID**, project number, test service-account email, and `CAPPYHUB TEST` calendar ID. Do not use Production service-account details or the production CIC calendar.
- Your Google account needs `roles/iam.serviceAccountTokenCreator` on the **test service account** so local ADC can impersonate it. The test service account needs the Calendar `writer` permission on `CAPPYHUB TEST` (the calendar setting **Make changes to events**). You do not need direct calendar write access as your user or broad project Owner access. If either grant is missing, ask the project/calendar maintainer; do not change IAM or calendar sharing yourself. See Google Cloud's [local ADC setup](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment) and [service-account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation) guidance.
- If you can open the test calendar in Google Calendar, its ID appears under **Settings → Settings for my calendars → CAPPYHUB TEST → Integrate calendar → Calendar ID**. Otherwise ask the maintainer to provide the ID. It identifies a calendar; it is not a credential.

### Configure short-lived ADC impersonation

Use your approved Google account to initialize the CLI, select the existing project, and create local ADC credentials that impersonate the test service account:

```sh
gcloud init
gcloud config set project '<PROJECT_ID>'
gcloud auth application-default login \
  --impersonate-service-account='<TEST_SERVICE_ACCOUNT_EMAIL>'
```

Google's supported local ADC flow uses short-lived service-account impersonation; it does not create a service-account JSON key. The account running the command must have the Token Creator permission on the target service account. To check that ADC can obtain a token without printing it in your terminal, run:

```sh
gcloud auth application-default print-access-token >/dev/null \
  && echo 'ADC impersonation is ready'
```

If `GOOGLE_APPLICATION_CREDENTIALS` is set to another credential file, unset it in the shell before running the publication test so the test uses the ADC file you just configured.

### Prepare local synthetic Events and run the test

The script only reads Events from **local Supabase** whose names start with `Mock:`. If you need to restore those examples, `npm run local:reset` rebuilds the local database and discards local database changes. Save anything you need first; the reset does not touch Production.

Set the test calendar ID in both variables; the script refuses to proceed if they differ. The app URL must be the local origin. Keep these values in your shell or ignored `.env.local`, never in committed files:

```sh
export GOOGLE_CALENDAR_ID='<CAPPYHUB_TEST_CALENDAR_ID>'
export CAPPYHUB_TEST_CALENDAR_ID='<CAPPYHUB_TEST_CALENDAR_ID>'
export CAPPYHUB_APP_URL='http://localhost:3000'
export CAPPYHUB_GOOGLE_CALENDAR_TEST_OPT_IN='true'
export CAPPYHUB_GOOGLE_CALENDAR_PUBLISH_TEST_EVENTS='true'
npm run calendar:publish-test
```

The test verifies the selected calendar's ID and exact name (`CAPPYHUB TEST`), selects eligible upcoming or happening synthetic Events, publishes each using the stable Cappy Hub Event ID, and reads the resulting events back from Google. It checks the payload and timezone, confirms no attendees were added, then publishes the same Events a second time and reads them back again to verify the stable IDs are updated without duplicates. A successful run prints `Published and verified <count> eligible synthetic Event occurrences in CAPPYHUB TEST.`

The command is opt-in because it writes real calendar events. It is not part of ordinary local setup or CI; unit tests mock Google Calendar. Never set these values to the Production CIC calendar. The test does not alter the calendar ACL or delete other calendar entries.

### Troubleshooting

- **ADC login or token check is denied:** confirm you are signed in with the approved Google account and the maintainer granted `roles/iam.serviceAccountTokenCreator` on the exact test service account. The Service Account Credentials API must be enabled in the existing project.
- **The calendar check returns 403:** confirm the provided calendar ID is the existing `CAPPYHUB TEST` calendar and that the _service account_ has the Calendar `writer` permission on it. Your own Google Calendar permission does not grant access to the impersonated service account.
- **The script says the IDs differ or the calendar name is wrong:** copy the test calendar ID into both `GOOGLE_CALENDAR_ID` and `CAPPYHUB_TEST_CALENDAR_ID`; do not use a Production calendar ID.
- **The script finds no eligible synthetic Events:** check that local Supabase is running and contains the `Mock:` Events. If you choose to restore the examples, `npm run local:reset` discards local database changes as described above.
- **The app URL is rejected:** use exactly `http://localhost:3000` or another local HTTP origin with no path, query, or fragment.

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
