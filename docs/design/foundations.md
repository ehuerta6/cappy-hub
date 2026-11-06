# Design foundations

## Purpose and product scope

Cappy Hub is the Coding Interview Club's internal administrative application. It is a desktop-first working tool for existing Officer, Event, Task, Calendar, Points, and Admin workflows. The Dashboard summarizes club activity rather than introducing a separate analytics system.

The repository is the authority for what currently exists. This guide is the authority for its visual direction. Keep those roles distinct: visual guidance never changes requirements, permissions, records, or business rules by itself.

### Existing UI inventory

| Surface            | Route                                                    | Existing responsibility                                                                       |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dashboard          | `/`                                                      | Club summary, personal points, action items, upcoming Events, and recent point activity.      |
| Events             | `/events`                                                | Find Events, review participation groups, and use eligible signup actions.                    |
| Event detail       | `/events/[id]`                                           | Review an Event, participation, related Tasks, and its point history.                         |
| Create/edit Event  | `/events/new`, `/events/[id]/edit`                       | Maintain Event details and existing recurrence controls.                                      |
| Tasks              | `/tasks`                                                 | Find assigned and available Tasks and use eligible assignment actions.                        |
| Task detail        | `/tasks/[id]`                                            | Review a Task, its assignments, completion, linked Events, and existing recurrence actions.   |
| Create/edit Task   | `/tasks/new`, `/tasks/[id]/edit`                         | Maintain Task details and existing recurrence controls.                                       |
| Calendar           | `/calendar`                                              | View existing Events and Task due dates with visibility controls.                             |
| Officers           | `/officers`                                              | Search and filter the Officer directory.                                                      |
| Officer detail     | `/officers/[id]`                                         | Review a profile, related work, and available Officer sections.                               |
| Add/edit Officer   | `/officers/new`, `/officers/[id]/edit`                   | Maintain Officer record fields and branch assignments.                                        |
| Officer catalogs   | `/officers/catalogs`                                     | Maintain existing positions, branches, Event Types, and reusable Event locations.             |
| Points             | `/points`                                                | View period ranking and history; Admins can use the existing adjustment entry when permitted. |
| Admin              | `/admin`, `/admin/periods`                               | Reach existing administration areas and manage academic periods.                              |
| Login and recovery | `/login`, `/access-denied`, error and not-found surfaces | Sign in, explain access or loading problems, and provide existing recovery actions.           |

Admin-only destinations and mutation controls remain subject to server-enforced authorization. The UI must reflect those permissions, but hiding a control is never an authorization boundary. See the product specification for exact role rules.

## Design direction

Cappy Hub is a calm, capable utility. Its foundation is monochrome, its primary accent is the blue already used by Calendar, and semantic colors distinguish real statuses and outcomes. The CIC logo and Geist typeface keep it recognizable. Hierarchy comes from typography, alignment, and purposeful spacing before decoration.

- Keep the canvas and main surfaces black/white/gray in both themes; theme changes affect tokens, not component structure or behavior.
- Use blue for navigation selection, focus, current-period identity, and informative states. Use other colors only for meaningful semantic states.
- Spend emphasis on the page title, primary action, current selection, and record state. Keep ordinary metadata quiet.
- Use the available desktop width while maintaining a shared page edge and a comfortable reading width for forms and records.
- Prefer purposeful panels, grouped fields, and useful tables over decorative cards or oversized page chrome.
- Reuse components and tokens so a shared control has the same geometry and interaction everywhere.

## Design review lens

Each page and named section should have one primary job. Use these questions when designing or reviewing it:

