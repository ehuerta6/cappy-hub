# Cappy Hub agent guidance

## Project and sources

- Coding Interview Club (CIC) operates Cappy Hub, its internal administrative application. Officers, Events, and Points are core product areas; the Dashboard summarizes their data. Keep the application understandable for future CIC officers.
- For product behavior, follow the current Product & Technical Specification when it is available. Then use the active GitHub Issue for change scope, existing implementation and patterns for integration, and `README.md` for development and contribution workflow. If these sources are silent or conflict, investigate or ask; do not invent requirements.
- Read the surrounding code before editing. Confirm that a proposed feature serves Officers, Events, Points, Dashboard summaries, or an explicit documented workflow.

## Implementation

- Prefer the simplest correct change. Keep work focused on the issue; avoid speculative features, unrelated refactors, new architecture, and dependencies without a concrete need.
- Reuse established patterns and write readable code. Update meaningful tests when behavior changes.
- The stack is Next.js, React, TypeScript, Supabase/PostgreSQL, Tailwind CSS, and Vitest. Refer to the code and `README.md` for details rather than assuming framework defaults.

## Database and security

- Make schema changes in reproducible `supabase/migrations/` files. Use keys, nullability, uniqueness, and constraints for important data integrity.
- Respect Row Level Security and enforce permissions in trusted database or server paths. Do not weaken authorization to make a feature work or rely only on hidden UI controls.
- Never expose Supabase service-role credentials to browser code. Never use production data for development or tests; keep `supabase/seed.sql` synthetic and out of production.
- Rebuild locally and regenerate/check database types when schema changes require it. Follow the database commands in `README.md` and `package.json`.
- Use `local-database-workflow` whenever running the full test suite containing pgTAP, using local Supabase, switching between database-test and seeded-development states, or diagnosing local database connection/state failures. Never run full `npm test` against an arbitrary local database state.

## Delivery

- Do not develop directly on `main`. Follow the branch, Conventional Commit, validation, and PR conventions in `README.md`; keep PRs focused.
- Use the applicable workflow skill when a task needs detailed steps: `implement-issue`, `database-change`, `local-database-workflow`, `verify-change`, or `review-pr`. Their bodies are loaded only when needed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
