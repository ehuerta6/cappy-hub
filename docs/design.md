# Cappy Hub Design System

**Status key**

- **CURRENT** describes behavior or presentation verified in the repository.
- **DESIGN DECISION** is the visual and UX direction for future refinement.
- **OPTIONAL REFINEMENT** is a presentation improvement only; it does not change product behavior or data.

This document records the application as it exists in the repository, then sets a restrained direction for future UI work. If a screen changes, update its current-state notes and this document together. Do not use this document to infer a feature that is absent from the application.

## 1. Purpose and product scope

Cappy Hub is the Coding Interview Club's internal administrative application. Its current work areas are officers, events and participation, tasks, calendar, points, and administration. The Dashboard summarizes current club activity. It is a desktop-oriented working tool, not a public marketing site or a generic analytics product.

The repository is the authority for current functionality. This document is the authority for visual and interaction direction. Keep those roles distinct: a design recommendation never changes permissions, requirements, data, or business rules by itself.

The external design reference named in the changelog is only an influence on general design quality. It does not define Cappy Hub's product, platform conventions, or implementation requirements.

## 2. Product UI inventory

| Surface             | Current route                          | Current scope                                                                                               |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Dashboard           | `/`                                    | Club counts, personal access and point total, current action items, upcoming events, recent point activity. |
| Events              | `/events`                              | Search/filter, participation-based groups, event status and signup actions.                                 |
| Event detail        | `/events/[id]`                         | Event information, participation, manager actions, and event point history.                                 |
| Create/edit event   | `/events/new`, `/events/[id]/edit`     | Event fields and recurring-series controls where applicable.                                                |
| Tasks               | `/tasks`                               | Search/filter, Your tasks and Other tasks, assignment counts, and available task actions.                   |
| Task detail         | `/tasks/[id]`                          | Task details, per-Officer completion management, and recurring-task actions where applicable.               |
| Create/edit task    | `/tasks/new`, `/tasks/[id]/edit`       | New tasks can repeat; authorized managers edit standalone and recurring Tasks.                              |
| Calendar            | `/calendar`                            | FullCalendar month grid on desktop and month list on compact screens, with Event/Task visibility toggles.   |
| Officers            | `/officers`                            | Directory filters, officer table, and warning decisions awaiting the current user.                          |
| Officer detail      | `/officers/[id]`                       | Profile, application access, warnings when visible, associated events, and points.                          |
| Add/edit officer    | `/officers/new`, `/officers/[id]/edit` | Officer record fields; application role is managed separately.                                              |
| Officer catalogs    | `/officers/catalogs`                   | Admin-only positions, branches, and reusable event locations.                                               |
| Points              | `/points`                              | Participation rate, officer totals, admin transaction entry, and point history.                             |
| System Log          | `/system-log`                          | Admin-only, searchable and paginated record of changes made in Cappy Hub.                                   |
| Admin               | `/admin`                               | Admin-only directory to existing administration areas.                                                      |
| Login               | `/login`                               | Google sign-in; local development also offers local test-account buttons.                                   |
| Access denied       | `/access-denied`                       | Explains that the signed-in Google account lacks Cappy Hub access and offers sign-out.                      |
| Error and not found | `app/error.tsx`, `app/not-found.tsx`   | Generic load failure with retry; record/page not found with a dashboard link.                               |

`/events/types` currently redirects to `/events`; it is not a separate event-type management screen. Recurrence controls are part of event/task forms and detail workflows, not a standalone recurring-work area.

### Current shell and access rules

**CURRENT:** Protected pages require a current officer account. The compact top navigation links to Dashboard, Events, Tasks, Calendar, Officers, and Points. Admin appears there only when the current application role is `admin`. The right side shows the theme toggle, current officer name, and Sign out. System Log and Officer catalogs are not top-level navigation destinations; existing links into them come from Admin and Officers respectively.

**CURRENT:** Admin-only tasks include the Admin landing page, officer/catalog management, point configuration and manual point actions, and System Log. Event/Task creation and management also depend on branch visibility: admins and the President/Vice Presidents can manage all branches; a Lead can manage work in their assigned branches. Active Officers may self-assign Tasks; only authorized managers control completion. Preserve the server-enforced permissions; visual hiding is not a substitute for them.

## 3. Design principles

### DESIGN DECISION

- **Calm:** Let the page content carry the meaning; avoid motion, alarm-like accents, and visual noise.
- **Clean:** Use clear headings, compact controls, aligned fields, and quiet borders.
- **Capybara:** Express warmth through neutral color, comfortable spacing, and considerate wording. The mascot is a small brand detail, not a theme applied to every screen.
- **Task-oriented:** Help users find a record, understand its state, and complete the action their role permits.
- **Trustworthy:** Keep statuses, dates, points, and permissions explicit. Confirm consequential changes and report the server result clearly.
- **Information-dense, not cramped:** Prefer useful tables and short grouped sections over large decorative cards or oversized page chrome.

Do not make Cappy Hub feel like corporate enterprise software, a hacker console, a marketing page, or a cartoon application.

### Cappy Hub quality lens — DESIGN DECISION

Use these questions when reviewing a screen or proposing a visual refinement. Each screen and named section should have one primary job.

- **Purpose:** What is this for? Does every visible element support the task, its hierarchy, or a meaningful brand detail? Remove elements with no such purpose.
- **Agency:** Can a user tell what an action will do and what state the system is in? Can they leave a secondary workflow and recover from a mistake where the product permits recovery?
- **Responsibility:** Does the UI reflect actual permissions and server results? Never imply access a user lacks, real-time behavior or synchronization that does not exist, or reversibility/security guarantees the application does not provide. Make consequences clear.
- **Familiarity:** Do navigation, contextual return links, headers, tables, filters, forms, statuses, destructive actions, feedback, and empty states behave consistently with their established Cappy Hub patterns?
- **Flexibility:** Does the layout remain understandable at laptop widths and in narrower browser windows, with long names, long event/task titles, many rows, multiple branches, keyboard-only use, and both themes?
- **Simplicity:** Has every element earned its place? Remove redundant labels, duplicate status, decorative metadata, unnecessary containers, and repeated headings before adding styling. Minimalism means clarity, not hiding useful information.
- **Craft:** Are spacing, alignment, typography, wording, empty states, hover/focus, pending states, and visual rhythm intentional? Small repeated inconsistencies accumulate across tables and forms.
- **Delight:** Does the interface feel human through calmness, considerate wording, good spacing, responsive behavior, and subtle capybara identity? Do not use decoration, routine animation, mascot jokes, or novelty controls to manufacture delight.

### Point of view and visual structure — DESIGN DECISION

Cappy Hub's point of view is a quiet, capable utility: **CALM, CLEAN, CAPYBARA**. It does not need to make every page memorable. Spend visual emphasis in a few consistent details—the warm neutral palette, one restrained capybara brand mark, considerate language, and careful spacing—then keep surrounding content quiet.

Structure must encode real information. A border, card, badge, label, divider, number, or color must communicate grouping, hierarchy, state, or action; do not add it only to fill open space. Prefer one shallow layer:

```text
page
  section
    content
```

Nested bordered surfaces should be uncommon and have a functional reason. Use whitespace and typography before adding another container. Avoid generic generated patterns: KPI-card grids, giant analytics dashboards, cyberpunk consoles, generic SaaS templates, cream/serif/terracotta startup styling, black/neon developer styling, arbitrary broadsheet hairlines, `01 / 02 / 03` markers on unsequenced content, screens dominated by giant statistics, pills on every field, and card-inside-card nesting.

