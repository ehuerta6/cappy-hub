# Local Development

Cappy Hub uses Supabase locally. Local and production databases have the same schema and database behavior, but different rows: local uses synthetic test data and production has real CIC data. Rows are never copied between them.

## First-time setup

Run:

```bash
npm run local:setup
npm run dev
```

`local:setup` runs the full local reset. It starts Supabase, replays migrations, loads the synthetic `supabase/seed.sql`, creates local Auth test accounts, links those accounts to synthetic officers, and writes the local public URL and publishable key to `.env.local`.

## Optional Google Calendar integration test

The local `CAPPYHUB TEST` Calendar publication test is optional and makes real Google Calendar API writes. Ordinary local development and mocked tests do not need Google Cloud access. See [Google Calendar local contributor setup](google-calendar.md#optional-local-contributor-test-against-cappyhub-test) for approved access, short-lived ADC impersonation, configuration, and troubleshooting. Never use the production CIC calendar. Restoring synthetic Events with `npm run local:reset` discards local database changes.

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

The remaining seeded records cover past, upcoming, happening, cancelled, removed, and Session Events; Point awards, corrections, and removals; warning approval states; and Tasks with no assignee, one or several assignees, completed assignments, and due-date awards. Issue #403 adds a synthetic notification inbox for Officer `officer@cappy.test` (unread, read, and reviewed notices; confirmations; important updates; and Event, Task, Points, and Warning links), audience combinations on mock Events and Tasks, and date-only/timed reminder examples. Mock recurring Event and Task series show per-occurrence settings, a change applied to the selected and later occurrences, and shared settings across all occurrences. Reminder schedules include due-soon and future examples, default offsets, and customized timings. Use the bell to open recent notices or select **Inbox** for notification history. Event and Task create forms show the default audience and reminder timing; task fixtures include both date-only and timed due dates. To check a description-only Event edit, change the description of `Mock: Intro Hash Maps` locally and verify the inbox does not receive a new Event-change notice. Run `npm run local:reset` to restore these examples after changing local data. All fixtures are synthetic and must not be copied into production.

Issue #402 adds seven dedicated Officers (`Mock: Two negative Points`, `Mock: Automatic Warning group`, `Mock: Two automatic Warning groups`, `Mock: Warning limit with extra Points`, `Mock: Third Warning notification`, `Mock: Mixed manual and automatic`, and `Mock: Negative Point leaderboard`) so each lifecycle can be reviewed independently. Its Event cases are `Mock: Issue 402 Volunteer and Attendee awards` (completed two-hour Event with both award types and no attendance check), `Mock: Issue 402 choose Volunteer or Attend` (upcoming signup choice), and two separate past Events for choosing either a removed positive award or a negative Point after a missed commitment. Existing `Mock: Equal Slots Volunteer Fair` supplies the Time Slot Volunteer signup case. The Point/Warning fixtures cover two negatives below threshold, a complete three-point automatic group, two automatic groups, three manual Warnings with an extra ungrouped negative, the third-Warning leadership notification, mixed manual/automatic origins, Event- and Task-linked negatives, a positive-and-negative leaderboard, and the two separate missed-commitment remedies. The automatic Warning fixtures include their three audit links per group. `npm run test:local-seed` checks that these synthetic cases remain present after seed edits; use `npm run local:reset` to reload them for UI review.

`npm run test:local-seed` loads the seed into an empty migrations-only local database. Run `npm run db:reset` before the verifier; after it completes, run `npm run local:reset` to restore the full app stack and synthetic sign-in accounts for browser review.

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