- **Purpose:** Does every visible element support the task, hierarchy, or a meaningful brand detail?
- **Agency:** Can people tell what an action does and what state the system is in? Can they recover through an existing path?
- **Responsibility:** Does the UI reflect actual permissions and server results? Never imply data, synchronization, access, or reversibility that is not real.
- **Role composition:** When a role lacks an action, does the remaining content use the available space well instead of leaving an empty column?
- **Familiarity:** Do navigation, back links, headers, tables, filters, forms, statuses, confirmation, and feedback follow shared patterns?
- **Flexibility:** Do realistic laptop widths, long names, long titles, many rows, multiple branches, browser zoom, keyboard use, and both themes remain understandable?
- **Simplicity:** Can a redundant label, status, border, heading, icon, or container be removed without losing clarity?
- **Craft:** Are spacing, alignment, wording, empty states, focus, pending states, and visual rhythm intentional?

Review in this order: accessibility and correctness; workflow familiarity; information hierarchy; interaction feedback; visual craft and CIC identity; final polish.

## Color system

Use semantic tokens from `app/globals.css`. Do not hard-code route-specific palettes.

| Role           | Dark theme | Light theme | Use                                                         |
| -------------- | ---------- | ----------- | ----------------------------------------------------------- |
| Background     | `#09090b`  | `#fafafa`   | Application canvas                                          |
| Surface        | `#111113`  | `#ffffff`   | Dialogs, grouped panels, and primary input surfaces         |
| Muted surface  | `#18181b`  | `#f4f4f5`   | Inputs, quiet controls, and secondary rows                  |
| Foreground     | `#f4f4f5`  | `#18181b`   | Primary text                                                |
| Secondary text | `#d4d4d8`  | `#3f3f46`   | Labels and controls                                         |
| Muted text     | `#a1a1aa`  | `#52525b`   | Descriptions and supporting metadata                        |
| Border         | `#27272a`  | `#e4e4e7`   | Separators and component boundaries                         |
| Brand / info   | `#a6c5df`  | `#315f82`   | Calendar identity, selection, focus, and informative states |
| Success        | `#91c6a0`  | `#286443`   | Earned points and successful outcomes                       |
| Warning        | `#fbbf24`  | `#a16207`   | Attention needed or time-sensitive state                    |
| Danger         | `#e0a29a`  | `#a7463c`   | Errors, removals, and destructive meaning                   |
| Teal           | `#8ac4b4`  | `#25675d`   | Existing secondary positive category accents                |
| Violet         | `#c4b5fd`  | `#6d28d9`   | Archived or deleted record states                           |

Keep surfaces monochrome. Pair color with text or an icon so state is never communicated by color alone. Light and dark themes use the same components and status meanings; check contrast in both.

## Typography, spacing, and density

- Use Geist Sans for interface text and Geist Mono only where fixed-width alignment helps.
- Page titles use the shared `PageHeader`; section titles use `SectionHeading` or the same established treatment.
- Keep body, control, label, and metadata sizes on the app's established scale. Use tabular numerals for comparable points, counts, and dates.
- Follow the existing spacing scale. Align labels, fields, buttons, tabs, tables, and page edges.
- Keep rows compact but readable. Avoid arbitrary height or padding differences between related pages.
- Use natural document scrolling for long pages. Do not hide important actions in nested scrolling regions.

## Application frame and navigation

The protected application uses one full-width horizontal header with the existing CIC mark and Cappy Hub name, main navigation, academic-period selector, theme control, current account, and Sign out. Keep all established destinations visible in the supported desktop layout, with Admin shown only when authorized. The selected destination uses the Calendar blue underline.

Header controls share height, padding, border, radius, text weight, hover, disabled, and keyboard-focus treatments. The period selector, theme toggle, account label, and Sign out action align on the same row. Do not add a second header treatment to an individual page.

Every protected page starts directly below the shared header. Use the shared content edge and `PageHeader` for a title, a short description when helpful, and an action where one exists. `PageHeader` uses the slim blue left rule and bottom divider. Do not add route-specific top spacing that detaches the title from navigation.

Use the shared width rules: main work areas up to `108rem` with consistent horizontal padding; forms up to `76rem`; record details up to `92rem` when their information benefits from extra columns. Keep the page aligned to the same left and right edge.

Contextual return links use `ContextualBackLink`, including its shared arrow, spacing, focus state, and safe return context. Avoid plain text “Back to …” links with a separate visual treatment.