Before calling a screen finished, ask: **“What visual accessory could be removed without reducing clarity or usability?”** Consider a redundant badge, repeated explanation, unnecessary border, duplicate heading, decorative icon, or extra card. Remove it when clarity improves; if nothing can be removed without loss, the screen may already be lean.

### Design review order — DESIGN DECISION

Review future UI work in this order:

1. Accessibility and correctness.
2. Familiarity and workflow.
3. Information hierarchy and layout.
4. Interaction feedback.
5. Craft and Cappy Hub identity.
6. Final visual polish.

A beautiful screen that fails an earlier category is not complete.

## 4. Capybara visual identity

**CURRENT:** The header and login identify the product with the words “Cappy Hub”; there is no mascot graphic in the current UI.

**DESIGN DECISION:** Use one tiny, simplified capybara mark beside the Cappy Hub name on the login panel. Keep the authenticated global header text-only. The warmth of the rest of the interface should come from the palette and restrained geometry. A person unfamiliar with the mascot should read the product as a calm, professional tool.

Do not add paw-print patterns, capybara art across application screens, animal-shaped controls, jungle motifs, brown gradients, water effects, novelty type, or mascot illustrations beside routine data. Tables, forms, admin workflows, and readability always take priority.

## 5. Color system

### CURRENT theme tokens

Dark mode is the current default and the visual flagship. Light mode is also implemented. Both use the same semantic token names; the theme toggle changes colors, not component geometry or behavior.

| Token                          | Dark (current)                     | Light (current)        |
| ------------------------------ | ---------------------------------- | ---------------------- |
| `background`                   | `#09090b`                          | `#fafafa`              |
| `foreground`                   | `#f4f4f5`                          | `#18181b`              |
| `secondary`                    | `#d4d4d8`                          | `#3f3f46`              |
| `muted`                        | `#a1a1aa`                          | `#52525b`              |
| `subtle`                       | `#71717a`                          | `#71717a`              |
| `border`                       | `#27272a`                          | `#e4e4e7`              |
| `border-strong`                | `#3f3f46`                          | `#d4d4d8`              |
| `surface`                      | `#111113`                          | `#ffffff`              |
| `surface-muted`                | `#18181b`                          | `#f4f4f5`              |
| `hover`                        | `#27272a`                          | `#f4f4f5`              |
| `accent` / `accent-foreground` | `#e4e4e7` / `#18181b`              | `#27272a` / `#fafafa`  |
| `success`                      | `#86efac` on `rgb(5 46 22 / 0.6)`  | `#166534` on `#f0fdf4` |
| `info`                         | `#93c5fd` on `rgb(23 37 84 / 0.6)` | `#1e40af` on `#eff6ff` |
| `danger`                       | `#fca5a5` on `rgb(69 10 10 / 0.6)` | `#b91c1c` on `#fef2f2` |

Success, info, and danger also have matching border tokens in `globals.css`. The current light borders are `#bbf7d0`, `#bfdbfe`, and `#fecaca`; dark borders are `rgb(20 83 45 / 0.8)`, `rgb(30 58 138 / 0.8)`, and `rgb(127 29 29 / 0.8)` respectively.

### DESIGN DECISION

- Keep dark surfaces near-black and gently warm; use warm off-white for primary text, restrained gray/taupe borders, and quiet surface distinctions.
- Keep light mode warm off-white around white or warm-gray surfaces, with dark neutral text and soft stone borders.
- Preserve the existing meanings of `background`, `foreground`, secondary/muted/subtle text, border strengths, surfaces, hover, accent, success, info, and danger.
- Add warmth only as a small brand/selected-state detail in muted cocoa, clay, or warm taupe. Do not turn neutral surfaces, primary actions, or semantic colors brown. Keep the current high-contrast neutral action accent distinct from this brand detail.
- Give each color a stable semantic job. Keep the earthy accent within the same brand/selected-identity role; use a distinct, visible focus treatment for keyboard focus. Never reuse the earthy brand accent to mean success, information, danger, or ordinary metadata.
- Green means positive/active/success; blue means upcoming or informational; red means cancelled, removed, rejected, error, or destructive; neutral means past, inactive, or ordinary metadata. Never make color the only status cue.
- Dark and light mode must have equivalent hierarchy and contrast. Do not make light mode a reduced or unfinished version.

## 6. Typography

**CURRENT:** The application loads Geist Sans and Geist Mono through `next/font`. Normal UI uses Geist Sans. The body is 14px in many controls and tables. The shared `PageHeader` is 24px on small screens and 30px from the `sm` breakpoint; section headings are 18px; table headings are about 11px, medium weight, uppercase, and muted.

**DESIGN DECISION:** Keep one modern sans-serif family for normal UI. Use a compact hierarchy: page titles around 24–28px semibold with tight tracking, section headings 16–18px semibold, body 14px, helper text 12–13px, table labels 11–12px medium and muted. Avoid oversized page titles and decorative type. Reserve monospace for genuinely technical identifiers or structured details where it improves scanning; do not use it as a visual theme.

## 7. Spacing, shape, and density

**CURRENT:** Protected content uses a centered 72rem (1152px) reading width by default. Dashboard, Events, Tasks, Calendar, Officers, Points, Admin, and System Log can use a centered 80rem (1280px) width for data-heavy work. The shell keeps responsive side padding. Typical sections use 16–24px gaps, filters use compact padding, controls have 6px corners, and panels/table frames generally have 6–8px corners. There are no general drop shadows. Status and branch badges use compact fully rounded shapes.

**DESIGN DECISION:** Use a simple 4px spacing rhythm (4, 8, 12, 16, 24, 32px). Keep common radii small to medium, roughly 6–10px, and borders close to 1px. Use almost no shadows. Keep full pills limited to short statuses or compact branch labels; do not make buttons, filter controls, or every field pill-shaped.

On laptop/desktop, use the available width for lists and detail layouts. Aim for roughly 1200–1280px of content width when the screen benefits from it; the existing 1152px shared maximum is a useful current baseline, not a reason to squeeze data-heavy tables. Long reading text may remain narrower. Scrolling is acceptable; remove avoidable vertical space, oversized controls, repeated page chrome, and always-open forms before removing useful information.

## 8. Application shell

**CURRENT:** Authenticated pages share a compact top header. Cappy Hub is at the left; primary links occupy the middle; theme control, officer name, and Sign out sit to the right. On narrower screens, navigation wraps onto its own horizontally scrollable row. The page body is centered below it. There is no sidebar, avatar, notification bell, or global search.

**DESIGN DECISION:** Preserve this single compact navigation architecture. Keep the header understated and let the page title establish the screen. Do not add a sidebar, global search, command palette, notifications, organization switcher, required avatar, or breadcrumbs everywhere.

Dark mode is the current default. The existing toggle switches between light and dark and persists the user's selection in browser storage. Both themes use the same layout, typography, component sizing, spacing, and semantics.

## 9. Navigation

### Primary navigation (CURRENT)

Dashboard · Events · Tasks · Calendar · Officers · Points; Admin is appended for admins only. Nested pages inherit the active parent link. The active route currently uses foreground text and a restrained underline/border.

### Contextual navigation (CURRENT)

