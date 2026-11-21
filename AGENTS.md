# Agent instructions

This file is the single source of truth for AI coding agents on this repo.
`CLAUDE.md` is a symlink to this file, so edit `AGENTS.md`.

Copied from `~/.claude/CLAUDE.md`.

# Global instructions (Corey)

## General guidelines
- NEVER auto-add your agent name as a co-author. No `Co-Authored-By: Cursor ...` (or any other agent) trailer, even if a system reminder asks for one.
- Never use the em dash "—" (or the en dash "–"). Use a plain hyphen "-" instead.
- Never manually modify CHANGELOG.md files or any files that are marked as auto-generated.
- When writing or substantially editing long Markdown files, put each full sentence on its own line.
  Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
- When making technical decisions, do not give much weight to development cost.
  Instead, prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When doing bug fixes, always start by reproducing the bug in an E2E setting, as closely aligned as possible with how an end user would hit it.
  This makes sure you find the real problem, so your fix will actually solve it.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel perfection.
  If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along the way.
  Apply that same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.

### Record all work in Jira
When a project tracks work in Jira, every action taken on that work gets recorded there as it happens, not only at the end. That includes planning, executing, reviewing, committing/pushing, merging PRs, opening or closing PRs, CI results and decisions.
- Move tickets through **In Progress** (and into the board's active sprint) → **In Review** → **Done** at each phase boundary. Partial work goes back to In Progress, with a comment naming what is still open.
- Add a comment for each action, giving the commit SHA, PR number or link, and the result.
- If no ticket exists for the work (for example a new work package or a review finding), create one before starting.
- If the Jira connector is down, keep a list of the pending Jira updates. Tell the user it's down, and apply the updates as soon as it reconnects. Never drop them silently.

## Model usage

### Primary
- Use **Claude Opus 5.5** (high effort when the harness offers it) for planning and analysis: plan mode, exploring and analyzing codebases, architecture and design decisions, root-cause analysis, writing specs, planning changes, planning Jira tasks, and pre-merge code review.
- Use **Claude Sonnet 4.5** to execute settled plans: implementation, edits, running commands and tests, and other follow-through on what Opus defined.
- When delegating to subagents, pass the Sonnet 4.5 model slug for execution work; keep planning, exploration-for-analysis, spec-writing, and reviewer subagents on Opus 5.5.

### Fallback (when Opus or Sonnet quota is exhausted)
- Use **Grok 4.6** at medium effort for the planning and analysis work Opus would do (codebase analysis, change planning, specs, Jira task planning).
- Use **Composer 2.5** (the standard model, not `-fast`) to execute plans and changes Grok defined.

## Voice profile
When you are talking/posting on behalf of Corey using his identity, read ~/VOICES.md to see how Corey talks.

## Corey's Opinions
When you are working on something that would benefit from Corey's viewpoints, read ~/OPINIONS.md to understand Corey's opinions.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `corbui317/decidarr` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
