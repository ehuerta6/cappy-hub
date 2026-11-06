# Product scope and technical architecture

## Product purpose and scope

Cappy Hub is Coding Interview Club's internal administrative application. It provides structured workflows for Officers, Events, Tasks, participation Points, Warnings, and related administration. The Dashboard summarizes those workflows; it is not an independent analytics or workflow system.

Cappy Hub serves fewer than 50 Officers. Prefer existing infrastructure and free-tier services; do not add paid services without explicit approval. Favor simple, maintainable solutions proportional to actual requirements. This scale informs architecture but never weakens security, authorization, or data integrity, and does not justify artificial limits on database records or future growth.

Google Drive remains CIC's collaborative file system. Discord remains its primary communication platform. Cappy Hub may store links to external files, but it does not copy or synchronize their contents. Native Cappy Hub records remain authoritative for the workflows represented in the application.

## Product status convention

- **Current / shipped** describes behavior present on the current `main` branch at the time this document is maintained; this label alone does not attest to production deployment.
- **Planned / accepted** describes a product decision captured by an approved, open Issue. It is not shipped behavior and must not be presented as available in the application.
- An open Issue alone does not make unrelated ideas part of the roadmap. Work remains subject to its Issue scope and review.

Open accepted decisions, when present, are summarized in [Approved decisions and implementation status](planned-accepted.md). They do not change the shipped descriptions elsewhere in this document. Where accepted direction supersedes a shipped rule, [Approved decisions and implementation status](planned-accepted.md) defines the target for the linked implementation Issues; the shipped rule remains evidence of the transition required, not a restriction on that approved work.

## Explicit non-goals and external systems

- Google Drive remains the external collaborative file system; Event resource fields store URLs only.
- The Event Signup sheet is an optional external resource URL. There is no Google Sheets OAuth, row synchronization, import, export, or roster reconciliation.
- Additional Officer profile fields have no approved allowlist; Issue [#140](https://github.com/ehuerta6/cappy-hub/issues/140) remains blocked pending field-specific purpose, visibility, editing, retention, and audit decisions. Candidate onboarding fields are not requirements.
- The internal Calendar is read-only and is not a second source of scheduling truth. The accepted Google Calendar mirror in [#29](https://github.com/ehuerta6/cappy-hub/issues/29) is separate, one-way Event synchronization; it does not include Task deadlines or calendar administration.
- Cappy Hub has no separate attendance/check-in subsystem. Confirmed native Event signups are the participation roster under current behavior.
- The Dashboard does not introduce speculative analytics, metrics, or duplicated workflows.
- Audit history is not a second mutation interface; ordinary reads and navigation are not logged.
- Do not resurrect the retired single-assignee Task compatibility model or legacy Task completion/approval RPC workflow.

## Technical architecture and sources of truth

The frontend uses Next.js, React, TypeScript, and Tailwind CSS. Supabase provides PostgreSQL, authentication, Row Level Security, and trusted database mutation boundaries. PostgreSQL migrations in `supabase/migrations/` are the source of truth for schema and reproducible database behavior. Generated database types describe the schema contract and should be regenerated when schema changes require it.

Browser code may use only client-safe credentials. Service-role and other privileged credentials stay server-side. Sensitive authorization belongs in trusted server/database logic and RLS, not solely in the interface.

Use this canonical authority order when maintaining product behavior:

1. Current Product & Technical Specification.
2. Newest explicit maintainer/user decision.
3. Approved feature specifications.
4. Active GitHub Issue and accepted clarifications.
5. Repository documentation and migrations.
6. Current implementation as evidence of what is shipped.

The active Issue defines implementation scope within this order. If sources materially conflict, record the discrepancy and resolve it using the higher-authority source. A new explicit decision may require this specification to be updated; update it so it remains the canonical product source. Repository documentation and migrations define reproducible technical behavior, while the current implementation is evidence of shipped behavior.