Secondary pages use a small left-arrow link to a meaningful parent, such as “Back to events,” “Back to event,” “Back to tasks,” or “Back to officer.” When a user opens an Event, Task, Officer, or Point History record from a list, the application carries a safe return destination through detail and edit flows so the user can return to the originating list with its filters and, where applicable, page intact. Point History links can return to the filtered history as well. Keep this destination-specific context behavior. Do not add browser-like Back/Forward controls or a Forward button.

## 10. Shared components

The shared UI is deliberately small. Reuse these roles and keep their use consistent; do not introduce a large component framework.

| Primitive            | Current purpose                                                                                  | Consistency rule                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `PageHeader`         | Page title, optional short description, and one contextual action.                               | One page-level heading; keep description secondary and action compact.                                  |
| `SectionHeading`     | Section title, optional description, and optional local action.                                  | Use for named content groups, not every small form label.                                               |
| `ActionLink`         | Prominent navigation action styled as a filled button, commonly “+ New …”.                       | Reserve for the main page action; it is still a link because it navigates.                              |
| `Badge`              | Compact status or neutral metadata label.                                                        | Use sparingly; do not color fields that are ordinary text.                                              |
| `StatusBadge`        | Human-readable status label with a semantic tone when mapped.                                    | Keep a text label and color together. Current mappings are listed in §12.                               |
| `BranchBadges`       | Neutral badges for an officer/event's branch memberships.                                        | Keep branch identity neutral rather than using status colors.                                           |
| `PointValue`         | Signed point amount with tabular numerals; positive green, negative red, zero neutral.           | Preserve the sign and value; do not make points a decorative KPI.                                       |
| `TableFrame`         | Border and horizontal overflow wrapper around a table.                                           | Retain semantic table markup and readable minimum column widths.                                        |
| `ListFilterBar`      | Compact bordered GET-form wrapper with Apply filters and conditional Clear filters.              | Keep labels visible, fields grouped, and Apply/Clear behavior intact.                                   |
| `ContextualBackLink` | Destination-specific return navigation on secondary pages, with safe list context when supplied. | Name the actual parent; preserve the originating list state when supplied; never imply browser history. |
| `ThemeToggle`        | Switches between the existing light and dark themes.                                             | Keep its accessible name explicit about the destination theme.                                          |

Other workflows are implemented near their owning screens: Task assignment/completion controls, recurrence fields/scope controls, warning forms, and point-action forms. Keep these actions close to their records. `ConfirmationDialog` is a small shared native HTML dialog for the existing consequential actions; it is not a general-purpose modal framework. There is no general-purpose card system to imitate.

## 11. Buttons and actions

**CURRENT:** Default buttons use a high-contrast filled treatment. `.button-secondary` uses a bordered surface treatment. `ActionLink` is the prominent filled navigation action. Many lower-priority actions are text links. There is no dedicated shared danger-button primitive.

**DESIGN DECISION:**

- **Primary:** One main page/action at a time, such as New event, New task, Add officer, or Add transaction. Keep it compact, high contrast, medium weight, and modestly rounded.
- **Secondary:** Bordered/surface action for supporting or reversible controls.
- **Danger:** Use restrained red only for destructive meaning. Make the action clear without making it the loudest item on the page; pair consequential removal/deletion with the existing confirmation pattern.
- **Text/link:** Use for low-priority navigation and lightweight management links.

Do not turn every action into a filled button. Keep control text specific to the actual operation and retain pending text/disabled state while a save is in progress.

**DESIGN DECISION — wording:** Prefer action labels that state the result, such as “Save changes,” “Sign up,” “Remove transaction,” “Clear filters,” and “Create task,” over vague “Submit,” “Continue,” or “OK” when the outcome can be named. Keep one term for one operation. Preserve distinctions the product actually makes—for example, cancelling an event, removing a transaction, and deleting a warning are different operations and should not be renamed to a single generic verb.

## 12. Badges and status

**CURRENT statuses:**

- Events: Upcoming, Happening, Past, and Cancelled. Event detail can also identify a removed Event; removed Events have no list-browsing filter. Event status is computed from cancellation/removal and the event's start/end times.
- Officers: Active and Inactive.
- Warnings: Pending, Approved, and Rejected.
- Tasks: Open (no assignments), In progress (at least one assignment and at least one not completed), and Complete (at least one assignment and all completed). Officer counts also show progress such as `2/3 completed`.
- Points history: Active, Removed, or All is an admin filter state; award types are Participation, Task, Manual, and Correction, not statuses.
- Calendar: Events and Task due dates are entry categories, not workflow statuses.

`StatusBadge` currently maps lowercase `active`, `happening`, and `approved` to green; `upcoming` and `pending` to blue; `cancelled`, `rejected`, and `removed` to red; unrecognized values to neutral. Task rows use plain text and Task detail uses a neutral badge for Open, In progress, or Complete. Preserve the words even if the tone is refined later.

Use neutral badges for branches. Keep officer position and classification as plain text. Do not turn every field, award type, or ordinary metadata into a colored pill. If a table contains many branches, an optional compact display such as “General · ICPC · Intro +2” is acceptable only when the full branch list remains discoverable and the count is accessible.

## 13. Dates and times

**CURRENT:** `lib/presentation.ts` provides US English human-readable date, date-time, calendar-date, event schedule, and event-filter-option formatting. Event schedule/date-time helpers use `America/Denver`, the application's El Paso time zone. Compact same-day event schedules omit a repeated date and, where possible, a repeated AM/PM marker. System Log times also use `America/Denver`. Points history date-only values use a helper that avoids shifting a SQL date across time zones.

**OPTIONAL REFINEMENT:** Prefer “Oct 3, 2026,” “Oct 3 · 6:00–7:00 PM,” or “Oct 3, 2026 · 6:00 PM” over ISO strings or raw timestamps. Some current screens still show date-only values as `YYYY-MM-DD` (for example task due dates and event detail dates); render those through the existing presentation helpers when visually refining those screens. Do not change the product's timezone or business rules in a design-only refinement. Avoid seconds and repeated timezone abbreviations unless they are needed to disambiguate a time.

## 14. Tables

Tables are a core pattern for directory, event, point, and audit work. **CURRENT:** Global table styling uses a subtly distinct header, muted uppercase labels, 1px horizontal separators, 8px vertical / 12px horizontal compact cell padding and 10px vertical / 14px horizontal standard cell padding, no vertical gridlines, a light row hover, and links that inherit the neutral theme rather than browser blue. Tables have a 38rem minimum width inside a horizontal overflow frame.

**DESIGN DECISION:** Keep tables task-oriented and horizontally efficient. Use compact but readable rows, muted labels, subtle separators and hover, no heavy grid, no vertical borders, and tabular numerals for points, counts, and dates where useful. Give record names and important values enough room; allow horizontal scroll instead of truncating every column. Do not expose database columns just because they exist, and do not remove useful existing information without an explicit product decision. On narrow screens retain headers and horizontal scroll so a user can understand which value belongs to which column.

## 15. Filters and search

**CURRENT:** Events, Officers, Tasks, Points history, and System Log have real filtering/search behavior. Their shared `ListFilterBar` uses a compact bordered surface, horizontally aligned/wrapping controls, labeled inputs, an Apply filters button, and Clear filters when a filter is active. Calendar also has its own Event/Task visibility toggles; these are not a `ListFilterBar`. Keep these real controls; do not present them as hypothetical.

