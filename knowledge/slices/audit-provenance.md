# Audit and provenance

**Status:** Audit records and trusted writers are present in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7). The user-facing System Log page was retired under [Issue #367 / PR #372](https://github.com/ehuerta6/cappy-hub/pull/372). Repository evidence does not establish production deployment.

**Actors:** Trusted server/database writers record mutations; Admins rely on provenance when reviewing authorized corrections and lifecycle changes.

**Slice boundary:** Covers audit storage and attribution shared across domains; domain workflows own their mutation rules, while the retired System Log page is not an active browsing surface.

Audit is a cross-cutting record of meaningful changes: actor, target, context, and time help preserve accountability and explain corrections, lifecycle transitions, and derived Point provenance. It is not a current end-user log browsing workflow. The System Log UI and navigation were removed, while audit storage and trusted writers remain for provenance, authorization accountability, historical compatibility, and verification. Do not recommend recreating a System Log page based solely on the presence of audit tables.

Treat deactivation, recoverable catalog retirement, Warning void/delete, and Point corrections as domain operations that preserve history and relationships; audit evidence complements each vertical slice but does not replace its product contract. Read [Administration and audit history](../../docs/product/administration-audit.md) and [Authorization and trusted boundaries](../../docs/product/authorization.md) for canonical expectations.

Implementation evidence: [audit migration](../../supabase/migrations/20260928143748_audit_system_log.sql), [stable Officer actor attribution](../../supabase/migrations/20261003214231_stable_officer_actor_attribution.sql), [mutable Point actor attribution](../../supabase/migrations/20261003223000_resync_mutable_point_actor_attribution.sql), and [audit/System Log database tests](../../supabase/tests/database/audit_system_log.test.sql). The [System Log route regression test](../../tests/system-log-route.test.ts) covers the retired UI surface.

**Aliases:** audit log, provenance, actor attribution, mutation history, System Log retirement, history preservation.
