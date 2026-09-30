# Cappy Hub

Cappy Hub is an internal administrative web application for the **Coding Interview Club (CIC)**.

It provides one place for CIC officers to manage:

- Officers
- Events
- Event participation
- Points
- Warnings
- Administrative activity

The goal is to keep CIC's administrative workflows simple, consistent, and easy to maintain.

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- Vitest

## Getting Started

### Requirements

Install:

- Node.js 24
- npm
- Git
- Docker Desktop

Clone the repository:

```bash
git clone https://github.com/ehuerta6/cappy-hub.git
cd cappy-hub
npm ci
```

### Local Development

Cappy Hub uses a local Supabase stack for development. The database schema is rebuilt from the same migrations used by production, then populated with synthetic officers, events, signups, points, warnings, and audit history.

No production CIC data is copied into the local environment.

Set up the local environment for the first time with:

```bash
npm run local:setup
```

To completely rebuild the local environment later, use:

```bash
npm run local:reset
```

This command:

1. Starts the full local Supabase stack.
2. Replays every migration from `supabase/migrations/`.
3. Loads the synthetic dataset from `supabase/seed.sql`.
4. Creates local Supabase Auth accounts for the main permission roles.
5. Links those accounts to their synthetic officer records.
6. Writes the local public Supabase URL and publishable key to `.env.local`.

Then start Next.js:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

When the app is connected to local Supabase, the login page provides one-click test accounts for:

- Admin
- President
- VP Operations
- VP Academics
- Intro Lead
- ICPC Lead
- Officer
- Inactive Officer

These local password accounts exist only for development. Production continues to use Google Sign-In.

To throw away all local changes and return to the standard synthetic dataset:

```bash
npm run local:reset
```

To stop the local Supabase stack:

```bash
npm run local:stop
```

### Local Supabase Studio

The full local stack includes Supabase Studio:

```text
http://localhost:54323
```

Use Studio only against the local database. Schema changes that should become part of Cappy Hub must still be captured in migration files.

### Environment Variables

For normal local development, `npm run local:setup` and `npm run local:reset` manage the two public Supabase values in `.env.local` automatically.

Never commit:

- `.env.local`
- passwords or private credentials
- OAuth secrets
- Supabase service-role/secret keys
- production database credentials

The local setup script reads its temporary service-role key from the local Supabase CLI and uses it only server-side while creating development accounts. It is never written to browser environment variables.


---

## Contributing

Contributions from CIC members are welcome.

If you want to add a feature or make a larger change, **open a GitHub Issue first** so we can agree on the problem and scope before implementation begins.

Good contributions include:

- Bug fixes
- Usability improvements
- Accessibility improvements
- Tests
- Documentation
- Small refactors
- Features that improve existing Cappy Hub workflows

Try to keep contributions focused on the existing application rather than introducing unrelated systems.

---

## Development Workflow

### 1. Start From the Latest `main`

```bash
git switch main
git pull
```

### 2. Create a Branch

Do not develop directly on `main`.

Create a short-lived branch:

```bash
git switch -c feat/event-filters
```

Use one of these prefixes:

```text
feat/       new functionality
fix/        bug fixes
docs/       documentation
refactor/   code restructuring
chore/      maintenance
ci/         CI changes
```

Examples:

```text
feat/officer-search
fix/event-signup-state
docs/update-readme
refactor/points-query
```

### 3. Make Your Changes

Keep changes focused on one problem.

Prefer a small Pull Request that solves one thing well over a large PR containing unrelated changes.

If your change modifies the database, use a migration instead of manually changing the schema.

Create a migration with:

```bash
npx supabase migration new descriptive_name
```

Database changes should always be reproducible from the repository.

### 4. Run the Checks

Before opening a Pull Request, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

To automatically fix formatting:

```bash
npm run format
```

Some database tests require the local Supabase test database:

```bash
npm run db:start
npm test
```

Do not use production data for development or testing.

### 5. Commit Your Work

Use short, meaningful commit messages.

Examples:

```text
feat: add officer search
fix: prevent signup after event closes
docs: improve contributor setup
refactor: simplify points filtering
```

### 6. Push Your Branch

```bash
git push -u origin feat/event-filters
```

Then open a Pull Request into `main`.

---

## Pull Requests

Every Pull Request should explain:

- What problem it solves
- What changed
- How it was tested
- Any important implementation decisions

Include screenshots when the UI changes and they help reviewers understand the change.

### Merge Requirements

`main` is protected.

Contributor Pull Requests must:

- Pass CI
- Receive at least **one approval**
- Resolve review conversations
- Be merged through a Pull Request

Do not force-push or rewrite shared `main` history.

Repository maintainers are responsible for merging approved contributions.

We use **Squash and Merge** so each completed Pull Request becomes one clean commit on `main`.

---

## Keeping Your Branch Updated

If `main` changes while you are working:

```bash
git switch main
git pull
git switch your-branch
git merge main
```

Resolve any conflicts locally, test the result, and push your branch again.

---

## Database Development

Supabase provides Cappy Hub's:

- PostgreSQL database
- Authentication
- Row Level Security
- Database functions
- Scheduled database processing

Database migrations live in:

```text
supabase/migrations/
```

Synthetic local development data lives in:

```text
supabase/seed.sql
```

### Schema Changes

Do not change the production schema manually.

Create a migration locally:

```bash
npx supabase migration new descriptive_name
```

After editing the migration, rebuild the local environment:

```bash
npm run local:reset
```

This proves that the complete migration history can recreate Cappy Hub from scratch before the change reaches production.

When database types change:

```bash
npm run db:types
npm run db:types:check
```

### Database Test Stack

The repository keeps a smaller database-only Supabase command for automated PostgreSQL tests and CI:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:start` is intentionally different from `local:start`: it does not start the full Auth/API/Studio development environment.

### Seed Data Rules

The local seed is intentionally synthetic and should contain enough data to exercise realistic UI and database states.

Do not add real CIC officer emails, event history, points, warnings, Auth accounts, or other production records to the seed.

The production Supabase project receives migrations only. Never deploy the local synthetic seed to production.

### Security Rules

Never:

- Commit credentials
- Put service-role credentials in browser code
- Disable authorization just to make something work
- Rely only on hidden UI controls for permissions
- Modify production data while testing
- Bypass database migrations for schema changes

If your change affects authentication, authorization, Row Level Security, roles, or protected database operations, mention it clearly in your Pull Request.


---

## Useful Commands

```bash
# Full local app environment
npm run local:start
npm run local:reset
npm run local:stop
npm run dev

# Formatting
npm run format
npm run format:check

# Code quality
npm run lint
npm run typecheck

# Tests
npm test

# Production build
npm run build

# Database-only test/CI stack
npm run db:start
npm run db:reset

# Database types
npm run db:types
npm run db:types:check
```


---

## Have an Idea?

Open a GitHub Issue describing:

1. The problem you noticed
2. What you think should change
3. Why it would improve Cappy Hub

You do not need to know exactly how to implement something before proposing it.

If you want to work on an existing Issue, leave a comment so multiple contributors do not accidentally work on the same thing.

---

## Maintainers

Cappy Hub is maintained by the **Coding Interview Club**.

Maintainers review contributions, help clarify expected behavior, and decide what is merged into `main`.

The project should remain understandable and maintainable so future CIC officers can continue improving it.
