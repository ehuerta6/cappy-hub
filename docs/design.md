# Cappy Hub Design System

This document defines the current visual and interaction language for Cappy Hub. It also inventories the existing application surfaces so UI work can be reviewed in context. Product behavior, terminology, permissions, and data rules are owned by `docs/product/design-doc.md`, approved Issues, and the implementation; this document does not authorize product changes.

## 1. Purpose and product scope

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

## 2. Design direction

Cappy Hub is a calm, capable utility. Its foundation is monochrome, its primary accent is the blue already used by Calendar, and semantic colors distinguish real statuses and outcomes. The CIC logo and Geist typeface keep it recognizable. Hierarchy comes from typography, alignment, and purposeful spacing before decoration.

- Keep the canvas and main surfaces black/white/gray in both themes; theme changes affect tokens, not component structure or behavior.
- Use blue for navigation selection, focus, current-period identity, and informative states. Use other colors only for meaningful semantic states.
- Spend emphasis on the page title, primary action, current selection, and record state. Keep ordinary metadata quiet.
- Use the available desktop width while maintaining a shared page edge and a comfortable reading width for forms and records.
- Prefer purposeful panels, grouped fields, and useful tables over decorative cards or oversized page chrome.
- Reuse components and tokens so a shared control has the same geometry and interaction everywhere.

## 3. Design review lens

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

## 4. Color system

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

## 5. Typography, spacing, and density

- Use Geist Sans for interface text and Geist Mono only where fixed-width alignment helps.
- Page titles use the shared `PageHeader`; section titles use `SectionHeading` or the same established treatment.
- Keep body, control, label, and metadata sizes on the app's established scale. Use tabular numerals for comparable points, counts, and dates.
- Follow the existing spacing scale. Align labels, fields, buttons, tabs, tables, and page edges.
- Keep rows compact but readable. Avoid arbitrary height or padding differences between related pages.
- Use natural document scrolling for long pages. Do not hide important actions in nested scrolling regions.

## 6. Application frame and navigation

The protected application uses one full-width horizontal header with the existing CIC mark and Cappy Hub name, main navigation, academic-period selector, theme control, current account, and Sign out. Keep all established destinations visible in the supported desktop layout, with Admin shown only when authorized. The selected destination uses the Calendar blue underline.

Header controls share height, padding, border, radius, text weight, hover, disabled, and keyboard-focus treatments. The period selector, theme toggle, account label, and Sign out action align on the same row. Do not add a second header treatment to an individual page.

Every protected page starts directly below the shared header. Use the shared content edge and `PageHeader` for a title, a short description when helpful, and an action where one exists. `PageHeader` uses the slim blue left rule and bottom divider. Do not add route-specific top spacing that detaches the title from navigation.

Use the shared width rules: main work areas up to `108rem` with consistent horizontal padding; forms up to `76rem`; record details up to `92rem` when their information benefits from extra columns. Keep the page aligned to the same left and right edge.

Contextual return links use `ContextualBackLink`, including its shared arrow, spacing, focus state, and safe return context. Avoid plain text “Back to …” links with a separate visual treatment.

## 7. Shared components and controls

### Page and section headings

Use one PageHeader per page. Use a consistent SectionHeading with clear text and a small blue dot. Keep section title size, weight, baseline, and divider treatment aligned throughout Dashboard, lists, detail pages, and Admin. Use the component's `id` when the section is referenced by an accessible label.

### Actions and links

- **Primary:** One strong filled action for create, save, and submit operations.
- **Secondary:** One outlined style for supporting or reversible actions.
- **Danger:** Restrained red for destructive meaning, with the existing confirmation pattern where required.
- **Text/link:** Navigation and low-priority actions should read as links, not competing primary buttons.

Give controls consistent height, padding, border, radius, hover, pending, disabled, and keyboard-focus states. Use specific action labels that state the result. Preserve distinctions between different product operations such as cancel, archive, remove, restore, and void.

### Tabs, filters, and pagination

Use compact underlined tabs with a clear blue selected state and `aria-current` where applicable. Keep filters grouped above their results, with visible labels and aligned controls. Show Apply for server-driven filters and Clear only when a filter is active. Preserve URL-backed filters and return context.

