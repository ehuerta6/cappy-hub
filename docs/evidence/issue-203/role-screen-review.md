# Role × screen review — Issue #203

This matrix follows the application-role and Position/Branch boundaries in
[`docs/product/design-doc.md`](../../product/design-doc.md). Application role,
club Position, and Branch membership are separate. Admin has global
administration; President and Vice Presidents have global Event-executive
access; Leads manage only Events and Tasks within their authorized Branch
scope; Officers and Secretary use the regular Officer access model. Inactive
Officers cannot enter the protected application.

## Screen and permission review

| Screen                    | Admin                                                                                            | President / Vice Presidents                                                        | Lead                                                                                             | Regular Officer / Secretary                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Dashboard                 | Own profile/actions, global summary and activity                                                 | Own profile/actions, global summary and activity                                   | Own profile/actions, global summary and activity                                                 | Own profile/actions, global summary and activity                              |
| Events list/detail        | Browse and manage all; signup/roster controls                                                    | Browse and manage all; signup/roster controls                                      | Browse all; manage only shared-Branch Events; global Events remain outside Lead management scope | Browse, sign up, and view roster per existing event rules                     |
| Event create/edit         | Global management                                                                                | Global Event management                                                            | Create and edit within assigned Branch scope                                                     | No management controls                                                        |
| Tasks list/detail         | Manage all; assignments and completion controls                                                  | Task access follows task authorization, including available management controls    | Manage within Branch scope; assignment/completion controls follow task authorization             | Browse, self-assign eligible Tasks, and see own assignment/completion actions |
| Task create/edit          | Authorized global management                                                                     | Task access follows task authorization                                             | Authorized Branch-scoped management                                                              | No management controls                                                        |
| Officers directory/detail | Manage records, application roles, warnings, and catalogs as authorized                          | Read-only directory/detail; warning visibility follows President/VP approval rules | Read-only directory/detail                                                                       | Read-only directory/detail; own warning visibility is preserved               |
| Calendar                  | Read-only Event/Task month grid                                                                  | Read-only Event/Task month grid                                                    | Read-only Event/Task month grid                                                                  | Read-only Event/Task month grid                                               |
| Points                    | Totals, rate configuration, manual transactions/corrections, all history filters and row actions | Read-only rate, totals, filters, history                                           | Read-only rate, totals, filters, history                                                         | Read-only rate, totals, filters, history                                      |
| System Log                | Available with search, filters, and pagination                                                   | Admin-only; unavailable                                                            | Admin-only; unavailable                                                                          | Admin-only; unavailable                                                       |
| Admin and catalogs        | Available; established management links                                                          | Admin-only; unavailable                                                            | Admin-only; unavailable                                                                          | Admin-only; unavailable                                                       |

The page composition uses the available actions. Points keeps the Admin entry
controls beside Officer totals; other roles see the read-only rate beside the
title, a centered totals table, and full-width Point history. Event and Task
management controls remain adjacent to their relevant records. Directory and
history tables retain semantic desktop columns; table overflow stays inside
the table frame.

## Rendered evidence reviewed

Most screenshots are full-page Chromium captures from the clean local
synthetic seed at 1440 × 1000 CSS px. Additional Points after captures use
1280 × 900px. The paired Points comparisons use the same seeded data, role,
viewport, and theme as their before captures.

