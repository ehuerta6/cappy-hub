# Shared components and interaction patterns

## Shared components and controls

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

## Data presentation

### Tables and rankings

Use tables for directory, Event, Task, ranking, and history data. Align them to the shared content grid with quiet headers, clear row separators, readable cell spacing, stable numeric alignment, and restrained hover. Let long values wrap; use the named, keyboard-focusable table overflow fallback only when needed.

Use badges for real state or category, not ordinary metadata. Branches and profile details remain neutral. Points ranking emphasizes rank, Officer, and total points. Do not use decorative progress bars or imply comparisons unsupported by the data.

### Dates and times

Use the existing helpers in `lib/presentation.ts` for human-readable display. Event schedules use the application's El Paso time zone (`America/Denver`); SQL date-only values must not shift across time zones. Do not introduce raw timestamps, seconds, or repeated time-zone labels without a clear need. Calendar opens at today for the current period and remains anchored within an explicitly selected historical period.

## Forms, dialogs, and popups

Create/edit Event, Task, and Officer forms share the same centered form grid, bordered fieldsets, blue-tinted legends, label spacing, error placement, and action row. Group fields by purpose. Do not wrap a form in an extra card when its fieldsets already provide the needed grouping.

Keep labels visible and connected to controls. Place validation next to the relevant field and retain error descriptions. Preserve pending text and disabled states without changing control geometry. Reuse the shared dialog surface, title, description, field, and footer patterns. Popups stay visually connected to their triggers and remain keyboard-operable.

In the shared Resource links editor, adding a row moves focus into its label; removing a row moves focus to the next row, then the previous row, or Add link when none remain. Give rows stable identities so removing one does not change another row's values or focus. Associate resource validation with the group and its controls, announce the error, and let keyboard users reach and correct the affected fields.

## Feedback and interface states

Use semantic success, info, warning, danger, and neutral tokens for toast, form, and inline feedback. State copy must explain what happened or what needs attention. Keep loading/pending, error, empty, filtered-zero, success, disabled, and historical read-only states explicit. Do not invent success or real-time claims.

## Accessibility and interaction

Use semantic headings, landmarks, tables, labels, fieldsets, buttons, and status regions. Preserve accessible names, error descriptions, and safe return navigation. Every interactive control must work by keyboard and show the shared blue focus ring. Maintain readable contrast in both themes, browser zoom, and long-content cases. Do not rely on color alone for selection or state.
