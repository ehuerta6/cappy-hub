---
name: issue-flow
description: Plan open GitHub Issues into dependency-aware execution batches, generate prompts for selected batches, and update plans as repository state changes.
---

# Issue flow

Use this skill to plan implementation across existing GitHub Issues and prepare an execution prompt for a selected batch. It works across repositories and coding agents.

For Cappy Hub, follow `AGENTS.md`, `docs/contributing.md`, `docs/development-workflow.md`, and `docs/pull-requests.md`. Product and database source precedence remains the one defined in `AGENTS.md`; Issue batching does not approve product behavior or override Issue scope.

It does not create or change issues, implement work, open pull requests, or merge changes. Those actions require a separate request.

Recognize requests such as “Arma un flow”, “plan the open issues”, “update the flow”, or “Orchestrator for Batch 2”. Respond in the user's language.

## Choose a mode

- **Plan**: inspect relevant open issues and arrange the work into practical batches.
- **Orchestrate**: produce a self-contained implementation prompt for a selected batch.
- **Replan**: update an existing plan after issues, pull requests, or implementation results change.

## Plan

### 1. Gather current evidence

Use GitHub as the source of truth. Inspect all relevant open issues, including their full descriptions, acceptance criteria, labels, milestones, comments, linked issues, and linked pull requests. Follow pagination when the issue list is paginated.

Also check, when relevant:

- repository instructions and contribution workflow;
- existing branches and active pull requests that could satisfy or block work;
- code, tests, or shared interfaces needed to verify dependencies and change overlap.

Do not scan unrelated code when issue metadata already answers the question. Do not use issue numbers as priority or ordering.

If GitHub state or repository context is unavailable, say what could not be checked and ask for the missing access or links. Do not present an incomplete review as a complete plan.

### 2. Analyze dependencies and overlap

For each proposed relationship, label it:

- **Confirmed** when the issue or repository explicitly establishes it.
- **Inferred** when code, architecture, or acceptance criteria show a likely technical prerequisite or shared change surface.

Explain the evidence for inferred relationships. Do not turn preferred ordering into a blocker.

Identify completed or already-satisfied work, external blockers, shared prerequisites, likely file or interface conflicts, and integration risks. Consider both implementation overlap and conflicts that may appear when parallel pull requests are integrated.

### 3. Build practical batches

Group work into the fewest useful batches without hiding real gates. Batch numbering describes execution order, not issue priority.

For each batch include:

- objective and issue numbers with short scopes;
- dependencies and whether they are confirmed or inferred;
- which work can run in parallel and what should run sequentially;
- likely overlap or integration conflicts and why;
- merge gates and verification requirements drawn from repository policy;
- what must be true before the next batch starts.

Prefer a small number of independent workstreams. Use separate implementers only when the work is genuinely independent and the environment supports them. Serialize overlapping edits or define an integration checkpoint. If parallel agents are unavailable or add overhead, give a sequential strategy.

### 4. Present the plan

Start with a brief summary: issues considered, number of batches, main dependencies, useful parallel work, and blockers.

For each batch use a compact table:

| Issue | Scope | Dependencies | Execution | Conflict risk |
| ----- | ----- | ------------ | --------- | ------------- |

Then state the execution strategy, merge gate, and next-batch prerequisites. End with the order of batches and the workstreams that can run concurrently.

Return plans and execution prompts in the conversation. Do not create repository plan documents; keep active scope, status, and dependencies in GitHub Issues and Pull Requests. Do not modify issues to create a plan.

## Orchestrate

When asked for an orchestrator or execution prompt for a batch:

1. Recover the latest plan from the conversation.
2. Confirm the requested batch and its issue list.
3. Refresh issue, branch, pull request, and merge state from GitHub.
4. Compare current state with the plan. Exclude completed or already-satisfied issues and revise dependencies or workstreams affected by changes.
5. Read current repository instructions, relevant code context, and the actual verification and delivery commands.

If the earlier plan is unavailable, reconstruct it from current repository and issue evidence. Do not invent decisions or assume old issues remain open, prerequisites are merged, or checks exist.

Generate one copy-paste-ready prompt for the selected batch. It must stand alone and include:

### Context

- repository and target branch;
- batch objective and selected issue numbers;
- current status of each issue and any prerequisite pull requests;
- relevant confirmed decisions, inferred constraints, and repository instructions.

### Execution strategy

State what is sequential and what may run in parallel, with a reason. Assign distinct ownership when multiple implementers help. Identify shared files or interfaces, coordination points, and how completed work will be integrated.

Use subagents, worktrees, or independent branches only when supported and useful. Include a sequential fallback when parallel execution is unavailable.

### Implementation and verification

Require implementers to read project instructions, inspect affected code, follow issue scope and acceptance criteria, reuse project conventions, and avoid unrelated refactoring.

Derive checks from the repository. Name only commands and manual checks that exist or were verified. Require each acceptance criterion to be checked and each result to be reported as passed, failed, skipped, or unavailable.

### Delivery and report

Follow the target repository's branch, commit, and pull request rules. Respect dependency-aware merge order and gates. Do not assume direct commits to `main`, permission to merge, or authorization to deploy. Keep implementers at the repository's expected review boundary.

Require a final report with completed issues, pull requests and their status, verification results, blockers, deviations, remaining work, and whether the next batch is ready.

Generating a prompt does not execute it. Do not change GitHub state while planning or preparing the prompt.

## Replan

When asked to update a plan:

1. Refresh relevant issue and pull request state.
2. Preserve completed work and valid decisions.
3. Reevaluate only dependencies, batches, or gates affected by the changes.
4. Update the remaining plan and explain meaningful differences.

Do not rebuild an unaffected plan from scratch. Plans describe current evidence and can change as implementation reveals new dependencies.

## Boundaries

- `to-issues` turns an approved spec into GitHub Issues; this skill plans implementation from existing issues.
- `implement-issue` handles one issue; this skill coordinates dependencies across issues.
- This skill prepares a self-contained execution prompt but does not dispatch agents or execute work; use the repository's approved implementation workflow for each Issue.
- `retro` evaluates completed work and records lessons when useful.

This is an optional workflow, not a required pipeline. Skip any step that does not help the task.