| Role                                 | Routes visually inspected                                                                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin                                | Dashboard, Events/list/detail/create/edit, Tasks/list/detail/create/edit, Officers/directory/detail, Calendar, Points, Admin, Officer and Event catalogs, System Log | [Dashboard](admin-dashboard-desktop-after.png), [Events](admin-events-desktop-after.png), [Event detail](admin-event-detail-desktop-after.png), [Event create](admin-event-form-desktop-after.png), [Event edit](admin-event-edit-desktop-after.png), [Tasks](admin-tasks-desktop-after.png), [Task detail](admin-task-detail-desktop-after.png), [Task create](admin-task-form-desktop-after.png), [Task edit](admin-task-edit-desktop-after.png), [Officers](admin-officers-desktop-after.png), [Officer detail](admin-officer-detail-desktop-after.png), [Calendar](admin-calendar-desktop-after.png), [Admin](admin-settings-desktop-after.png), [Officer catalogs](admin-officer-catalogs-desktop-after.png), [Event catalogs](admin-event-catalogs-desktop-after.png), [System Log](admin-system-log-desktop-after.png) |
| Regular Officer                      | Dashboard, Events/list/detail, Tasks/list/detail, Officers/directory/self profile, Calendar, Points                                                                  | [Dashboard](officer-dashboard-desktop-after.png), [Events](officer-events-desktop-after.png), [Event detail](officer-event-detail-desktop-after.png), [Tasks](officer-tasks-desktop-after.png), [Task detail](officer-task-detail-desktop-after.png), [Directory](officer-directory-desktop-after.png), [Own profile](officer-profile-desktop-after.png), [Calendar](officer-calendar-desktop-after.png)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Intro Lead                           | Events list and scoped edit, Tasks list and scoped edit                                                                                                              | [Events](lead-events-desktop-after.png), [Event edit](lead-event-edit-desktop-after.png), [Tasks](lead-tasks-desktop-after.png), [Task edit](lead-task-edit-desktop-after.png)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Multi Branch Lead                    | Branch-spanning Events and Tasks lists                                                                                                                               | [Events](multibranch-events-desktop-after.png), [Tasks](multibranch-tasks-desktop-after.png)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| President (executive representative) | Events list/edit and Tasks list; Points read-only captured by common Officer layout                                                                                  | [Events](executive-events-desktop-after.png), [Event edit](executive-event-edit-desktop-after.png), [Tasks](executive-tasks-desktop-after.png)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Admin and Officer Points have matching before/after captures in light and dark
themes: [Admin light before](points-admin-before-light.png) →
[after](points-admin-after.png), [Admin dark before](points-admin-before-dark.png)
→ [after](points-admin-dark-after.png), [Officer light before](points-officer-before-light.png)
→ [after](points-officer-after.png), and [Officer dark before](points-officer-before-dark.png)
→ [after](points-officer-dark-after.png). Additional light-theme after captures
show [Admin at 1280px](points-admin-1280-after.png) and
[Officer at 1280px](points-officer-1280-after.png). The Admin Points and Officer
Points screens were checked at 1024, 1280, 1440, and 1920px. No page-level
horizontal overflow appeared at those widths.

## Observations and limits

- The Officer Points layout has no reserved Admin column; the centered totals
  table and full-width history use the space needed by their content. The
  Admin form remains visible beside totals and history remains full width.
- At the tested desktop widths, navigation remained visible, tables retained
  their column headers, and ordinary long labels wrapped within their cells.
  Any required horizontal scrolling is contained by the table frame.
- The desktop calendar remains the month grid with Event/Task filters. No
  compact list mode or list-only Calendar styling remains.
- Axe checks covered login, Dashboard, Points, Event/Task forms, Task detail,
  date validation, Event cancellation, and both themes for the Events branch
  text contrast check. Keyboard checks covered skip-to-content and Task
  completion controls.
- Dashboard Task/Warning query failures and the System Log Officer-name
  failure were verified with focused tests and rendered server output, not by
  injecting query failures into the browser.
- President represents the event-executive permissions in visual captures;
  VP variants and each individual Lead Branch dataset were not captured
  separately. Their layouts share the same application-role rendering;
  authorization still uses the current trusted role/Branch checks. Secretary
  shares the regular Officer application-role rendering.
- Empty, loading, selected/unavailable filter, archived, and destructive
  states have focused automated coverage where present, but are not all
  represented by screenshots. No phone/tablet viewport or actual browser-zoom
  level was tested; only supported desktop widths and normal page resizing
  were checked.
- All visual data came from local synthetic fixtures. No production data was
  used.