| List           | Existing search and filters                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Events         | Search name, description, or location; status (Upcoming, Happening, Past, or Cancelled); event type; branch.              |
| Officers       | Search name or either email; Active / Inactive / All status (Active by default); position; branch.                        |
| Tasks          | Search title or description; status; branch; assignee.                                                                    |
| Points history | Search officer/reason/event/task; award type; officer; event; activity-date range; admins also filter Active/Removed/All. |
| System Log     | Search action or record ID; actor (including System); action text; entity type; date range.                               |
| Calendar       | Toggle Events and Tasks visibility independently.                                                                         |

**DESIGN DECISION:** Keep filters visually secondary to results, compact, and aligned on desktop; wrap them at narrower widths. Labels stay visible and accessible. Show Apply for server-driven filters and Clear only when filters are active. Keep date validation feedback near the filter area. Do not invent filters, hide a current filter to reduce height, or create a giant always-open filter panel.

**CURRENT pagination:** Points history shows 25 entries per page. System Log shows 50. Their Previous/Next links preserve active filters and show the current page; those pages are not a basis for adding pagination to lists that do not currently have it. Record navigation from supported lists carries the safe originating list URL through detail and edit screens, and successful saves return through that context.

## 16. Forms and dialogs

Long workflows belong on dedicated pages, with a contextual return link. Small, focused actions can stay inline beside the record they affect. **CURRENT:** Event cancellation/archive, standalone and recurring Task archive, Point transaction removal, and warning approval/rejection use the shared in-app `ConfirmationDialog`, built on native HTML `<dialog>`. Recurring Event/Task actions show the selected occurrence scope from the existing form state. Other operations should be described according to their actual behavior, not assumed to share that confirmation pattern.

**DESIGN DECISION:** Group long forms into clear sections using the field names and relationships already present. Use two columns on desktop only for natural pairs; collapse to one column on narrow screens. Prefer existing constrained choices over unnecessary free typing. Keep labels explicit and optional/required status faithful to current validation. Validate close to the relevant field or action. Do not infer required fields or change validation rules for a proposed layout. Any dialog used for a future focused action must have a clear name and exit, work by keyboard, and avoid stacking with another dialog.

| Existing form                       | Current fields and constraints to preserve                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event create/edit                   | Required name, description, event type, location, one El Paso date, start/end times, and branches unless an authorized global event may have none. Slides, meeting-notes, and signup-sheet URLs are optional. Event type options include Meeting, Social, Workshop, and Session; location suggestions come from the location catalog. Creation supports recurrence. Editing a recurring event includes occurrence/following/all-scope controls and changed-field behavior. |
| Task create/edit                    | Required title, description, task type (Flyer, LinkedIn, Airtable, Story, or Post), branch, due date, and points. Creation can repeat daily or weekly, with interval and end options. Authorized managers edit standalone tasks directly; recurring tasks support occurrence scope. There is no approval field.                                                                                                                                                            |
| Officer add/edit                    | Required name and position; at least one email address must be provided, though each UTEP/personal email field is individually optional. Classification and branches are optional. Status appears on edit only. Application role is managed separately on the officer detail.                                                                                                                                                                                              |
| Point configuration                 | Admin-only edit of participation points per hour; current rate remains visible to other users.                                                                                                                                                                                                                                                                                                                                                                             |
| Manual point transaction/correction | Admin-only active Officer, points, reason, manual/correction type, and optional event link. Older events can be searched before choosing an event.                                                                                                                                                                                                                                                                                                                         |
| Officer catalogs                    | Add, rename, and delete controls for positions, branches, and event locations. Required baseline positions are shown as required and are not editable in the current UI; referenced-record deletion is rejected.                                                                                                                                                                                                                                                           |

For recurring Events and Tasks, the current choices include this occurrence, this and following occurrences, and all occurrences. Keep scope, changed fields, and workflow-history implications clear. Do not add form fields or recurrence options not shown by the application.

## 17. Feedback, empty states, and UI states

**CURRENT:** Server-action forms show inline errors with `role="alert"`, successes with `role="status"`, and pending button labels such as “Saving…” or “Adding…”. Pending controls are disabled. Filtered zero-results messages differ from an actually empty list. The confirmed operations listed in §16 use action-specific in-app confirmation dialogs. The root error screen offers Try again.

**DESIGN DECISION:** Keep loading/saving feedback near the operation, state what happened in plain language, disable repeat submission while pending where appropriate, and confirm success only after the trusted server action finishes. Do not assume optimistic updates for administrative records. Disabled controls should still read as controls and should explain unavailable states where needed. Destructive actions should explain their consequences and use confirmation for meaningful destructive operations; offer recovery only where the product permits it. Errors must be legible in both themes, explain what went wrong, and tell the user what they can do when there is a useful next step. Do not surface raw API/database errors, implementation jargon, apologies, or filler.

Empty states should be short and useful: “No tasks match these filters,” “No upcoming events,” or “No point transactions yet.” Where an existing action naturally resolves the empty state, a small action may be shown. Do not add illustrations to routine empty results, mascot jokes, or giant empty-state cards.

Distinguish truly empty data from zero results caused by active filters. Use terms officers recognize from club work rather than backend terminology. Keep capitalization and action names consistent across a workflow.

## 18. Responsive behavior

Desktop/laptop is the primary target. Keep the navigation usable as it wraps, let grids collapse naturally, change paired form columns to one column, and let filter bars wrap. Data-heavy tables may scroll horizontally. Calendar currently switches from a desktop month grid to a month list at compact widths (767px and below), keeping the browsed month when the view changes. Keep labels and table headings visible, preserve content order, and avoid replacing the product with a separate mobile feature model. Do not attempt to fit every page above the fold.

## 19. Accessibility

Accessibility is part of the design system:

- Meet WCAG AA contrast: at least **4.5:1** for normal text and **3:1** for large or bold text. Check both light and dark themes with actual token combinations, including muted text, borders, focus indicators, and status surfaces.
- Use semantic page/section headings in order and a single clear page-level heading.
- Provide visible keyboard focus on links, buttons, fields, and other controls.
- Keep a logical focus order and make navigation, forms, filters, dialogs, and actions usable by keyboard.
- Use real labels for every input; placeholders are examples, not labels.
- Make all actions keyboard-accessible, including navigation, filters, recurrence choices, and inline workflow controls.
- Any future custom dialog must keep focus and keyboard interaction usable, expose a clear name, and allow its supported dismissal path.
- Maintain sufficient text, border, and focus contrast in both themes.
- Never communicate status by color alone; show understandable status text.
- Use practical click/touch targets, roughly 40px high where appropriate, especially for navigation and inline actions. Do not use tiny icon-only targets merely to save space.
- Keep tables semantic, with headers correctly associated with data cells; preserve horizontal-scroll context for assistive technology.
- Give links and buttons names that describe their destination or operation. Retain contextual names such as “Sign up for [event]” where repeated actions appear.
- Any future animation must respect `prefers-reduced-motion`; motion cannot be the only way to convey state.

## 20. Icons and motion

**CURRENT:** Lucide icons are used in limited shared navigation details: the theme toggle and contextual return link. Icons are not the primary visual language of page headings, tables, or actions.

**DESIGN DECISION:** Keep one consistent icon language. Use an icon only when it improves recognition or saves meaningful space; retain text on important administrative actions. An icon-only control needs an accessible name and a practical hit target. Match the icon's size and visual weight to adjacent text. Icons are functional cues, not decoration; do not add one to every heading, card, or button.

