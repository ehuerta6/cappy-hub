# Cappy Hub interface design

Cappy Hub is the Coding Interview Club's internal administrative application. This guide defines its visual language and reusable UI patterns. Product behavior, terminology, permissions, and data rules remain defined by `docs/product/design-doc.md`, approved Issues, and the application itself.

## Design direction

The interface is a calm, desktop-first workspace for completing club administration. It uses a monochrome foundation, the CIC mark, and a restrained calendar blue accent. Semantic colors help users distinguish meaningful statuses and outcomes. Layout and typography establish hierarchy before decoration.

- Keep the application recognizable as Cappy Hub and retain the existing CIC logo and Geist typeface.
- Use space efficiently across the available desktop width. Keep page content aligned to a shared left and right edge instead of squeezing it into a narrow center column.
- Make the active page, primary action, current period, and record state easy to scan.
- Prefer a small number of deliberate surfaces, grouped fields, and useful tables over decorative cards or oversized page chrome.
- Reuse shared components and semantic CSS tokens. A component must keep the same geometry and interaction in light and dark themes.
- Preserve all existing workflows, role gates, URL state, and accessible interaction patterns.

## Application frame and page layout

The protected application uses one full-width horizontal header containing the CIC mark and Cappy Hub name, main navigation, academic-period selector, theme control, current account, and Sign out. The active destination is shown with a blue underline. Header controls share a common height, border, radius, text weight, and focus treatment.

Every page begins immediately below the shared header. Use `PageHeader` for the page title, a short description where helpful, and a primary action when the page supports one. Its slim blue left rule and bottom border establish the same starting point across Dashboard, list, detail, and administration pages. Do not add route-specific top padding that detaches a page title from the header.

Use the shared content width classes:

- Main work areas can use up to `108rem` and keep consistent horizontal padding.
- Forms are centered within a maximum width of `76rem`.
- Record details use up to `92rem` when the information benefits from additional columns.
- Keep tables readable and allow their own bounded horizontal scrolling when necessary.

Use the same section heading treatment throughout the application: clear text, a small blue dot, and a subtle divider when the section contains a list or grouped content. Keep title size, weight, baseline, and section spacing consistent across routes.

## Color tokens

Use semantic tokens from `app/globals.css`; do not hard-code a local palette for individual routes.

| Role           | Dark theme | Light theme | Use                                                                   |
| -------------- | ---------- | ----------- | --------------------------------------------------------------------- |
| Background     | `#09090b`  | `#fafafa`   | Main application canvas                                               |
| Surface        | `#111113`  | `#ffffff`   | Forms, grouped panels, dialogs                                        |
| Muted surface  | `#18181b`  | `#f4f4f5`   | Inputs, quiet controls, secondary rows                                |
| Foreground     | `#f4f4f5`  | `#18181b`   | Primary text                                                          |
| Secondary text | `#d4d4d8`  | `#3f3f46`   | Supporting labels and controls                                        |
| Muted text     | `#a1a1aa`  | `#52525b`   | Descriptions and secondary metadata                                   |
| Border         | `#27272a`  | `#e4e4e7`   | Separators and component outlines                                     |
| Brand / info   | `#a6c5df`  | `#315f82`   | Calendar identity, current selection, upcoming and informative states |
| Success        | `#91c6a0`  | `#286443`   | Earned points and completed or successful outcomes                    |
| Warning        | `#fbbf24`  | `#a16207`   | Attention needed or time-sensitive status                             |
| Danger         | `#e0a29a`  | `#a7463c`   | Errors, removal, and destructive actions                              |
| Teal           | `#8ac4b4`  | `#25675d`   | Secondary positive category accents where already meaningful          |

The dark theme is the visual default. Light and dark themes use the same component structure and state colors; only token values change. Keep the canvas and surfaces monochrome. Reserve color for selection, status, validation, and other meaningful information. Pair color with a label or icon so status is never communicated by color alone. Check readable contrast in both themes.

## Typography and spacing

Use Geist Sans for interface text and Geist Mono only for values that benefit from fixed-width alignment. Keep hierarchy compact and consistent:

- Page titles use the shared `PageHeader` size and weight.
- Section titles use `SectionHeading` or the matching shared section treatment.
- Body text and controls use the established app scale; metadata remains readable and secondary.
- Point totals, dates, and other comparable numeric values use tabular numerals.

Follow the existing Tailwind spacing scale. Align labels, fields, buttons, table cells, tabs, and page edges. Avoid adding arbitrary vertical padding around only one route.

## Components and patterns

### Actions and controls

Use one primary button style for create, save, and submit actions; one outlined secondary style for supporting actions; and a distinct danger treatment only for destructive actions. Links that navigate should read as links, not as a second primary button. Give buttons, selects, and theme/period controls consistent height, padding, border, radius, hover, disabled, and keyboard-focus states.

### Sections, panels, and forms

Use section groupings to explain how fields relate. Event and Task create/edit forms share the same centered two-column form grid, bordered fieldsets, blue-tinted legends, label spacing, error placement, and action row. Other forms reuse the same field, form-message, and fieldset primitives. Do not wrap a form in an extra card when its fieldsets already provide the needed grouping.

### Tables and rankings

Keep tables aligned to the shared content grid, with quiet headers, clear row separators, readable cell spacing, stable numeric alignment, and restrained hover. Use status badges or colored labels only for real state or category. The Points leaderboard emphasizes rank, officer, and total points; do not add decorative progress bars or imply comparisons unsupported by the task.

### Tabs and filters

Use compact underlined tabs with a clear blue selected state. Keep filters grouped above their results, align control labels and heights, and retain the current URL-backed filter and period behavior. Show active filter state and empty results clearly.

### Dialogs, popups, toasts, and feedback

Reuse the shared dialog surface, title, description, field, and footer patterns. Keep popups visually connected to their trigger and keyboard-operable. Toasts and form feedback use semantic success, information, warning, or error tokens with clear text. Show pending and disabled states without changing control geometry.

### Badges and status

Use semantic success, information, warning, danger, and neutral treatments for existing product states. Keep branch and ordinary record metadata neutral. Use text or icons alongside color. Do not create new status meanings as a visual shortcut.

## Page-specific composition

- **Dashboard:** use the same page header as Events and Tasks; summarize existing counts and activity in aligned groups. Keep the action-items section, upcoming events, and recent point activity easy to scan.
- **Events and Tasks:** use matching headers, filters, section headings, table/list density, tags, and action placement. Their create/edit forms share a composition.
- **Calendar:** retain the existing month grid and filter controls. Open the current period at today's date; when a historical period is explicitly selected, keep the calendar within that period.
- **Officers and Admin:** use the same headers, table patterns, page widths, forms, dialogs, and action hierarchy. Administration routes should feel like part of the same app, not a separate toolkit.
- **Points:** keep Overview and History tabs consistent with the rest of the app. Make ranking and the existing admin adjustment entry easy to distinguish without adding point workflows or changing award semantics.

## Accessibility and interaction

Use semantic headings, landmarks, tables, labels, fieldsets, and buttons. Preserve existing accessible names and error descriptions. Every interactive control must work with a keyboard, show a visible focus ring, and keep sufficient contrast in both themes. Disabled, pending, error, empty, read-only, and success states must remain explicit. Preserve browser zoom and avoid clipping important actions or long content.

## Scope and maintenance

This document is visual and interaction guidance; it does not authorize new product features, changes to data, permissions, audit behavior, or business rules. Update it when the shared design language changes. Keep current behavior and approved product decisions in their canonical product and implementation sources.
