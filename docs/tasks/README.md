# Decidarr Tasks

Tasks convert specs into small reviewable implementation units.

## Rules

- Use one task ID per branch when possible.
- Every task must link to a spec.
- Every task must include scope, files, acceptance criteria, and verification.
- Do not mark a task complete without evidence.
- If implementation discovers spec drift, update the spec or record the blocker before continuing.

## Task ID Format

`DECIDARR-<spec-number>-<area>-<sequence>`

Examples:

- `DECIDARR-01-AUTH-01`
- `DECIDARR-02-CACHE-02`
- `DECIDARR-03-FILTERS-01`
- `DECIDARR-07-ANIM-02`

## Planning Documents

Use `docs/tasks/beta/plans/` for implementation plans created during Cursor Plan mode. A plan should be deleted or archived only after its linked task is complete and evidence has been captured.
