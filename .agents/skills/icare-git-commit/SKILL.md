---
name: icare-git-commit
description: Prepare iCare Git commit titles and body descriptions using project Conventional Commit rules. Use when drafting a commit message, reviewing staged changes, or making an authorized commit for features, fixes, or maintenance.
---

# iCare Git commit messages

Read the repository's `AGENTS.md`. Base the message on the actual diff and validation results. Draft the message when requested; perform a commit only when committing is within the user's authorized task. Loading this skill alone grants no Git mutation authority.

## Title

Use `<type>(<scope>): <imperative summary>`.

- Types: `feat` for a new capability; `fix` for a defect; `refactor` for restructuring without behavior changes; `docs` for documentation; `test` for tests; `chore` for tooling/maintenance; `perf` for performance; `build` for build/dependency changes; `ci` for CI changes; `style` for formatting only; `revert` for reverting a change.
- Prefer the module scope used in the branch: `auth`, `access`, `centers`, `dealers`, `center-users`, `activity`, `reports`, `status`, `alerts`, `ui`, `db`, or `git`. Omit scope for a genuinely project-wide change; choose a new concise scope when appropriate.
- Aim for at most 72 characters, including the prefix. Start the summary with a lowercase imperative verb such as `add`, `prevent`, `preserve`, or `document`, and omit the final period.
- Describe the delivered outcome. Avoid titles such as `update code`, `fix bugs`, `WIP`, or `misc changes`. Select the type by the primary purpose; a bug fix with regression tests is still `fix`.
- For a breaking contract change, use `<type>(<scope>)!: <summary>` and a `BREAKING CHANGE:` footer describing the impact and required migration. Do not mark ordinary internal refactoring as breaking.

Examples: `feat(reports): add period filters to activity exports`, `fix(status): reject stale activation updates`, `chore(git): add project branch and commit skills`.

## Description

Separate the title and body with a blank line. Use the following labels with brief prose or bullets, scaling detail to the change:

```text
<type>(<scope>): <imperative summary>

Why:
<Concrete problem or user need. For fixes, name the trigger and failure.>

Changes:
- <Resulting behavior and any important implementation decision.>

Validation:
- <Actual command/check and its result, or checks not run and why.>
```

Add `Risks:` only when there are material remaining limitations, rollout steps, or compatibility concerns. Add `Refs: <issue>` when a real reference is provided; use `Closes: <issue>` only when the commit fully resolves it. Keep footers after a blank line at the end. Never invent checks, issue references, or completion claims.

For feature work, explain what becomes available and relevant access/scope limits. For fixes, explain the before/after behavior and regression evidence. Keep secrets, connection details, credentials, and child/parent PII out of messages. Describe pending iCare integrations accurately; demo checks do not establish live acceptance.

## Prepare an authorized commit

- Inspect `git status --short`, `git diff`, and `git diff --cached` first. Identify the task's changes, including partial-file changes, before staging. A pre-existing index may contain another task's work.
- Keep each commit focused on one outcome, including its tests and documentation. Stage explicit paths or selected hunks; avoid blanket staging in a dirty workspace. Review the complete staged diff before committing. If unrelated changes are already staged, preserve them and isolate this task's commit safely; do not silently unstage or commit them.
- Follow `AGENTS.md` and the relevant module chapter for validation. Behavioral changes require the relevant domain/security tests and build; affected flows need desktop/mobile checks. Documentation/skill-only changes need appropriate document/skill checks, without an application build unless runtime behavior also changes. Report checks honestly in the body.
- Run `git diff --cached --check`. Verify that staged files exclude private environment files, stores, credentials, and generated private data. Do not bypass repository hooks to force a commit through.
- Pass multiline messages through a temporary file with `git commit --file <path>` or a structured tool argument. Avoid shell interpolation of message text.
- After committing, verify the resulting commit and remaining worktree state. Report the hash, title, validation, and any remaining task changes. Do not amend, rebase, push, or merge merely to enforce this format; those actions need their own task authorization.