Keep decorative motion rare. Motion must serve an interaction, be brief, and never compete with the task. Do not animate routine tables, badges, headings, metrics, or cards for personality. Clear loading and saving state changes matter more than transitions. Respect reduced-motion preferences for any future animation. Do not introduce glass, blur, or transparency as an application-wide style.

## 21. Screen specifications

The following sections describe the actual product workflows and the design direction for improving their presentation. Preserve all behavior identified as **CURRENT**.

### Dashboard

- **Purpose:** Give each signed-in officer a useful current view and direct access to work that needs attention.
- **Existing functionality that MUST be preserved — CURRENT:** Shows the current officer's name, club position, personal total points, and View profile link; three club summary metrics (active officers, upcoming events, points this half-year); a note defining January–June/July–December in America/Denver and that points include signed corrections; up to five personal action items from the current officer's incomplete Task assignments and pending warning decisions; all upcoming non-cancelled/non-removed events with schedule, signup status, and officer count; and the latest ten active point transactions with officer, related event/task or reason, points, and date. Links lead to the full owning area. The action-item list reports when more than five items exist.
- **Information hierarchy:** Page title/profile access; compact summary metrics and their explanation; action items; then upcoming events and recent point activity.
- **Recommended layout:** Keep the metrics in one modest row, action items as a simple divided list, and the two recent-activity sections side by side on wide screens. Let them stack on narrow screens.
- **Primary action:** No single global action; each action-item row is a direct link to its task or warning decision.
- **Secondary actions:** View profile; View all Tasks; View warning decisions; View all Events; View all Points.
- **Data presentation:** Small metric blocks, divided list rows, compact event list, compact point activity list. Use existing schedule and point formatters.
- **Minimalism notes:** Keep the current sections but distinguish metrics from actionable work; do not turn each section into a KPI card. Keep profile access small and the explanatory half-year note close to the metrics.
- **Do not add:** Attendance percentages, charts, notifications, unsupported KPIs, action items beyond the real workflow, or an analytics dashboard.

### Events list

- **Purpose:** Find events, see which ones the current officer joined, and sign up for open events.
- **Existing functionality that MUST be preserved — CURRENT:** Search name/description/location; filter by Upcoming, Happening, Past, and Cancelled, plus event type and branch. Authorized managers also have an explicit Archived view. With no historical status selected, show only active Events from today through Sunday and later Events, ordered nearest first. Organize default results as This week's events and Upcoming events, each containing Your events and Other events. Past appears only when Past is explicitly selected; Cancelled appears only when Cancelled is selected. Archived Events remain outside routine browsing and are visible only in the manager Archived view. Rows show event name, El Paso schedule, type, branches, signup count, status, and—only for eligible Other events when signup is open—a signup action. Opening an event preserves the current filter context for the contextual return link. New event is shown to users allowed to create for their branch scope.
- **Information hierarchy:** Title and authorized New event action; filter bar; This week's events and Upcoming events; Your events and Other events within each current section. Explicit Past, Cancelled, and authorized Archived filters show the selected history view without current temporal sections.
- **Recommended layout:** Keep the temporal sections and named participation subgroups after filters. Do not add a participation column because the groups already communicate participation. Show nearest current Events first and a concise section-level empty message where a time group is empty.
- **Primary action:** Sign up in an eligible Other events row; New event for authorized users.
- **Secondary actions:** Open an event by selecting its name; apply or clear filters.
- **Data presentation:** Two compact tables using the shared table, neutral branch labels, readable schedule text, and semantic status.
- **Minimalism notes:** Keep signup concise and visible in the Action column. Preserve a clear empty group message and differentiate no matches from an empty event catalog.
- **Do not add:** Duplicate participation indicators, invented event filters, a separate “my events” feature, or an event-type management destination (the old `/events/types` route redirects).

### Event detail

- **Purpose:** Understand an event, manage its participation, and review event-related points.
- **Existing functionality that MUST be preserved — CURRENT:** Contextual link to Events that returns to the originating filtered list when opened from one; event description, type, location, date, start/end, processing rate state, status, branches, and optional Slides, Meeting notes, and Signup sheet resource links; current officer's signup state; signed-up officer table; eligible signup removal/self-signup/manager add actions; manager past-event attendee addition and saved-rate point award information; manager edit, cancel, restore-cancellation, archive, and restore-archive actions according to event state; latest 100 point transactions and link to all event history. Event management is branch-permission dependent. Restoring an archived Event does not uncancel it.
- **Information hierarchy:** Event name/status and return link; event details and participation; event point history.
- **Recommended layout:** Two aligned detail sections on desktop (event information, participation/progress), with point history below. Keep descriptions and links easy to scan.
- **Primary action:** Edit event when the manager and event state allow it; otherwise show only the relevant signup/participation action.
- **Secondary actions:** Cancel, restore cancellation, archive or restore archive, manage signups/attendees, open Slides/Meeting notes/Signup sheet resources, view all point history, and follow officer/event links where currently available.
- **Data presentation:** Definition-list metadata, compact signup table, point transaction table, status badge, neutral branches.
- **Minimalism notes:** Group related management controls and keep Archive visually subordinate with confirmation. Preserve the distinction between an open signup and a past attendee/points operation.
- **Do not add:** New event statistics, duplicate signup counts, unrelated staff controls, or actions that bypass current branch permissions.

### Create/edit Event

- **Purpose:** Create an event or edit a selected event, including supported changes to a recurring series.
- **Existing functionality that MUST be preserved — CURRENT:** Dedicated New event and Edit event pages with contextual return links. When edit starts from an event opened in a filtered list, the originating list context survives the edit form and save. Form fields and recurrence scope are specified in §16. Branch options are scoped to the actor; an authorized global event may have no branch. New event is available to admins/all-branch executives and Leads with branch membership. Existing event editing follows branch permissions.
- **Information hierarchy:** Return link and page title; event identity/description; type/location and resource links; date/time; branch selection; optional recurrence; inline validation and save.
- **Recommended layout:** Keep name/description full width, pair Type with Location and Start with End, group schedule help beside Date/time, and keep branch checkboxes and recurrence in clearly labeled fieldsets. One-column form on narrow screens.
- **Primary action:** Save event; show pending “Saving…” feedback.
- **Secondary actions:** Select all/Clear all branches; return to Events or the edited Event.
- **Data presentation:** Labeled form controls, checkboxes for branches, optional URL fields, recurrence choices and scope.
- **Minimalism notes:** Group fields without changing validation. Preserve the schedule restriction/help text and distinguish creation recurrence from series editing.
- **Do not add:** Publish/draft states, new event types, an RSVP capacity workflow, required fields not present in validation, or a modal replacement.

### Tasks list

