# Beta Implementation Plans

Use this directory for task-level plans created before code changes.

## Plan File Naming

`DECIDARR-<spec-number>-<area>-<sequence>-plan.md`

Example:

`DECIDARR-03-FILTERS-01-plan.md`

## Plan Template

```markdown
# DECIDARR-XX-AREA-## Plan

## Task

Link to `docs/tasks/beta/beta-backlog.md` row and owning spec.

## Context Pack

- Spec:
- Affected files:
- Dependencies:
- Existing tests:
- Manual verification:

## Scope

In:

- ...

Out:

- ...

## Implementation Steps

1. ...
2. ...
3. ...

## Verification

- [ ] Command/API/manual check
- [ ] Screenshot/log/evidence path

## Risks and Blockers

- ...
```

## Rules

- Plans are not substitutes for specs.
- Keep one active plan per task.
- Update the plan when implementation discovers a real constraint.
