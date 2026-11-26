# Shared components and interaction patterns

## Shared components and controls

### Page and section headings

Use one PageHeader per page. Use a consistent SectionHeading with clear text and a small blue dot. Keep section title size, weight, baseline, and divider treatment aligned throughout Dashboard, lists, detail pages, and Admin. Use the component's `id` when the section is referenced by an accessible label.

### Actions and links

- **Primary:** One strong filled action for create, save, catalog add/save, and submit operations.
- **Secondary:** One outlined style for supporting or reversible actions.
- **Danger:** Restrained red (`button-secondary button-danger`) for secondary destructive actions such as Remove and Delete, with the existing confirmation pattern where required.
- **Text/link:** Navigation and low-priority actions should read as links, not competing primary buttons.

Give controls consistent height, padding, border, radius, hover, pending, disabled, and keyboard-focus states. Use specific action labels that state the result. Preserve distinctions between different product operations such as cancel, archive, remove, restore, and void.

### Tabs, filters, and list scrolling

Use compact underlined tabs with a clear blue selected state and `aria-current` where applicable. Keep filters grouped horizontally above their results (`ListFilterBar`) with visible labels, aligned controls, automatic submission on filter changes (`ListFilterAutoSubmit`), removable active filter chips, and a `Clear` control when filters are active. Preserve URL-backed filters and return context.

List and detail pages render their matching records directly with natural document scrolling—avoid in-page sub-tabs and in-page detail pagination, and keep controls outside nested scrolling containers.

## Data presentation

### Tables, cards, and rankings

Use tables for Events, Tasks, Points ranking, and Point History; use the cards-only directory layout (without profile pictures or avatars) for Officers. Align tables and card grids to the shared content edge with quiet headers, clear row separators, readable cell spacing, stable numeric alignment, and restrained hover. Let long values wrap; use the named, keyboard-focusable table overflow fallback only when needed.

Use badges for real state or category, not ordinary metadata. Status and catalog badges share the same compact pill geometry; configured Branch, Event Type, and Task Type colors vary only the badge's text, border, and tint. Other profile details remain neutral. Points ranking emphasizes rank (with top-3 accents), Officer, instant search filtering, and total points; Point History summarizes the filtered transaction count and filtered net points. Use progress bars only when they represent an actual measured completion ratio.

### Dates and times

Use the existing helpers in `lib/presentation.ts` for human-readable display. Event schedules use the application's El Paso time zone (`America/Denver`); SQL date-only values must not shift across time zones. Pair absolute dates with concise relative cues (`Today`, `Tomorrow`, `In N days`) and a live indicator dot for happening Events where helpful. Time Slot editors show 12-hour formatted time labels and live point previews. Do not introduce raw timestamps, seconds, or repeated time-zone labels without a clear need. Calendar opens at today for the current period and remains anchored within an explicitly selected historical period.

## Forms, dialogs, and popups

Create/edit Event, Task, and Officer forms share the same centered form grid, bordered `rounded-lg` fieldsets, blue-tinted legends, label spacing, error placement, and action row. Group fields by purpose. Do not wrap a form in an extra card when its fieldsets already provide the needed grouping.

Keep labels visible and connected to controls. Place validation next to the relevant field and retain error descriptions. Preserve pending text and disabled states without changing control geometry. Reuse the shared dialog surface, title, description, field, and footer patterns. Popups (`SearchableSelect`, `TaskEventCombobox`, `EventLocationAutocomplete`) use `rounded-lg` containers and `rounded-md` options, keep inner clear/chip-remove controls borderless inside the input shell, stay visually connected to their triggers, and remain keyboard-operable. Multi-officer pickers (`SearchableOfficerChecklist`) support live search and select-by-branch chips.

In the shared Resource links editor, quick-add presets (`+ Slides`, `+ Meeting notes`, `+ Documentation`) prefill the label and move focus into the URL input; `Add link` moves focus into the label input; removing a row moves focus to the next row, then the previous row, or `Add link` when none remain. Give rows stable identities so removing one does not change another row's values or focus. Associate resource validation with the group and its controls, announce the error, and let keyboard users reach and correct the affected fields.

## Feedback and interface states

Use semantic success, info, warning, danger, and neutral tokens for toast (`ToastRegion`), form, and inline feedback. Mutation controls emit concise bottom-right lifecycle toasts (auto-dismissing with hover-pause and manual dismiss) alongside inline error feedback. State copy must explain what happened or what needs attention. Keep loading/pending (including route loading skeletons), error, empty, filtered-zero, success, disabled, and historical read-only (`HistoricalPeriodBanner`) states explicit. Do not invent success or real-time claims.

## Accessibility and interaction

Use semantic headings, landmarks, tables, labels, fieldsets, buttons, and status regions. Preserve accessible names, error descriptions, and safe return navigation. Every interactive control must work by keyboard and show the shared blue focus ring. Maintain readable contrast in both themes, browser zoom, and long-content cases. Do not rely on color alone for selection or state.
