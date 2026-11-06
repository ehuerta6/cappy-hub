# Historical Event workflows

**Status:** Historical Event workflows retired on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`). These records and audit traces are evidence of former behavior, not available current workflows. The retired System Log UI is covered by the separate [audit and provenance slice](audit-provenance.md).
**Actors:** No current users; historical audit writers captured retirement evidence. Audit storage remains an internal provenance capability.
**Aliases:** Retired waitlist, Presenter Slots, System Log page.
**Slice boundary:** Records retired Event-adjacent workflows and preserved history; current Events and participation are covered by [Events](events.md) and [Event participation](event-participation.md).

## Waitlist

The former Event waitlist was retired. The retirement migration audited/preserved outstanding entries in System Log audit records before removing operational queue contracts. Pending entries are not converted to confirmed signups and do not earn participation Points. Current Event capacity applies to confirmed signups (and per-slot registrations where configured); there is no waitlist promotion flow.

## Presenter Slots

The former Presenter Slot workflow is retired. Existing `presentation_slots` rows remain readable on Event detail, including historical presenter-owned information and stable identity. Create/reorder/claim/assign/release/remove/edit operations are unavailable. Session remains a valid Event type, but ordinary Event signup and participation behavior applies; Session Events cannot contain volunteer Time Slots.

## Sources

- Canonical status: [Events and participation](../../docs/product/events.md), [administration audit](../../docs/product/administration-audit.md).
- Waitlist retirement evidence: [Waitlist retirement migration](../../supabase/migrations/20261019190000_remove_event_waitlist_contracts.sql).
- Presenter retirement evidence: [Presenter Slot retirement migration](../../supabase/migrations/20261030220000_retire_presenter_slots.sql); historical schema/detail evidence includes [20261013170000_presenter_slots.sql](../../supabase/migrations/20261013170000_presenter_slots.sql), [20261015100000_presenter_owned_details.sql](../../supabase/migrations/20261015100000_presenter_owned_details.sql).
- Related slices: [Events](events.md), [Event participation](event-participation.md), [Points](points.md).
