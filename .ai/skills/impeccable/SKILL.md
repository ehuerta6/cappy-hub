---
name: impeccable
description: Design, critique, audit, and refine production frontend UI and UX with strong hierarchy, accessibility, responsive behavior, clear states, and deliberate visual decisions.
metadata:
  adapted_from:
    - pbakaus/impeccable
---

# Impeccable

Use this skill for frontend design and UX work.

Applicable tasks include:

- designing a new interface;
- shaping a feature before implementation;
- reviewing an existing UI;
- improving visual hierarchy;
- fixing layout and spacing;
- improving responsive behavior;
- accessibility review;
- hardening empty, loading, error, and edge states;
- reducing visual noise;
- adding personality without sacrificing usability;
- final UI polish.

The product brief and existing project design decisions outrank generic design preferences.

## First classify the task

### Shape

Use when behavior, hierarchy, navigation, layout, or interaction still needs to be decided before implementation.

### Critique

Use when reviewing an existing interface and identifying UX or visual problems.

### Audit

Use for technical interface quality:

- accessibility;
- responsiveness;
- semantics;
- keyboard interaction;
- touch targets;
- overflow;
- performance-related UI problems.

### Polish

Use when the interface is already correct and needs a bounded final refinement.

### Harden

Use when the main design exists but real product states are incomplete.

### Adapt

Use when the interface needs to work well across viewport sizes, input methods, themes, or device classes.

These modes may be combined when the task genuinely spans them.

## Process

### 1. Load product context

Before changing the UI, understand:

- what the product does;
- who uses this surface;
- the user's primary task;
- existing product requirements;
- current design conventions;
- accepted visual direction;
- relevant constraints.

Do not invent a new design system when an established one already exists.

### 2. Inspect the current interface

When refining existing work, inspect the real implementation or rendered UI.

Look at:

- hierarchy;
- layout;
- spacing;
- typography;
- component consistency;
- states;
- interaction;
- responsiveness;
- accessibility;
- visual noise;
- unused space;
- density.

Preserve intentional existing identity unless the user asked for a redesign.

### 3. Define the surface's job

Ask what successful use looks like.

Common modes:

- **Operate:** complete a task efficiently.
- **Read:** understand information.
- **Persuade:** decide and act.
- **Experience:** explore or appreciate the content itself.

Optimize the surface for that job.

Do not apply landing-page aesthetics to a dense admin tool merely because they look more impressive.

### 4. Establish hierarchy

Make clear:

- what the user should notice first;
- what action is primary;
- what information is secondary;
- what can be visually quieter;
- which elements belong together.

Use layout before decoration.

Use spacing, typography, alignment, grouping, and contrast deliberately.

### 5. Design real states

Account for applicable states:

- loading;
- empty;
- unavailable;
- disabled;
- selected;
- active;
- success;
- error;
- partial data;
- long content;
- overflow;
- destructive confirmation;
- permission restrictions.

Do not leave fake controls or dead interactions that imply unsupported behavior.

### 6. Accessibility

Use semantic elements and native controls where practical.

Check:

- keyboard access;
- visible focus;
- labels;
- form errors;
- heading order;
- color contrast;
- touch target size;
- motion sensitivity;
- information not conveyed by color alone.

### 7. Responsive behavior

Do not merely shrink the desktop layout.

Decide what should:

- wrap;
- stack;
- scroll;
- collapse;
- remain fixed;
- change priority;
- disappear only when genuinely nonessential.

Protect important actions and readable content at smaller sizes.

### 8. Refine visual craft

Avoid default AI-generated UI patterns unless they genuinely fit the product.

Watch for:

- excessive cards;
- unnecessary gradients;
- arbitrary rounded containers;
- giant empty hero space;
- decorative glow;
- excessive badges;
- repeated icon-label patterns;
- inconsistent spacing;
- generic dashboard layouts copied without regard to the workflow.

A simple interface can still be deliberate.

### 9. Verify in bounded passes

When implementation tools allow rendered inspection:

1. build the complete intended change;
2. inspect relevant desktop and smaller-screen states;
3. collect problems into one batch;
4. fix the batch;
5. perform one final confirmation pass.

Do not enter an endless polish loop.

## Refinement vs redesign

### Refinement

Preserve:

- identity;
- content;
- behavior;
- information architecture outside scope.

Improve execution.

### Redesign

Preserve product truth and functional requirements, but allow the visual system or information architecture to change.

Do not accidentally redesign when the user asked for polish.

## Rules

- The brief wins.
- Product usability outranks decoration.
- Design the interaction before styling when behavior is unclear.
- Prefer deliberate hierarchy over visual busyness.
- Reuse existing components and tokens when suitable.
- Do not introduce new dependencies for trivial visual problems.
- Avoid unsupported factual or marketing copy.
- Do not sacrifice accessibility for aesthetics.
- Do not keep polishing after the important problems are resolved.

## Completion

UI work is complete when:

- the primary task is obvious;
- hierarchy is intentional;
- relevant states are handled;
- keyboard and semantic basics are sound;
- important viewport sizes remain usable;
- styling is internally consistent;
- the rendered result has been inspected when possible;
- no major design problem remains within the requested scope.
