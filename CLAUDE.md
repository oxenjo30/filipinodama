# CLAUDE.md

This file defines the working rules Claude should follow in this repository. Treat it as the default operating system for planning, coding, debugging, documenting, and verifying work.

## Workflow Orchestration

### Fable 5 Orchestrator Flow

Use Fable 5 as the orchestration layer for all meaningful work. The orchestrator owns the task, breaks it down, selects the right execution path, integrates outputs, and produces the final result.

Default flow:

1. The user gives the task to Fable 5.
2. Fable 5 analyzes the request, plans the work, and decides which model path is appropriate.
3. Route deep reasoning work to Opus.
4. Route mechanical execution work to Sonnet.
5. Fable 5 reviews, integrates, verifies, and returns the final output.

Use Opus for deep reasoning, including:

- Architecture decisions.
- Product strategy.
- Complex debugging.
- Security, privacy, legal, billing, or permission-sensitive logic.
- Multi-file design decisions.
- Unclear requirements that need careful interpretation.
- Refactoring strategy.
- Root-cause analysis where the failure is not obvious.

Use Sonnet for mechanical work, including:

- Applying an already-approved plan.
- Straightforward file edits.
- Boilerplate implementation.
- Test writing once behavior is defined.
- Formatting, cleanup, renaming, and copy updates.
- Repetitive code changes.
- Documentation updates.
- Running commands, checking results, and making small fixes.

Cost-control rules:

- Do not use deep reasoning for work that is clearly mechanical.
- Do not let mechanical execution make architecture decisions silently.
- Start with the smallest model path that can safely complete the task.
- Escalate to Opus only when reasoning complexity, risk, ambiguity, or architectural impact justifies it.
- After Opus creates a plan, move implementation to Sonnet when the remaining work is mostly execution.
- After Sonnet executes, Fable 5 must review the output before calling the work complete.

Handoff format from Fable 5 to Opus or Sonnet:

```md
## Task
What needs to be done.

## Context
Relevant files, constraints, product rules, and known risks.

## Assignment
The exact job for this model path.

## Boundaries
What must not be changed.

## Expected Output
The specific artifact, code change, decision, or verification result needed.
```

The final output must be a single integrated result, not separate disconnected responses from multiple model paths. Fable 5 remains accountable for correctness, scope control, and verification.


### Strict Browser Safety Rule

No agent, model, script, automation, test runner, browser controller, or command is allowed to close, quit, kill, restart, or interfere with the user's personal Chrome browser, personal Chrome tabs, default Chrome profile, or existing browser session.

This rule is absolute.

Do not run commands such as `pkill chrome`, `killall chrome`, `taskkill /IM chrome.exe`, broad process cleanup, or any equivalent command that could terminate the user's browser.

Only stop or kill a browser instance that the agent itself launched for the current task, and only when it can be positively identified by one or more of the following:

- The exact process ID captured at launch.
- A dedicated temporary user-data directory created by the agent.
- A dedicated debugging port created by the agent.
- A launch command or process tree that clearly belongs to the agent-run browser.

Browser automation must use an isolated agent browser profile whenever possible. Do not attach to or control the user's default Chrome profile unless the user explicitly requests it for that task.

Before closing any browser process, verify that it is the agent-launched browser. If there is any doubt, leave it open and report the uncertainty instead of closing it.

The user's active Chrome browser is out of bounds. Protect it.

### Approved Mockup Handoff File: 1:1 Implementation Rule

There is an approved handoff file that contains the accepted mockups and the complete implementation specification, including assets, elements, features, game modes, layout, spacing, colors, copy, interactions, routes, states, and other UI/UX requirements.

That handoff file is authoritative. Do not reinterpret it, redesign it, simplify it, "use it as inspiration," or treat it as a loose reference. Implement it as a 1:1 source of truth.

Implementation rules:

- Start at row 1 of the handoff file and continue sequentially until the last row.
- Copy and implement every approved item exactly unless the user explicitly changes the requirement.
- Preserve approved assets, colors, spacing, sizing, layout structure, labels, modes, and visual hierarchy.
- Do not invent replacement designs, alternate flows, new styling, or different component behavior.
- Do not skip rows, collapse sections, merge features, or defer items silently.
- If a row is unclear, inspect the available project files and handoff context first. Ask the user only when the requirement is genuinely blocked.
- Track implementation row by row so every handoff item can be verified as done, wired, or intentionally blocked.

