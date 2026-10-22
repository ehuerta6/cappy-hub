# Google Calendar Event mirror

Cappy Hub remains the source of truth. The integration mirrors one Google event
per Cappy Hub Event occurrence to the existing private CIC calendar. Officers
continue to create, edit, cancel, archive, and restore Events through the
current Cappy Hub workflow.

## How synchronization works

An Event-row trigger writes only its stable Cappy Hub ID to a private,
transactional retry table. It runs for Event creation and changes to published
fields or lifecycle state. Signup, withdrawal, Task, and Point changes do not
enqueue mirror work. A one-time migration backfill queues Events that are
upcoming or happening when the integration is activated.

The Vercel Cron route claims a small batch, reads each Event's latest canonical
row, and then creates, updates, or deletes its deterministic Google event ID.
Recurring Events are already materialized as separate Event rows, so each
affected occurrence is synchronized independently. The worker has a 60-second
execution limit, each Google request has a five-second timeout, and queue leases
last five minutes. Revision checks keep stale workers from clearing newer work.
A small per-Event generation marker remains after success, so a delayed older
worker that completes after a newer worker triggers a corrective sync. Google
ETags guard updates and deletes with `If-Match`; a timed-out request that arrives
after a newer write receives a precondition failure and is retried from the
latest Cappy Hub state. Concurrent duplicate inserts are retried by deterministic
ID instead of falling back to an unguarded update.
Temporary failures are recorded and retried with capped exponential backoff.
Vercel Function logs report failed retries; the queue's last error and attempt
time are also available to authorized database operators.

Cancelled Events remain visible with a `Cancelled:` title and free
availability. Archive uses Google Calendar deletion; restore republishes the
same deterministic ID. No attendee list, invitations, RSVP, Slides link,
Meeting notes link, Signup sheet link, roster, Point, or audit data is sent.
Only the Event's general description is published as plain text, trimmed to
800 characters. That description is already visible to active Cappy Hub
Officers; the canonical Cappy Hub detail URL remains protected by Cappy Hub
authentication. Google-side edits never update Cappy Hub and are overwritten
by the next Cappy Hub sync.

The existing Supabase `pg_cron` jobs invoke database-only Point and Task
processors; this repository has no database HTTP client or deployed Supabase
Function. The focused Vercel Cron route is therefore used for external API
work. It runs once per minute in production. Current Vercel plan limits require
a Pro or Enterprise plan for that frequency; confirm the connected project
supports it before production activation.

## Activation configuration

The application code never changes calendar sharing. CIC must keep the target
calendar private and grant the selected integration service account writer
access directly in Google Calendar. Use the existing `cappy-hub` Google Cloud
project and the `CAPPYHUB TEST` calendar for opted-in integration checks. Do not
use the production CIC calendar for development or tests.

Configure these server-side values for the production Vercel project:

| Variable                                 | Purpose                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CALENDAR_ID`                     | Existing CIC Calendar ID.                                                                                     |
| `CAPPYHUB_APP_URL`                       | Canonical production HTTPS origin used for protected Event links.                                             |
| `CRON_SECRET`                            | Random secret of at least 16 characters; authenticates the scheduled route.                                   |
| `SUPABASE_SERVICE_ROLE_KEY`              | Server-only key used by the sync worker to read Events and claim retry work. Never expose it to browser code. |
| `GCP_PROJECT_NUMBER`                     | Project number for the existing Google Cloud project.                                                         |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`          | Workload Identity Pool trusted for Vercel OIDC.                                                               |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | OIDC provider ID in that pool.                                                                                |
| `GCP_SERVICE_ACCOUNT_EMAIL`              | Existing, appropriately scoped service account with writer access to the CIC calendar.                        |
| `GCP_AUDIENCE`                           | Audience configured for the Vercel OIDC provider.                                                             |

Configure Google Workload Identity Federation to trust only this Vercel
project's Production environment and allow it to impersonate the selected
service account. This uses short-lived credentials and does not require a
service-account JSON key. Enable the Google Calendar API in the existing
project. Configure the Vercel Cron and OIDC settings only after CIC authorizes
the integration identity and calendar write access.

For local opt-in testing, use Google Application Default Credentials (ADC)
configured for short-lived impersonation of the existing test service account,
set `GOOGLE_CALENDAR_ID` to the `CAPPYHUB TEST` calendar, and set
`CAPPYHUB_APP_URL` to the local origin. Ordinary local work and CI tests use
mocked Google API responses and do not contact Google. Never create or commit
long-lived service-account key files.

## Operational behavior

Event saves commit independently of Google availability. The mirror may lag
until a scheduled pass succeeds. Failures remain retryable; operators can
inspect Vercel Cron logs and `private.google_calendar_event_sync` when
diagnosing a stalled item, including the last safe error and next retry time.
Missing calendar credentials or service-role
configuration leaves Cappy Hub Event management working while sync retries
remain unavailable; complete the production activation settings before
enabling the Cron schedule.
