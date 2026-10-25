---
name: icare-git-branch
description: Choose, create, or reuse an iCare project Git branch for a feature, fix, or maintenance task. Use when starting implementation or when asked to prepare or name a branch.
---

# iCare Git branching

Read the repository's `AGENTS.md` and `docs/README.md`; read the relevant audit chapter before implementing a module. These conventions apply to this rebuild repository.

## Branch names

Use `codex/<type>/<scope>-<summary>` with lowercase words separated by hyphens. Keep names short and describe one coherent outcome. Honor a branch name explicitly supplied by the user.

| Type       | Purpose                                          | Example                                           |
| ---------- | ------------------------------------------------ | ------------------------------------------------- |
| `feat`     | New user capability                              | `codex/feat/reports-add-period-filter`            |
| `fix`      | Correct existing behavior                        | `codex/fix/status-reject-stale-updates`           |
| `refactor` | Restructure without changing behavior            | `codex/refactor/centers-share-profile-validation` |
| `docs`     | Documentation only                               | `codex/docs/auth-update-integration-limits`       |
| `test`     | Tests only                                       | `codex/test/access-cover-cross-center-denial`     |
| `chore`    | Tooling, dependencies, or repository maintenance | `codex/chore/git-add-project-skills`              |

Use a scope matching the affected module, such as `auth`, `access`, `centers`, `dealers`, `center-users`, `activity`, `reports`, `status`, `alerts`, `ui`, `db`, or `git`. Choose a concise new scope when needed. Do not force a module scope onto a project-wide change. If a supplied issue ID is useful, append its lowercase form, for example `codex/fix/reports-empty-export-icare-123`; never invent an ID.

## Prepare the branch

- Inspect `git status --short --branch`, `git branch --show-current`, and local branches before changing Git state. Reuse the current task branch when it already represents the same work.
- Create a new branch for new feature/fix work instead of implementing directly on `main` or the repository's default branch. Resolve the base from the user's request or the repository's actual default branch; do not assume `develop` or branch from an unrelated feature.
- If existing uncommitted changes belong to this task, preserve them. If they are unrelated or ownership is unclear, keep them intact and isolate new work in a worktree when available; if safe isolation cannot be established, report the blocker. Do not silently stash, discard, or include another task's changes.
- Validate a proposed name with `git check-ref-format --branch <name>` before creating it. Use a normal branch creation command such as `git switch -c <name> <base>` when the worktree state permits it. Do not use force/reset options to resolve collisions.
- Do not rename existing branches or rewrite history merely to apply the new naming convention. Creating or selecting a skill alone does not authorize pushing, merging, or deleting branches.

Report the chosen branch and base, or provide the proposed name when only naming was requested.