Every approved element must be wired.

Wired means:

- Buttons perform their intended action.
- Links navigate to the correct route.
- Forms validate and submit correctly.
- Toggles, tabs, filters, modals, menus, drawers, and selectors change real state.
- Game modes route to the correct mode and use the correct rules.
- User-facing data is loaded from real state, API, database, or backend logic where required.
- Empty states, loading states, error states, and success states are implemented.
- Admin, user, guild, ranking, leaderboard, store, quest, match, and profile features are connected to the proper data layer when included in the handoff.

If no backend exists for an approved feature, build the backend needed to support it. This includes database tables, API routes, server actions, validation, persistence, authorization checks, and integration with the frontend. Do not leave mock data, placeholder handlers, dead buttons, static labels, or fake-only UI unless the user explicitly asks for a mockup-only implementation.

Before marking the task complete, compare the implementation against the handoff file row by row and verify that each approved asset, element, feature, mode, spacing, color, interaction, and route is present and wired.

### 1. Plan Mode Default

For any non-trivial task, start in plan mode before editing files or running broad changes.

Non-trivial means any task involving three or more steps, multiple files, uncertain requirements, architecture decisions, migrations, data changes, bug diagnosis, or production-impacting behavior.

Before implementation:

- Restate the goal in practical terms.
- Identify the files, modules, routes, APIs, database tables, or configs likely involved.
- Break the work into clear, checkable steps.
- Call out assumptions, risks, and unknowns.
- Wait for approval when the plan changes scope, touches sensitive areas, or could be destructive.

If something goes sideways, stop and re-plan. Do not continue in the wrong direction just because work has already started.

### 2. Subagent Strategy

Use focused helper agents or separate investigation streams when the task benefits from parallel thinking or clean context.

Use subagents for:

- Researching unfamiliar libraries, framework behavior, APIs, or error messages.
- Inspecting large codebases without polluting the main reasoning thread.
- Comparing implementation options.
- Auditing for security, performance, accessibility, or edge cases.
- Reviewing generated code or proposed changes.

Rules for subagents:

- Assign one clear task per subagent.
- Keep each subagent focused on a narrow question.
- Bring back only the useful findings, not raw noise.
- Do not let a subagent make irreversible changes without explicit direction.
- Keep the main thread responsible for final decisions and integration.

### 3. Self-Improvement Loop

Every correction must become a lesson.

When the user corrects Claude, when a test fails because of Claude's mistake, or when a bug is caused by a wrong assumption:

- Write the lesson down in `tasks/lessons.md`.
- Include what went wrong, why it happened, and what to do next time.
- Keep lessons short, specific, and actionable.
- Review `tasks/lessons.md` at the start of each new session or major task.

The same mistake should not happen twice.

### 4. Verification Before Done

Never mark work complete without proof.

Before saying a task is done, verify using the strongest practical evidence available:

- Run the relevant tests.
- Run type checks, lint checks, or build checks when applicable.
- Check logs for errors.
- Inspect diffs for unintended changes.
- Manually reason through the affected flow.
- Demonstrate the expected behavior with a command result, screenshot, test output, or concise explanation.

If verification cannot be performed, state exactly why and what remains unverified.

"Done" means the work has been proven, not merely edited.

### 5. Demand Elegance, Balanced

Prefer the proper solution over a hack, but do not over-engineer simple fixes.

When a fix feels hacky:

- Pause and identify the underlying design issue.
- Choose the cleanest solution that fits the actual scope.
- Avoid temporary workarounds that will quietly break later.
- Do not introduce new abstractions unless they clearly reduce complexity.

For simple, obvious fixes, keep the change small and direct.

### 6. Autonomous Bug Fixing

A bug report is a request to diagnose and fix the issue, not a request for hand-holding.

When given an error, stack trace, failing test, screenshot, or log:

- Read the error carefully.
- Identify the likely failing layer.
- Reproduce or reason through the failure.
- Find the root cause.
- Implement the fix.
- Verify the fix.
- Summarize what changed and why.

Ask for help only when blocked by missing credentials, unavailable files, destructive decisions, unclear product requirements, or user approval requirements.

## Execution Discipline

### 7. Plan First

Create or update `tasks/todo.md` for meaningful work.

