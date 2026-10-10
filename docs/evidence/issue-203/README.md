# Issue #203 rendered evidence

All screenshots use Chromium against local synthetic Supabase data. No
production data was used. Current product direction is desktop-only; the
previous phone/tablet screenshots were removed because they showed UI branches
that this change deletes.

## Points before/after

Each pair uses the same role, synthetic seed, viewport (1440 × 1000 CSS px),
and theme. Before images capture the pre-role-aware Points composition; after
images show the role-specific layout.

- Admin, light: [before](points-admin-before-light.png) →
  [after](points-admin-after.png).
- Admin, dark: [before](points-admin-before-dark.png) →
  [after](points-admin-dark-after.png).
- Regular Officer, light: [before](points-officer-before-light.png) →
  [after](points-officer-after.png).
- Regular Officer, dark: [before](points-officer-before-dark.png) →
  [after](points-officer-dark-after.png).
- Additional light-theme after views: [Admin at 1280px](points-admin-1280-after.png)
  and [Officer at 1280px](points-officer-1280-after.png).
- The earlier overall Admin desktop refinement is also recorded as
  [initial before](points-admin-before.png) → [after](points-admin-after.png).

The Admin retains rate configuration and manual transaction/correction forms
beside totals; history remains full width. Officer and other non-admin views
place the read-only rate beside the heading, center totals to a comfortable
measure, and give history full width. Full-page captures include the history
filters, semantic table, and pagination.

The Task form desktop refinement is also shown in matching dark 1440 × 1000
captures: [before](task-form-desktop-before.png) →
[after](admin-task-form-desktop-after.png). Natural pairs use the available
desktop width; linked Events and recurrence retain their full form width.

## Role screen coverage

Current full-page captures at 1440 × 1000, dark theme:

- Admin: [Dashboard](admin-dashboard-desktop-after.png), [Events](admin-events-desktop-after.png), [Event detail](admin-event-detail-desktop-after.png), [Event create](admin-event-form-desktop-after.png), [Event edit](admin-event-edit-desktop-after.png), [Tasks](admin-tasks-desktop-after.png), [Task detail](admin-task-detail-desktop-after.png), [Task create](admin-task-form-desktop-after.png), [Task edit](admin-task-edit-desktop-after.png), [Officers](admin-officers-desktop-after.png), [Officer detail](admin-officer-detail-desktop-after.png), [Calendar](admin-calendar-desktop-after.png), [Points](points-admin-dark-after.png), [Admin](admin-settings-desktop-after.png), [Officer catalogs](admin-officer-catalogs-desktop-after.png), [Event catalogs](admin-event-catalogs-desktop-after.png), [System Log](admin-system-log-desktop-after.png).
- Regular Officer: [Dashboard](officer-dashboard-desktop-after.png), [Events](officer-events-desktop-after.png), [Event detail](officer-event-detail-desktop-after.png), [Tasks](officer-tasks-desktop-after.png), [Task detail](officer-task-detail-desktop-after.png), [Officers directory](officer-directory-desktop-after.png), [own profile](officer-profile-desktop-after.png), [Calendar](officer-calendar-desktop-after.png), [Points](points-officer-dark-after.png).
- Intro Lead: [Events](lead-events-desktop-after.png), [scoped Event edit](lead-event-edit-desktop-after.png), [Tasks](lead-tasks-desktop-after.png), [scoped Task edit](lead-task-edit-desktop-after.png).
- Multi Branch Lead: [Events](multibranch-events-desktop-after.png), [Tasks](multibranch-tasks-desktop-after.png).
- President (executive representative): [Events](executive-events-desktop-after.png), [Event edit](executive-event-edit-desktop-after.png), [Tasks](executive-tasks-desktop-after.png).

See [role-screen-review.md](role-screen-review.md) for the canonical
ROLE × SCREEN access summary, visual observations, and limitations.

## Other evidence and verification

- [Events dark before](events-dark-before.png) →
  [Events dark after](events-dark-after.png); [light theme after](events-light-after.png).
- [System Log reversed date range before](system-log-reversed-before.png) →
  [after](system-log-reversed-after.png), showing field-associated validation.
- Desktop navigation, Admin routes, and Points for Admin and Officer were
  checked at 1920, 1440, 1280, and 1024 CSS px. These checks report no
  document-level horizontal overflow.
- Axe checks cover login, Dashboard, Points, Event and Task forms, Task detail,
  date validation, Event cancellation, and Event branch text in both themes.
  Keyboard checks cover skip-to-content and Task completion controls.
- Dashboard partial-query and System Log Officer-name failures have focused
  query/server-render regression coverage. Those failures were not injected in
  a live browser.
- Desktop screenshots for the before states are unavailable except for
  Points and the Events/System Log cases above. Empty, unavailable, and other
  failure states are documented as unverified visually when not pictured.
