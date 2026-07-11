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

## Agent Browser

**This is the #1 rule when using agent browser: avoid closing the actual Chrome browser of the user.**

The user's personal Chrome (and its open tabs/work) has been closed on them multiple times by browser-driving tools. It is highly disruptive and must never happen again. For ANY task that drives a browser — agentic browser, screenshots, e2e, web-perf, Chrome DevTools MCP, Playwright, Puppeteer, Selenium:

- NEVER close, quit, or kill the user's Chrome. NEVER run a process-name-wide kill like `taskkill //IM chrome.exe //F` or `pkill chrome` — it kills every Chrome on the machine, including the user's real browser and all their tabs (even a headless instance shares the `chrome.exe` image name, so a name-wide kill can't tell them apart).
- Launch automation ONLY in an ISOLATED instance: a separate temp `--user-data-dir`, a dedicated automation channel (Chrome for Testing / headless / a separate binary), or a different browser — never the user's default profile or running instance.
- On teardown, close only the automation's OWN pages/child process (capture the spawned child's PID and kill exactly that: `child.kill()` / `taskkill //PID <pid> //F`). Never a global "quit browser". If a tool's only teardown is "quit Chrome", use a tool/mode that doesn't, or leave it running.
- When spawning a subagent that will use a browser, put this constraint in its prompt explicitly.
- If isolation cannot be guaranteed, ASK the user before launching anything that drives their browser.

## Design Fidelity — Copy the Handoff Mockup Exactly

When the user says "copy the design fidelity" / "follow the approved handoff design" / "copy the mockup" for the admin console (and web), it means **reproduce the mockup 1:1 — NO reinvention or reinterpretation**, not a loose re-skin or "match the vibe."

Verbatim from the user: *"when I say copy the handoff mockup, all elements, assets, spaces, buttons, colors are to be copied. NO reinvention or reinterpretation of the mockup. You won't create your own design and use the mockup as reference."* The mockup is the SOURCE to reproduce, not a reference to riff on.

- **Ground truth:** `handoffv2/FilipinoDama Admin.dc.html` (approved, gitignored). Extract the exact `secXxx` section for the page AND the shared chrome (sidebar nav sections/labels/badges, top bar "VIEWING AS" role select + account chip, logo lockup). Worktree agents can't see the gitignored mockup — copy the extracted HTML/CSS into the worktree.
- **Copy as-is, every nesting level:** every element, field, control, label, badge, chip, and its exact placement — including inside panels/drawers/modals (avatar, tiles, styled list rows, button grids, footers). A re-skin that gets columns right but drops the VIEWING-AS dropdown, account chip, nav badge counts, per-tier rank colors, or a drawer's inner components is a FAIL. Audit element-by-element with a checklist, not a screenshot glance.
- **The ONLY sanctioned deviations:** no fabricated/fake data (use real values or an honest empty/deferred state), and the gold-only economy (no Diamonds top-up). Never ship a fabricated control or secret. Everything else copies exactly.
- **Verify by MEASURING rendered pixels, not by reading CSS.** Reading source values and asserting "it matches" has failed repeatedly — structural/layout bugs (a duplicated title header, a full-width topbar vs. centered `max-width:1240px` content misaligning on a 1920px screen, flex `margin`+`gap` stacking) are invisible in per-element value diffs and only show in the composed page. Render in a headless ISOLATED browser (Playwright from the pnpm store, imported via absolute `file://`; NEVER the user's Chrome — see Agent Browser) and assert edge/gap deltas with `getBoundingClientRect()`. ALWAYS measure at the user's real ~1920px width, not the mockup's ~1240px design width.
- **Sweep holistically, don't spot-patch** the one element the user screenshots — they mean every element/asset/space/button/color across all pages must match. Fidelity lives mostly in SHARED classes/layout (`index.css` `.main`/`.topbar`/`.tbl`/`.field`/`.chip`, the app shell) — fix the shared layer first; per-page inline values are the last mile.
- If the mockup's literal CSS looks wrong at the user's width, that's a DESIGN decision — ask, don't silently change or leave it. After pushing, remind the user to hard-refresh (Ctrl+Shift+R) — a stale cached bundle looks identical to "not fixed."