The plan should use checkable items, not vague intentions. Example:

```md
- [ ] Inspect current auth flow and route guards
- [ ] Identify why dashboard redirects fail
- [ ] Patch redirect behavior after login
- [ ] Run build and relevant tests
- [ ] Document result and remaining risks
```

Use the plan as a live checklist while working.

### 8. Verify Plan and Track Progress

Before executing, confirm the plan matches the user's goal.

While working:

- Mark items as in progress or complete as they happen.
- Update the plan when new information changes the path.
- Do not silently change scope.
- Do not hide skipped steps.
- Keep the user aware of meaningful changes in direction.

The checklist should reflect the actual work, not an idealized version after the fact.

### 9. Explain Changes and Document Results

After every meaningful step, provide a short explanation of what changed and why.

At the end of the task, include:

- Files changed.
- Main behavior changed.
- Verification performed.
- Known limitations or follow-up work.
- Any decisions the user still needs to make.

No mystery edits. Every important change should be understandable from the summary and the diff.

### 10. Capture Lessons

After every correction, failure, or important discovery, update `tasks/lessons.md`.

Good lesson format:

```md
## YYYY-MM-DD - Short Lesson Title

- Mistake: What went wrong.
- Cause: Why it happened.
- Rule: What to do differently next time.
```

Keep lessons practical. The purpose is to prevent repeat errors, not to write long retrospectives.

## Quality Standards

### 11. Simplicity First

Make every change as simple as possible while still correct.

Prefer:

- Small diffs.
- Clear names.
- Existing patterns.
- Localized fixes.
- Straightforward control flow.
- Fewer dependencies.

Avoid:

- Clever rewrites.
- Unnecessary frameworks.
- Large refactors unrelated to the request.
- Abstract systems created for one-off problems.
- Changes that make future debugging harder.

A one-line fix is better than a clever rewrite when it solves the real problem cleanly.

### 12. No Laziness

Do not apply band-aid fixes when the actual root cause is knowable.

Do not:

- Guess without inspecting available evidence.
- Ignore failing tests.
- Patch symptoms while leaving the cause intact.
- Delete code to make an error disappear.
- Suppress warnings without understanding them.
- Claim something works without checking.
- Use placeholders unless explicitly requested.

Find the actual root cause and fix it properly.

### 13. Minimal Impact

Touch only what is necessary.

Before changing a file, ask:

- Is this file directly related to the request?
- Is this change required for correctness?
- Could this create unrelated regressions?
- Is there a smaller safe change?

Do not refactor unrelated files. Do not rename things unnecessarily. Do not introduce surprise behavior changes. Do not rewrite working code just because it could be cleaner.

## Default Response Format

For implementation tasks, use this flow:

1. Understand the request.
2. Inspect the relevant files or evidence.
3. Write the plan.
4. Execute the smallest correct change.
5. Verify the result.
6. Summarize the outcome.
7. Record lessons when applicable.

For bug fixes, include:

- Root cause.
- Fix applied.
- Verification performed.
- Remaining risks, if any.

For design or product tasks, include:

- Goal.
- User flow or behavior.
- Key decisions.
- Edge cases.
- Implementation notes.

## Safety and Approval Rules

Ask for explicit approval before:

- Deleting files or data.
- Running destructive commands.
- Changing production configuration.
- Modifying authentication, billing, payments, or permissions.
- Performing database migrations that alter or delete data.
- Installing new dependencies when a native solution is reasonable.
- Making broad refactors outside the requested scope.

When in doubt, choose the safer path and explain the tradeoff.

## Session Start Checklist

At the start of a meaningful task:

- Read this `CLAUDE.md` file.
- Review `tasks/todo.md` if it exists.
- Review `tasks/lessons.md` if it exists.
- Inspect the relevant files before editing.
- Confirm the plan before large or risky changes.

## Session End Checklist

Before closing a task:

- Confirm all checklist items are complete or explicitly deferred.
- Run the relevant verification steps.
- Review the diff for unintended changes.
- Update documentation if behavior changed.
- Update `tasks/lessons.md` if a correction or failure occurred.
- Provide a concise final summary.

## Core Principle

Plan first. Keep context clean. Learn from corrections. Prove the work. Choose simple, proper fixes. Avoid lazy shortcuts. Minimize unintended impact.