- **Purpose:** Find assigned and unassigned work, then open a Task to manage its Officers and completion.
- **Existing functionality that MUST be preserved — CURRENT:** Search title/description; filter by Current/Past view, Open/In progress/Complete workflow status, branch, and assignee. Authorized managers also have an explicit Archived view. Current tasks are active records due today or later in **This week's tasks** (due through Sunday in America/Denver) and **Upcoming tasks** (due after Sunday). Past tasks require the explicit `view=past` filter and are due before today. Within every temporal view, **Your tasks** means the current Officer has an assignment and **Other tasks** means they do not; a Task assigned to other Officers remains in Other tasks for this Officer. Current tasks sort nearest due date first; Past tasks sort newest due date first. Table columns are Task, Due, Type, Branch, Officers, Status, and eligible Action; descriptions and Points are omitted from list rows. Eligible Current Other tasks offer Assign to me; Past is read-only. There is no row-level manager assignment or self-completion. Opening a task preserves view and other filter context through detail and edit. New task follows current branch permissions. Archived Tasks remain outside routine browsing and are visible only in the manager Archived view.
- **Information hierarchy:** Page title/New task; filters; This week's tasks and Upcoming tasks, each containing Your tasks and Other tasks. Past and authorized Archived are separate explicit views; Past uses the same participation subgroups. Temporal view and workflow status remain separate filter dimensions.
- **Recommended layout:** Keep compact tables inside semantic time sections and named assignment subgroups. Use a section-level empty message when a time group has no Tasks and concise subgroup empty messages otherwise. Rows show Task, Due, Type, Branch, Officers, Status, and an eligible Action; omit descriptions and Points from list rows. On narrow screens keep only scan metadata, without full descriptions.
- **Primary action:** New task for authorized users; Assign to me in an eligible Other tasks row.
- **Secondary actions:** Open a Task by selecting its name; apply or clear filters.
- **Data presentation:** Task title, concise Denver calendar due date, type/branch metadata, a progress label such as `0 officers` or `2/3 completed`, and Open/In progress/Complete state. Description remains searchable and appears on Task detail; Points remain on detail and in Task behavior.
- **Minimalism notes:** Assignment and completion detail belongs on the Task page. Keep row actions compact and do not present a mixed Task as complete.
- **Do not add:** Event signup controls, approval statuses, manager assignment controls in list rows, fake ownership metrics, or list pagination (none currently exists).

### Task detail

- **Purpose:** Understand a work item, see every assigned Officer, and manage each completion state where authorized.
- **Existing functionality that MUST be preserved — CURRENT:** Contextual link to Tasks that returns to the originating filtered list; Task description, type, branch, due date, points and recurrence information; all Officers and their independent Completed / Not completed states; current Officer assignment state; self-assignment when not assigned; manager bulk add, completion control and safe removal of an unprotected assignment. Only authorized managers can change completion. An assignment's state can be changed before or after the due date. Recurring occurrences explain that assignments, completion and points belong to that occurrence. Authorized managers can edit standalone Tasks and eligible recurring Tasks, archive eligible Tasks, and restore archived Tasks. Restoring preserves assignment and workflow history. Optional linked Events appear as a separate navigable section; archived or cancelled state is labeled. Return context survives editing.
- **Information hierarchy:** Task title and return link; Task details and linked Events; Officers/completion; scoped edit/archive/restore controls.
- **Recommended layout:** Two grouped detail sections on desktop (Task details and Officers/completion), with controls adjacent to the assignment they affect. Keep recurring explanation close to scope-sensitive actions.
- **Primary action:** Self-assign when unassigned; otherwise a manager changes the selected Officer's completion state.
- **Secondary actions:** Bulk add or safely remove an Officer; edit, archive, or restore the Task for an authorized manager.
- **Data presentation:** Definition-list metadata, semantic Task status, compact Officers table, explicit completion labels, and checkbox controls for managers.
- **Minimalism notes:** Completion belongs to each assignment. Points are awarded only after the due date passes in America/Denver. There is no approval step.
- **Do not add:** Officer self-completion, approval buttons/status, Task-level assigned-versus-complete precedence for mixed completion, or Event-only detail fields.

### Create/edit Task

- **Purpose:** Create a work item or change supported fields of a standalone or recurring Task.
- **Existing functionality that MUST be preserved — CURRENT:** New task page allows authorized all-branch users or Leads with branches. It includes title, description, task type, branch, due date, points, optional Event links, and optional daily/weekly recurrence. Event links provide context only and follow the selected recurrence edit scope. Archived and cancelled Events are not offered as new links. Authorized managers can edit standalone Tasks; recurring Tasks retain occurrence/following/all scope. Points cannot be changed after a completion or Task award exists, preserving earned history. Assignment is managed after creation on Task detail. There is no approval field or approval workflow.
- **Information hierarchy:** Return link and title; Task description/details; due date and points; optional linked Events; recurrence group for new/series edits; validation and save.
- **Recommended layout:** Keep title/description easy to scan; pair Type with Branch and Due date with Points on desktop where the design fits. Collapse to one column on narrow screens.
- **Primary action:** Create Task or Save Task, with pending feedback.
- **Secondary actions:** Recurrence-scope controls when editing; contextual return to Tasks or the Task.
- **Data presentation:** Labeled inputs/selects, optional multi-select Event field, recurrence fieldset and recurrence scope explanation.
- **Minimalism notes:** Do not style this as an Event form; Task assignment and due-date points are core to its distinct workflow.
- **Do not add:** Individual assignee selection during Task creation, a fake draft/publish flow, approval terminology, or event scheduling fields.

### Calendar

- **Purpose:** See event schedules and task due dates together.
- **Existing functionality that MUST be preserved — CURRENT:** FullCalendar uses a desktop `dayGridMonth` and switches to `listMonth` at compact widths (767px and below), preserving the viewed month across the switch. Events and Tasks can be toggled independently and both are visible by default. It includes non-deleted, non-cancelled events and non-removed tasks; event times use America/Denver, task dates are all-day due dates, and selecting an entry opens its Event or Task detail. The month grid shows up to three entries per day before a “more” popover. Entry labels identify Event/Task and time/Due; entry links expose accessible descriptions. Calendar controls include Previous, Next, and Today; an empty/filtered state explains when there are no entries or no selected types. Event entries are blue and task due-date entries ochre to distinguish item types.
- **Information hierarchy:** Page title/description; compact Event/Task visibility controls and timezone note; responsive month grid or month list.
- **Recommended layout:** Retain FullCalendar and its current responsive month/list behavior and type toggles. Style its typography, controls, borders, entry contrast, and surfaces from the shared theme. Keep the calendar as the main content.
- **Primary action:** Navigate the month; selecting an entry opens its detail page.
- **Secondary actions:** Toggle event/task visibility; Today and previous/next month controls; open the “more” popover.
- **Data presentation:** Native FullCalendar month grid on desktop and month list at compact widths, with compact event/task entries. The two colors mean item type, not status.
- **Minimalism notes:** Make the calendar palette quiet in both themes, preserve the type toggles and FullCalendar overflow/list behavior, and keep event times readable.
- **Do not add:** A custom calendar replacement, additional filters or views beyond the current type toggles and responsive month/list views, attendance indicators, drag/drop workflows, or new entry types.

### Officers list

- **Purpose:** Find and review club officers and branch memberships.
- **Existing functionality that MUST be preserved — CURRENT:** Search name, UTEP email, or personal email; filter active/inactive status, position, and branch. The directory table contains Name, UTEP email, Personal email, Position, Classification, Branches, and Status. Opening an officer preserves the current filter context for the contextual return link. Admins can add officers and open Manage positions and branches. Separately, an officer sees warning decisions awaiting their own approval, if any.
- **Information hierarchy:** Title and admin Add officer action; catalog-management link where permitted; filters; pending decisions (only when present); directory.
- **Recommended layout:** Keep a readable desktop table that prioritizes name, contact, position/classification, branches, and status. Maintain the distinction between directory results and warning decisions.
- **Primary action:** Add officer for admins; otherwise opening a name is the main navigation action.
- **Secondary actions:** Manage positions and branches; approve/reject a warning assigned to the current user; apply/clear filters.
- **Data presentation:** Directory table, neutral branch badges, plain-text position/classification, semantic Active/Inactive status; compact warning decision articles.
- **Minimalism notes:** **OPTIONAL REFINEMENT:** If two email columns make the table too dense, show UTEP email as the primary contact and nest personal email beneath the officer identity. This is presentation only: keep both values searchable and available on detail.
- **Do not add:** A participation metric, position/classification badges, filters absent from the current list, or warning details/actions for users who cannot see or decide them.

