# Local Development

Cappy Hub uses Supabase locally. Local and production databases have the same schema and database behavior, but different rows: local uses synthetic test data and production has real CIC data. Rows are never copied between them.

## First-time setup

Run:

```bash
npm run local:setup
npm run dev
```

`local:setup` runs the full local reset. It starts Supabase, replays migrations, loads the synthetic `supabase/seed.sql`, creates local Auth test accounts, links those accounts to synthetic officers, and writes local configuration to `.env.local`. If Supabase is already running and you need local environment configuration without resetting the database, run `npm run local:env`.

## Optional Google Calendar sandbox sync

Google Calendar calls are disabled in ordinary local development and CI. The optional live integration is restricted to a local Supabase database and the dedicated `CAPPYHUB TEST` calendar. It authenticates through short-lived impersonation of `cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com`; it does not use the Cappy Hub Google OAuth sign-in session or a downloaded Service Account key.

Add these non-secret settings to the ignored `.env.local`, using the sandbox Calendar ID supplied to the maintainer and the origin where the local Next.js app is running:

```dotenv
GOOGLE_CALENDAR_MODE=
GOOGLE_CALENDAR_ID=
CAPPY_HUB_APP_ORIGIN=
```

Set `GOOGLE_CALENDAR_MODE` to `local-test`. `npm run local:env`, `npm run local:setup`, and `npm run local:reset` write the local Supabase service secret as `SUPABASE_SECRET_KEY` for trusted server-side work; the file is restricted to the current user and the secret is never a `NEXT_PUBLIC_` variable. Do not copy that secret or the sandbox Calendar ID into tracked files.

The local developer identity must be granted `roles/iam.serviceAccountTokenCreator` on the testing Service Account by a maintainer. Then authenticate ADC with:

```bash
gcloud auth application-default login --impersonate-service-account=cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com
```

The server verifies that ADC is an impersonated credential for that exact Service Account, Supabase points to local `127.0.0.1:54321`/`localhost:54321`, and the configured Calendar metadata matches the explicit destination. A shared Calendar does not need to appear in the Service Account's CalendarList; the sandbox smoke test verifies writer permission through Event create/update/delete operations. Event changes enter PostgreSQL transactionally. An active local Officer can explicitly process pending work by POSTing to `/api/google-calendar/sync`; this is a manual local test trigger and does not run by default. POST `/api/google-calendar/smoke` to verify Calendar metadata, create a uniquely marked synthetic Event, read it, modify its title/time, verify the change, delete only that Event, and confirm cleanup. Google failures leave Event mutations committed and durable work retryable. Disable the integration by removing `GOOGLE_CALENDAR_MODE` or setting it to any value other than `local-test`.

For Event API tests, the Service Account needs only **Make changes to events** (writer). The broader **Make changes and manage sharing** permission is not required because the local integration does not change Calendar ACLs. The sandbox smoke test verifies the Service Account can create and update Events; it does not test Officer access provisioning or revocation. Never use synthetic local Officer identities to change real Calendar sharing. Production publishing, its scheduler, CIC Calendar owner identity, and Officer ACL reconciliation remain disabled until CIC separately authorizes and configures them. This repository's `vercel.json` has no Cron Job, and the connected project metadata does not expose its plan. Vercel Hobby permits only one run per day; a once-per-minute reconciler requires Pro or Enterprise, or another CIC-approved scheduler ([Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). The current projection deliberately omits free-text location and description because the Event form accepts arbitrary text; a defensible publication source/approval policy is still needed to meet those two approved fields.

## Local test accounts

Use these emails on the local login page. Every account uses the same local-only password: `CappyLocal123!`.

| Role              | Local email                |
| ----------------- | -------------------------- |
| Admin             | `admin@cappy.test`         |
| President         | `president@cappy.test`     |
| VP Operations     | `vp-operations@cappy.test` |
| VP Academics      | `vp-academics@cappy.test`  |
| Intro Lead        | `intro-lead@cappy.test`    |
| ICPC Lead         | `icpc-lead@cappy.test`     |
| Social Lead       | `social-lead@cappy.test`   |
| Outreach Lead     | `outreach-lead@cappy.test` |
| Multi Branch Lead | `multi-lead@cappy.test`    |
| Secretary         | `secretary@cappy.test`     |
| Officer           | `officer@cappy.test`       |
| Inactive Officer  | `inactive@cappy.test`      |

These synthetic accounts are created only by the local setup/reset workflow. Never use this password or these accounts in production.

## Seeded demo scenarios

`supabase/seed.sql` adds synthetic records across Officers, Events, Points, warnings, and Tasks. Names beginning with `Mock:` identify demo Events. The Time Slot examples are:

- `Mock: Equal Slots Volunteer Fair`: three equal shifts with capacities of 3, 2, and unlimited; existing selections demonstrate available and full shifts.
- `Mock: Custom Slots Outreach Booth`: custom shifts with a gap, a full first shift, and an available second shift.
- `Mock: Processed Slots Career Day`: a past Event with separate Point transactions for selected slots and one removed selection whose award remains in history.
- `Mock: Full Capacity Workshop`: both Time Slots are full; no Event-wide capacity is applied.
- `Mock: Event Capacity Workshop`: an unslotted Event that retains Event-wide Max volunteers.
- `Mock: Weekly Coding Workshop`: two recurring occurrences with independent slots and Officer selections.

The remaining seeded records cover past, upcoming, happening, cancelled, removed, and Session Events; Point awards, corrections, and removals; warning approval states; and Tasks with no assignee, one or several assignees, completed assignments, and due-date awards. Run `npm run local:reset` to restore these examples after changing local data.

## Local UI validation and automated testing

When it materially improves confidence, an agent may use an already available supported browser-control tool for focused interactive validation of the local application with synthetic data. This is ad hoc automated browser interaction, not a permanent E2E suite. Use real clicks and controls, and inspect temporary console, network, or performance information as needed. Do not require it for every PR. Reuse the current local database when possible; `npm run local:reset` is destructive, so check whether its state must be preserved before using it. See [Rebuild local from scratch](#rebuild-local-from-scratch).

Do not add browser dependencies, committed E2E suites, CI/CD or deployment browser automation, or unapproved global browser configuration. Never use production data/accounts or automate production administrative workflows. Do not generate persistent screenshots automatically; temporary captures or observations may help during a specific investigation. Preview and Production smoke checks remain HTTP-only. Use the existing Vitest, PostgreSQL/pgTAP, migration, authorization, lint, format, type, and production build checks where applicable.

## Daily development

After pulling the latest code:

```bash
git pull
npm run local:start
npm run dev
```

`local:start` starts the full local Supabase stack. Supabase applies repository migrations when starting the local stack. This command does not reset the database. If Supabase is already running and you need to apply newly added migrations, run:

```bash
npx supabase migration up --local
```

## Rebuild local from scratch

`npm run local:reset` is destructive to the local database. It stops and starts the local stack, rebuilds the database from migrations, loads the synthetic seed, recreates Auth test accounts, and updates `.env.local`.

Use it when you intentionally want to discard local changes and return to the synthetic development dataset. It does not affect production.

## Local Supabase Studio

Studio runs at <http://localhost:54323>. Use it only with the local database. If a schema change should become part of Cappy Hub, create a migration and commit it; do not rely on a manual Studio change.

## Environment variables and credentials

`npm run local:setup` and `npm run local:reset` manage the public Supabase URL and publishable key in `.env.local`. The local setup script uses the local service-role key only on the server while creating test accounts. It does not write that key into browser environment variables.

Never commit `.env.local`, passwords, OAuth secrets, production database credentials, or Supabase service-role/secret keys.
