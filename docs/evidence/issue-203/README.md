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

## Corrective before/after captures

These before captures were made against the local synthetic seed immediately
before the focused Issue #203 corrections, using Chromium at 1440 × 1000 in
dark theme. The matching after captures below use the same routes, roles,
viewport, theme, and seed. Event detail uses the seeded confirmed participation
state; other signup states are covered by focused state tests and are not
claimed as browser screenshots.

The rendered comparison confirmed these defects and corrections:

- Officer Points previously put all 23 totals before history. The after view
  keeps every total in a keyboard-focusable, independently scrollable region;
  Point History and its filters follow immediately. Both are visible in the
  initial 1440 × 1000 view.
- Admin Points previously began history below a tall totals/manual-entry
  area, and every history row showed an edit field and stacked actions. The
  after view shortens the totals region, groups manual entry more compactly,
  and puts Edit points behind a native disclosure while keeping Remove beside
  the row. History begins at about 821 CSS px in the captured 1440 × 1000 view.
- Officer catalogs previously required a very long page of vertically
  stacked records. The after view groups each editable record and its state
  and supported actions into compact rows; the seeded page fits the 1440 px
  capture height.
- Event create/edit now place related fields in a balanced two-column form,
  with Resources spanning both columns. Event detail keeps the manager roster
  visible and folds only bulk addition. A confirmed regular Officer sees
  Confirmed and their permitted Remove signup action, with no manager selector.

The corrected screens were inspected in Chromium at 1440 × 1000 (screenshots)
and at 1024, 1280, 1440, and 1920 CSS px (layout/overflow). No document-level
horizontal overflow was observed. At 1280 px the Event form remains readable;
the 1024 px catalog layout becomes longer as its sections stack. Only dark
theme was captured for this correction set. No browser screenshots were made
for waitlisted, full-capacity, closed-signup, Lead, or President states;
signup-state precedence and conditional UI state are covered by unit tests,
while existing role/authorization tests remain applicable. Those live-browser
states are explicitly unverified here.

Task create was inspected using the seeded linked-Event selector; its
multi-select and helper text already explain keyboard selection and recurrence
scope, so this correction leaves that workflow intact. Existing temporal and
participation groupings in Events and Tasks were not changed because this
review found no concrete regression in the captured populated lists.

- Points / Admin: [before](points-admin-correction-before.png) → [after](points-admin-correction-after.png)
- Points / Officer: [before](points-officer-correction-before.png) → [after](points-officer-correction-after.png)
- Officer catalogs / Admin: [before](officer-catalogs-admin-correction-before.png) → [after](officer-catalogs-admin-correction-after.png)
- Event create / Admin: [before](event-create-admin-correction-before.png) → [after](event-create-admin-correction-after.png)
- Event edit / Admin: [before](event-edit-admin-correction-before.png) → [after](event-edit-admin-correction-after.png)
- Event detail / Officer: [before](event-detail-officer-correction-before.png) → [after](event-detail-officer-correction-after.png)
- Event detail / Admin: [before](event-detail-admin-correction-before.png) → [after](event-detail-admin-correction-after.png)

## Role screen coverage

Current full-page captures at 1440 × 1000, dark theme:

- Admin: [Dashboard](admin-dashboard-desktop-after.png), [Events](admin-events-desktop-after.png), [Event detail](admin-event-detail-desktop-after.png), [Event create](admin-event-form-desktop-after.png), [Event edit](admin-event-edit-desktop-after.png), [Tasks](admin-tasks-desktop-after.png), [Task detail](admin-task-detail-desktop-after.png), [Task create](admin-task-form-desktop-after.png), [Task edit](admin-task-edit-desktop-after.png), [Officers](admin-officers-desktop-after.png), [Officer detail](admin-officer-detail-desktop-after.png), [Calendar](admin-calendar-desktop-after.png), [Points](points-admin-dark-after.png), [Admin](admin-settings-desktop-after.png), [Officer catalogs](admin-officer-catalogs-desktop-after.png), [System Log](admin-system-log-desktop-after.png).
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