### Officer detail

- **Purpose:** Review one officer's record, access, warnings, event association, and point history.
- **Existing functionality that MUST be preserved — CURRENT:** Contextual Officers link that returns to the originating filtered directory when opened from one; edit action for admins; UTEP/personal email, position, application role, classification, status, branches, and total points. Admins can change another officer's application role separately from club position. The officer and admins can see that officer's warning section; admins see all warning states and approval details, can filter by warning status, create/delete warnings, and see the three-approved-warning Admin Review message. The officer and admins can see associated events that are not cancelled or removed, plus the latest 100 active point transactions, with a link to full point history; historical Event references remain in Point history and System Log.
- **Information hierarchy:** Name/edit action; identity and status/branches; role and warning controls by permission; associated events; point history.
- **Recommended layout:** Keep identity/profile data in a concise definition list, separate status/branches and access controls, then show warnings and associated events as distinct sections. Point history spans the content width below.
- **Primary action:** Edit officer when admin; otherwise no global mutation action.
- **Secondary actions:** Save another officer's application role, warning actions available by role, open associated events, and view all points.
- **Data presentation:** Plain-text profile fields, status badge, neutral branch badges, warning status/date/reason/approval details, event list, point transaction table.
- **Minimalism notes:** Keep application role visibly separate from position. Preserve the explanatory note that deactivation is a separate manual decision after the warning threshold.
- **Do not add:** An automatic deactivation, a combined role/position selector, warnings for users who are not the officer or an admin, or duplicate point totals.

### Add/edit Officer

- **Purpose:** Create or update an officer record.
- **Existing functionality that MUST be preserved — CURRENT:** Admin-only dedicated Add officer/Edit officer pages with contextual return links. When editing from a filtered directory, the return destination is preserved through the form and save. Required name and position; at least one of UTEP or personal email; optional classification and branches; status is editable on existing records only. Application role does not belong to this form.
- **Information hierarchy:** Contextual link/title; name and contact; position/classification/status; branch choices; validation and save.
- **Recommended layout:** Keep name full width, pair the two email fields and position/classification where natural, then use one branch fieldset. One column on narrow screens.
- **Primary action:** Save officer.
- **Secondary actions:** Return to Officers or the officer detail.
- **Data presentation:** Labeled fields, optional text in labels, dropdowns, branch checkboxes, inline validation.
- **Minimalism notes:** State the “at least one email” rule clearly without making both email inputs look required.
- **Do not add:** Application role to the officer record form, invented classifications, or requirements beyond the current validation.

### Officer catalogs

- **Purpose:** Maintain the existing position, branch, and event-location choices.
- **Existing functionality that MUST be preserved — CURRENT:** Admin-only page with Positions, Branches, and Event locations lists. Each supports add; records support rename/delete when current restrictions permit. Six baseline positions are required and displayed as non-editable. The page explains that referenced records cannot be deleted and renaming retains IDs and relationships.
- **Information hierarchy:** Title and constraints note; three clearly named catalog sections; add control and record management actions within each section.
- **Recommended layout:** Keep this as a lightweight, dense management page. Separate sections with headings and thin borders; keep create/rename/delete controls adjacent to their item.
- **Primary action:** Add a record within a chosen catalog.
- **Secondary actions:** Rename or delete an eligible record.
- **Data presentation:** Simple lists with compact inline forms and visible success/error feedback.
- **Minimalism notes:** Keep the page scoped to the three existing catalogs; avoid dashboard cards and decorative metadata.
- **Do not add:** Event-type management, extra catalog areas, bulk import, or delete behavior that bypasses current referential restrictions.

### Officer warnings (embedded workflows)

- **Purpose:** Let assigned officers make warning decisions and admins manage warning records.
- **Existing functionality that MUST be preserved — CURRENT:** The Officers list may show pending decisions assigned to the signed-in user, including officer, reason, created time, Approve, and Reject. Officer detail shows warnings to the officer and admins; admins can filter active statuses, inspect Voided or All history, create a pending warning, inspect approval decisions, and void an active warning. Void retains the warning and its approvals, removes it from active totals, and is terminal. Warning reasons cannot be edited after creation. Creation requires approval from current President and Vice Presidents. The approved-warning threshold message does not itself deactivate an officer.
- **Information hierarchy:** Decision target/officer and reason; current status and date; required approval controls/details.
- **Recommended layout:** Use restrained, bordered articles and compact approve/reject actions. Keep decision buttons visually equal in priority; Void remains a secondary action with confirmation.
- **Primary action:** Approve or Reject a pending decision assigned to the current user.
- **Secondary actions:** Admin create/void and warning-history navigation.
- **Data presentation:** Plain text reason, status label, readable date, approval count and decision list for admins.
- **Minimalism notes:** Keep warning decision content separate from the directory table and visible only where access permits.
- **Do not add:** Editable warning reasons, automatic consequences, warning analytics, or invented approval roles.

### Points

- **Purpose:** Explain and manage participation points, officer totals, and transaction history.
- **Existing functionality that MUST be preserved — CURRENT:** Current participation rate is visible to everyone and editable by admins. Officer totals are shown for all officers, sorted by total then name. The page explains that finished-event participation awards are processed automatically. Admins can add manual transactions/corrections linked optionally to an event, search older events, edit point amounts, and remove transactions. History supports search, award type, officer, event, date range, and 25-row pagination; admins also filter active/removed/all and see actor/removal metadata and actions. Non-admin history remains limited to active records. Officer/Event/Task links in Point History preserve its filters and page for the contextual return path.
- **Information hierarchy:** Rate/configuration; officer totals; admin transaction form when permitted; point history filters, results, and paging.
- **Recommended layout:** Keep the long page as compact labeled sections. Do not turn every total into a card; allow officer totals and history to use the full available width. Keep manual entry visually separate from read-only history.
- **Primary action:** Admin Save rate or Add transaction, depending on the task; history is the main browsing workflow for other users.
- **Secondary actions:** Edit/remove available transaction; apply/clear filters; Previous/Next page; open officer/event/task records.
- **Data presentation:** Ranked total table, admin form, filter bar, history table with signed PointValue and semantic type/status labels.
- **Minimalism notes:** Preserve date filters, pagination, and removed-state review. Keep correction/removal context clear; do not make all history cells colorful.
- **Do not add:** New score metrics, charts, point categories, fake transaction references, or hidden admin audit fields.

### System Log