Reuse the shared compact pagination pattern: counts remain visible, page controls appear for multiple pages, and navigation preserves active filters and route parameters. Keep pagination outside nested scrolling containers.

## 8. Data presentation

### Tables and rankings

Use tables for directory, Event, Task, ranking, and history data. Align them to the shared content grid with quiet headers, clear row separators, readable cell spacing, stable numeric alignment, and restrained hover. Let long values wrap; use the named, keyboard-focusable table overflow fallback only when needed.

Use badges for real state or category, not ordinary metadata. Branches and profile details remain neutral. Points ranking emphasizes rank, Officer, and total points. Do not use decorative progress bars or imply comparisons unsupported by the data.

### Dates and times

Use the existing helpers in `lib/presentation.ts` for human-readable display. Event schedules use the application's El Paso time zone (`America/Denver`); SQL date-only values must not shift across time zones. Do not introduce raw timestamps, seconds, or repeated time-zone labels without a clear need. Calendar opens at today for the current period and remains anchored within an explicitly selected historical period.

## 9. Forms, dialogs, and popups

Create/edit Event, Task, and Officer forms share the same centered form grid, bordered fieldsets, blue-tinted legends, label spacing, error placement, and action row. Group fields by purpose. Do not wrap a form in an extra card when its fieldsets already provide the needed grouping.

Keep labels visible and connected to controls. Place validation next to the relevant field and retain error descriptions. Preserve pending text and disabled states without changing control geometry. Reuse the shared dialog surface, title, description, field, and footer patterns. Popups stay visually connected to their triggers and remain keyboard-operable.

## 10. Feedback and interface states

Use semantic success, info, warning, danger, and neutral tokens for toast, form, and inline feedback. State copy must explain what happened or what needs attention. Keep loading/pending, error, empty, filtered-zero, success, disabled, and historical read-only states explicit. Do not invent success or real-time claims.

## 11. Page composition

- **Dashboard:** Match the Events and Tasks page header. Summarize current counts and activity; keep action items, upcoming Events, and recent point activity easy to scan.
- **Events and Tasks:** Keep page headers, filters, section headings, list density, tags, and action placement aligned. Their create/edit pages share the same form composition.
- **Event and Task details:** Use the shared back link, PageHeader, tabs, sections, status treatment, and contextual return behavior.
- **Calendar:** Preserve the existing month grid and Event/Task visibility controls. The default date follows the current or explicitly selected period rules above.
- **Officers:** Use the same list, detail, form, tab, badge, and dialog patterns. Officer role and branch controls follow the existing authorization rules.
- **Points:** Keep Overview and History tabs consistent with the app. Distinguish ranking from the existing Admin adjustment entry without adding workflows or changing award semantics.
- **Admin:** Keep landing, period, catalog, and embedded warning workflows within the same page headers, back links, forms, tables, dialogs, tabs, and action hierarchy.
- **Login and recovery:** Keep these focused on product identity, a clear explanation, and the existing sign-in or recovery action. Do not turn them into marketing pages.

When an action is absent for a role or historical period, recompose the page so its remaining content uses the space well.

## 12. Accessibility and interaction

Use semantic headings, landmarks, tables, labels, fieldsets, buttons, and status regions. Preserve accessible names, error descriptions, and safe return navigation. Every interactive control must work by keyboard and show the shared blue focus ring. Maintain readable contrast in both themes, browser zoom, and long-content cases. Do not rely on color alone for selection or state.

## 13. Design approval checklist

Before accepting a visual change, confirm:

- The page's main job is clear and existing functionality is preserved.
- Permissions, fields, validation, routes, statuses, filters, and return context still match current behavior.
- No fake metrics, integrations, features, or permissions have been introduced.
- Hierarchy works without color alone; names, titles, rows, and branch lists remain readable.
- Empty, filtered-zero, error, pending, success, disabled, and read-only states are considered.
- Keyboard focus, accessible names, and contrast work in both themes.
- Shared components keep consistent geometry and the page aligns with the application frame.
- A redundant accessory or container has been considered for removal.

## 14. Scope and maintenance

This guide describes the approved visual and interaction system. It does not authorize new workflows, routes, metrics, data, permission changes, or changes to audit behavior. Update it when the shared design system changes; keep product requirements and durable decisions in their canonical sources.
