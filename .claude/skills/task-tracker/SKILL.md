---
name: task-tracker
description: Manage work continuity in a repository - start, continue or resume a task, report status and next steps, save progress, prepare or consume a handoff, close a session, and keep parallel agents from clobbering each other. Use for substantial work that spans sessions or agents; do not run the full session ritual for a small question or a read-only lookup.
---

# Task Tracker

## How to read this skill

Always in force: `Source priority` — without it an agent trusts stale prose
over code; `Git safety` — it applies from the first edit, alone or in
parallel.

Conditional: `Project profile` — first use in a repository, or when the
defaults visibly do not match its layout; `Starting work` and
`Context routing` — starting or resuming a session; `Working memory
boundaries` and `Saving progress` — a request to save progress or prepare a
handoff; `Parallel work` — several branches, worktrees or agents;
`Escalation` — silent until one of its listed triggers fires, and the
procedure lives in [references/escalation.md](references/escalation.md).

## Source priority

When sources disagree, trust them in this order:

1. The user's current request.
2. Current code, `git status`, Git history, and the results of checks that
   actually ran.
3. The active branch task file (see `Project profile`).
4. The project's operational handoff document — cross-task deployed state,
   external blockers, approval gates.
5. The project's durable architecture document(s) and ADRs.
6. The project's milestones document.
7. Product docs and other prose.

Never treat a stale statement in documentation as more reliable than current
code or verifiable repository state. Roles 4–6 exist only where the project
declares such documents; a missing role is dormant, not a gap to fill.

## Project profile

This skill names document *roles*; each consuming repository maps roles to
its own files in its root `AGENTS.md` or equivalent. Defaults apply when the
project declares nothing:

| Role | Default |
| --- | --- |
| Task directory | `docs/agent-tasks/active/`, archive in `docs/agent-tasks/archive/` |
| Task template | The project's own template if it has one, else [references/task-template.md](references/task-template.md) |
| Operational handoff | none — dormant unless declared |
| Architecture document | none — dormant unless declared |
| Milestones document | none — dormant unless declared |
| Context command | none — reproduce the read-only Git checks in `Starting work` |

Do not invent global documents for a project that has not declared them, and
do not scatter session details into project docs whose role you are guessing.

## Git safety

- Never reset, clean, checkout over, discard, rebase, force-push or amend
  another agent's or the user's work without an explicit user request. This
  applies when working alone: unrelated uncommitted changes appear in a
  worktree even with a single agent. Preserve them.
- Treat databases and other stateful stores as holding data someone needs
  unless the project explicitly declares them disposable.
- Commit and push only within the authority the user or project has granted;
  when unstated, propose the command instead of running it.
- Never store secrets, credentials, chat transcripts, hidden reasoning or
  private AI session URLs in repository files.

## Starting work

1. Find the repository root via `git rev-parse --show-toplevel` and the
   current branch via Git.
2. Run the project's context command if its profile declares one; otherwise
   check `git status --short`, the full current diff, recent commits, and the
   locally available upstream/remote state.
3. Build the task-file path by replacing every `/` in the branch name with
   `--`: `<task directory>/<branch-name>.md`.
4. Read the task file if it exists. If the user is starting a new substantial
   task and there is none, create it from the task template. Do not create a
   task file for a small question, a read-only explanation or a casual doc
   lookup.
5. Load only the project documents and sections the task needs
   (`Context routing`). Search headings first; do not read a long global
   document end-to-end unless the task requires all of its content.
6. Continue from the task file's `Next concrete step`. Do not reopen recorded
   decisions without concrete contradicting evidence, and work in small
   verifiable increments from the first edit, not only at delivery time.
7. If there is no task file and the user only said "continue", propose the
   nearest safe unblocked step visible from the project's global context.
8. Ask a question only for a required product decision, an external
   dependency, or an approval gate the project defines.

## Context routing

Route by task class, not by reading everything: the project's own skills and
`AGENTS.md` own the concrete map from task class to documents. Two rules
travel with this skill:

- Load the operational-handoff role when the task class is deployment,
  migrations, environment configuration, or work that depends on external
  state. The condition is the class of task, not "does it touch a blocker":
  whether a blocker exists is exactly what the diff cannot show.
- When work shifts from status and handoff to implementation, read and follow
  the project's implementation skill(s) before editing product code.

## Working memory boundaries

- The active task file owns the current implementation state of one branch.
  It is a snapshot, not an append-only session log: when updating, replace
  stale state, drop details that no longer matter, and reference commits or
  files instead of pasting diffs. Past roughly 12 KB, compress finished
  history to short summaries before handoff.
- Global role documents — operational handoff, architecture, milestones —
  change only when the state they own changes. Ordinary session details never
  go there.

## Saving progress

Do not update memory files automatically after every step. Save when the user
asks, or when a handoff is part of the task:

1. Inspect the full diff, `git status`, recent commits and upstream state.
2. Select and run checks via the project's verification rules — the
   [verification](../verification/SKILL.md) skill when this collection is
   present, or whatever the project defines. Record only checks that actually
   ran.
3. Update the active task file first: completed, in-progress and remaining
   work, decisions, assumptions, failed approaches, risks, approval gates and
   verification evidence.
4. Leave exactly one clear `Next concrete step`. Record the current HEAD and
   the exact committed, staged, unstaged and untracked state; do not call the
   worktree clean without checking.
5. Update a global role document only if the state it owns changed.
6. State the handoff's visibility boundary explicitly: uncommitted state is
   visible only in the same worktree; another worktree sees the work once a
   commit exists on the branch; another clone or machine only after the
   branch is pushed. Do not claim a wider boundary than the state has
   reached, and do not commit or push beyond granted authority.
7. Propose a commit message only when a real diff exists.

## Parallel work

- One independently deliverable task uses one branch and one task file.
- Two agents never edit the same worktree concurrently. Parallel work uses
  separate worktrees or checkouts, separate branches and separate task files.
- Before continuing, check local and locally available remote/upstream state.
- Before handing over uncommitted work, record in the task file exactly what
  is committed, staged, unstaged and untracked.

## Escalation

By default, continue with the current agent and model without discussing the
choice. Do not escalate because a task is large, an edit is local or
documentation-only, a test fix is clear, a refactor is mechanical, or a big
task is already split into verifiable steps.

Consider escalation only if:

- the change crosses several architectural or service boundaries, or requires
  tracing a large cross-service flow;
- privacy, auth, authorization, persistence, contracts, migrations or
  deployment safety is affected;
- repository evidence is contradictory, or two reasonable approaches have
  already failed;
- established context is being lost, or the remaining context or visible
  usage budget is not enough to implement and verify safely;
- an important architectural or security-sensitive diff needs an independent
  review.

The policy stays silent until a trigger fires. When one does, open
[references/escalation.md](references/escalation.md): it holds the procedure,
the output format and the task-file block. Never switch models automatically
and never assert a model's availability, superiority or remaining usage
without evidence from the client.
