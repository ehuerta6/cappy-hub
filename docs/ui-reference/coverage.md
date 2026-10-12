# UI catalog coverage

This report is generated with node scripts/build-ui-reference.mjs from [manifest.json](manifest.json). The [HTML catalog](index.html) links each thumbnail to its full-size PNG.

## Summary

- Screenshots: **342** (171 dark, 171 light).
- Roles: **Admin, Lead, and Officer**, plus shared login/access states.
- Lead coverage includes both a single-branch Lead and a multi-branch Lead account. This reflects the app's branch-scoped permissions while keeping Lead as one primary role.
- Every included dark screenshot state has a corresponding light-theme capture at the same role, scope, domain, route, width, and capture mode.
- Desktop widths: **1024, 1280, 1440, 1920 CSS px**; 1440px is the main review size.
- Data: existing synthetic local development records only. The local database was retained; the validation-only Point form submission was rejected before persistence and no records were changed.
- /events/types redirects to /events and is represented by Events rather than a separate screen.

## Captures by role and theme

Counts are dark / light.

| Domain     |   Admin |  Lead | Officer |
| ---------- | ------: | ----: | ------: |
| Admin      |   1 / 1 | 0 / 0 |   0 / 0 |
| Calendar   |   4 / 4 | 0 / 0 |   2 / 2 |
| Catalogs   |   2 / 2 | 0 / 0 |   0 / 0 |
| Dashboard  |   2 / 2 | 4 / 4 |   4 / 4 |
| Dialogs    |   6 / 6 | 0 / 0 |   0 / 0 |
| Events     | 28 / 28 | 8 / 8 |   3 / 3 |
| Login      |   0 / 0 | 0 / 0 |   0 / 0 |
| Officers   | 16 / 16 | 4 / 4 |   4 / 4 |
| Points     | 29 / 29 | 0 / 0 |   6 / 6 |
| States     |   0 / 0 | 0 / 0 |   0 / 0 |
| System Log |   5 / 5 | 0 / 0 |   0 / 0 |
| Tasks      | 35 / 35 | 4 / 4 |   2 / 2 |

## Not captured

The following result states were not created because they require submitting mutations or the existing local synthetic data does not contain the prerequisite records:

- Successful create/edit/restore, signup/leave, task assignment/completion, warning decisions, and point/catalog changes after submission. Confirmation dialogs and forms were captured before submission.
- Event/Task recurring-series edit scopes. The retained local database has no Event or Task recurrence series.
- Waitlist/full-capacity states. The retained local data has no capacity-limited Events or waitlist entries.
- Archived Task restore. The retained local data has no archived Tasks.
- Server failure and generic error screens. No service failure was induced.
- Successful Point transactions and persistence-failure states. The retained local fixture uses negative synthetic Officer IDs, which the existing positive-ID transaction validation rejects; no Point records were changed.

The detailed metadata for every screenshot is in [manifest.json](manifest.json). The report makes these unavailable or untested states explicit rather than substituting mock screenshots.
