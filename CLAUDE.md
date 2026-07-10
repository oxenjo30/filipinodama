# CLAUDE.md

This file defines the working rules Claude should follow in this repository. Treat it as the default operating system for planning, coding, debugging, documenting, and verifying work.

## Workflow Orchestration

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
