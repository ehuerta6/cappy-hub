# Cappy Hub agent guidance

## Project and sources

- Coding Interview Club (CIC) operates Cappy Hub, its internal administrative application.
- Officers, Events, and Points are core product domains. The Dashboard summarizes product data rather than becoming an independent system. Other workflows belong only when already established by the Product & Technical Specification or explicitly approved.
- The current Cappy Hub **Product & Technical Specification** at [`docs/product/design-doc.md`](docs/product/design-doc.md) is the primary source of truth for product behavior, terminology, scope, and technical decisions.
- After that, use the user's newest explicit decision, approved feature specifications, the active GitHub Issue and accepted clarifications, repository documentation and migrations, then existing code as evidence of current implementation.
- Existing code does not automatically redefine intended product behavior.
- When authoritative sources materially conflict, surface the conflict instead of silently inventing or choosing a requirement.
- Read surrounding implementation before editing.

## Implementation

- The active GitHub Issue is the implementation scope boundary.
- Prefer the smallest correct change that satisfies the documented requirement.
- Reuse established project patterns before introducing new abstractions.
- Avoid speculative features, unrelated refactors, unnecessary infrastructure, architecture changes, and dependencies without a concrete need.
- Update meaningful tests when behavior changes.
- Do not silently include additional work discovered while implementing an Issue. Surface it separately.
- The frontend uses Next.js, React, TypeScript, and Tailwind CSS. The backend uses Supabase/PostgreSQL.
- Inspect the repository and `package.json` before assuming framework versions, APIs, dependencies, scripts, or conventions.
- For UI work, [`docs/design.md`](docs/design.md) is the separate authority for visual and interaction direction. Product requirements and permissions always outrank design recommendations.

## Database and security

- `supabase/migrations/` is the source of truth for database schema and reproducible database behavior.
- `supabase/seed.sql` contains synthetic local development and test data only.
- Use PostgreSQL keys, nullability, uniqueness, checks, foreign keys, and other appropriate constraints for invariants that must hold regardless of client behavior.
- Keep Row Level Security enabled where required.
- Enforce sensitive authorization at a trusted database or server boundary. Do not rely only on hidden or disabled UI controls.
- Never expose Supabase service-role or other privileged credentials to browser code.
- Never use production data for development or testing.
- Never copy synthetic local data into production or deploy `supabase/seed.sql` to production.
- Schema changes must be reproducible through migrations. Manual Supabase Dashboard or SQL editor changes are not the project source of truth.
- Regenerate and check database types when schema changes require it.
- Use `database-change` for schema, migrations, constraints, RLS, database functions, authorization, generated database types, or other persistent database behavior.
- Use `local-database-workflow` for local Supabase state, pgTAP, database-backed test state, seeded development state, database connection failures, and transitions between those states.
- Never run the full database-backed test suite against arbitrary local database state.

## Workflow skills

Reusable project workflows live in `.ai/skills/`.

When a workflow applies, read its `SKILL.md` before performing that workflow.

- unresolved product or technical decisions → `.ai/skills/grill-me/SKILL.md`
- resolved decisions needing a durable feature specification → `.ai/skills/to-spec/SKILL.md`
- approved work needing GitHub Issues → `.ai/skills/to-issues/SKILL.md`
- implementing one approved Issue → `.ai/skills/implement-issue/SKILL.md`
- substantial debugging → `.ai/skills/debug-with-evidence/SKILL.md`
- schema, migrations, constraints, RLS, database functions, authorization, or generated database types → `.ai/skills/database-change/SKILL.md`
- local Supabase or database-test state → `.ai/skills/local-database-workflow/SKILL.md`
- final implementation validation → `.ai/skills/verify-change/SKILL.md`
- independent implementation or Pull Request review → `.ai/skills/review-pr/SKILL.md`
- UI/UX shaping, critique, audit, hardening, or polish → `.ai/skills/impeccable/SKILL.md`
- continuing unfinished work in another chat, agent, or session → `.ai/skills/handoff/SKILL.md`

Do not force a workflow onto a simple task.

Project-specific requirements, repository documentation, and explicit user decisions override generic workflow defaults.

## Delivery

- Do not develop directly on `main`.
- Follow the repository's current development, Git, Pull Request, validation, and database documentation instead of duplicating those procedures here.
- Keep each Issue, branch, and Pull Request focused on one logical change.
- Use the repository's established commit and Pull Request conventions.
- Link implementation Pull Requests to their Issue when applicable.
- Do not claim a test, lint, typecheck, build, database check, browser check, or other validation passed unless it actually ran successfully.
- Before considering meaningful implementation complete, verify the requested behavior, run the applicable repository checks, and inspect the final diff for unintended changes.
- Do not merge unless explicitly authorized.
- Keep the application and its documentation understandable for future CIC officers.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