- **Purpose:** Let admins review recorded changes made in Cappy Hub.
- **Existing functionality that MUST be preserved — CURRENT:** Admin-only access; filters for search, actor/System, action text, entity type, and date range; newest-first rows; 50 records per page. Table fields are Time, Actor, Activity, Record, and Details. Known audit actions use centralized human-readable activity text and record context, preferring names in saved audit details and resolving current Event, Task, or Officer names where needed. Before/after values appear as readable field changes. Action and entity identifiers and raw JSON remain available under “Technical details”; unknown or legacy actions use a readable fallback. Dates use America/Denver. Previous/Next preserve filters and the footer shows page and filtered entry count.
- **Information hierarchy:** Title/short description; compact filters; audit table; page count/navigation.
- **Recommended layout:** Treat as a dense administrative table. Give time, actor, action, and entity readable widths; let details expand without widening the whole page unnecessarily.
- **Primary action:** Search/filter the log.
- **Secondary actions:** Expand Technical details; navigate pages.
- **Data presentation:** Neutral text with subtle row separators; formatted time; human-readable activity and record context; concise changed-field summary; collapsible technical identifiers and structured payload.
- **Minimalism notes:** Keep the page factual and quiet. Use “System Log” and supported field names; no decorative technical claims.
- **Do not add:** Fake sync/real-time indicators, cryptographic/ledger language, ingest status, analytics, or unaudited detail widgets.

### Admin

- **Purpose:** Direct admins to existing administrative workflows.
- **Existing functionality that MUST be preserved — CURRENT:** Admin-only landing page with links for Officer access (Officers), Positions and branches (catalog manager, including locations), Points configuration and corrections, and System Log. It does not duplicate these workflows.
- **Information hierarchy:** Admin title/description; four existing destinations.
- **Recommended layout:** Keep it a small directory of restrained link panels or a simple list. One short explanation and a clear link per area.
- **Primary action:** Open the chosen administration area.
- **Secondary actions:** None beyond each area's own workflow.
- **Data presentation:** Four current destination descriptions and links.
- **Minimalism notes:** Keep it lightweight and scannable; do not convert the landing page into a second Dashboard.
- **Do not add:** Analytics, duplicated officer/point/log tables, new admin areas, or destinations absent from the application.

### Login

- **Purpose:** Start authentication for an authorized officer.
- **Existing functionality that MUST be preserved — CURRENT:** A compact Cappy Hub panel with the Coding Interview Club administration description, Google sign-in in non-local environments, local development-account buttons in local environments, and an inline authentication error. A currently signed-in officer is redirected to Dashboard.
- **Information hierarchy:** Product identity; short purpose; sign-in action; error if one exists.
- **Recommended layout:** Keep the panel centered and compact with clear separation between identity and authentication. This is the single recommended location for a tiny capybara mark.
- **Primary action:** Continue with Google, or choose a local development account locally.
- **Secondary actions:** Retry after an authentication error.
- **Data presentation:** Plain text and a small number of clear buttons.
- **Minimalism notes:** Keep login focused; do not turn it into a public landing page.
- **Do not add:** A new authentication provider, sign-up workflow, user profile setup, or marketing content.

### Access denied

- **Purpose:** Explain that the current Google account cannot access Cappy Hub and provide an exit.
- **Existing functionality that MUST be preserved — CURRENT:** Short Access denied heading/message and “Sign out and try another account” action.
- **Information hierarchy:** State the problem; provide the sign-out action.
- **Recommended layout:** Use the same compact surface language as login, with clear text and one obvious action.
- **Primary action:** Sign out and try another account.
- **Secondary actions:** None.
- **Data presentation:** Plain-language message and button.
- **Minimalism notes:** Keep the explanation calm and direct.
- **Do not add:** Permission details, account switching, or a new access request workflow that does not exist.

### Error and not found

- **Purpose:** Explain a failed page load or missing record and provide the existing recovery path.
- **Existing functionality that MUST be preserved — CURRENT:** Generic load error says “Unable to load this page,” mentions Supabase configuration/connection, and offers Try again. Not found says “Record not found,” explains the requested officer, event, or page does not exist, and links Back to dashboard.
- **Information hierarchy:** Clear heading; short explanation; recovery action.
- **Recommended layout:** Keep these states simple, readable, and consistent with the same neutral surface/text hierarchy.
- **Primary action:** Try again for load errors; Back to dashboard for not found.
- **Secondary actions:** None.
- **Data presentation:** Short text and one action.
- **Minimalism notes:** Do not expose raw stack traces or add decorative empty-state art.
- **Do not add:** Fake incident IDs, fabricated support workflows, diagnostics claims, or a new navigation destination.

## 22. Design approval checklist

Before accepting a Stitch, Figma, AI-generated, or human redesign, confirm:

- The screen's main job is obvious and all current functionality is preserved.
- Permission-dependent actions, fields, validation, routes, statuses, and workflows remain correct.
- No fake metrics, features, integrations, data, or permissions were introduced.
- Information hierarchy works without color alone; realistic long names, many rows, and multiple branches remain readable.
- Loading, error, empty, filtered-zero, success, pending, and destructive states are considered.
- Keyboard focus is visible, controls have clear names, and contrast meets the accessibility floor in both themes.
- Light and dark themes are both complete and geometry remains consistent.
- The layout works at realistic laptop widths and narrower browser windows.
- Capybara identity remains restrained; decorative objects do not pretend to communicate state.
- Terminology is consistent and an unnecessary accessory has been considered for removal.
- The result feels like Cappy Hub, not a generic generated dashboard.

## 23. Rules for AI design tools

Tools such as Google Stitch must follow these rules:

1. The current repository and this document define Cappy Hub. Treat the repository as the authority for what currently exists.
2. Do not invent functionality.
3. Do not invent metrics.
4. Do not invent integrations.
5. Do not invent data fields.
6. Do not invent navigation destinations.
7. Do not invent statuses.
8. Do not add buttons or workflows merely to fill whitespace.
9. Do not add generic SaaS dashboard patterns unless this document explicitly describes them as current.
10. If information is missing, preserve the existing screen and ask for clarification rather than guessing.

Explicitly do not invent analytics cards, attendance percentages, fake sync indicators, real-time indicators, registry integrations, SHA/ledger language, source-reference widgets, notifications, a command palette, chat assistant, organization switcher, arbitrary charts, global search, fake drafts, or fake publish workflows.

Every generated redesign must preserve the existing screen's access rules, actual fields, statuses, filters, actions, and workflow order. Keep any optional presentation suggestion labeled as a suggestion until product code actually implements it.

## 24. Design decisions and changelog

- **2026-10-03 — Initial source-of-truth document.** Recorded the current application surfaces and workflows from the repository; established calm, clean, subtly capybara-inspired visual direction. No application behavior or code is changed by this document.
- **2026-10-03 — Design quality refinement.** Added Cappy Hub's purpose/agency/responsibility/familiarity/flexibility/simplicity/craft/delight review lens, plus practical accessibility, interaction, writing, icon, motion, anti-generic, and approval guidance. Broad principles from the external [Apple Design Skill](https://github.com/dickwu/apple-design-skill) were used only as a reference and adapted for a browser-based internal admin tool; no skill files were copied or installed, no dependency was added, and no application behavior changed.
- **2026-10-04 — Task management parity.** Updated the current Task list, assignment/completion, standalone edit/removal, Dashboard and due-date points behavior for Issue #129. The approval workflow remains only in legacy database compatibility and historical records.
- **2026-10-04 — Task list presentation parity.** Removed descriptions and Points from Task list rows, formatted due dates for concise display, and matched the row assignment action to Event signup. Search, Task detail, and points behavior remain unchanged for Issue #136.
- **2026-10-04 — Administrative presentation refinement.** Widened data-heavy protected pages while retaining the narrower reading width elsewhere, compacted table and filter spacing, refined Dashboard participation color, added a derived Rank to sorted Points totals, and simplified Admin links. Routes, data, workflows, and permissions remain unchanged for Issue #128.
