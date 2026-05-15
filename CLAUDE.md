<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/011-variables/plan.md`.

Related artefacts for this feature:
- Constitution: `.specify/memory/constitution.md`
- Spec: `specs/011-variables/spec.md`
- Research (Phase 0): `specs/011-variables/research.md`
- Data model: `specs/011-variables/data-model.md`
- Contracts: `specs/011-variables/contracts/`
- Quickstart: `specs/011-variables/quickstart.md`

Project-level reference:
- v1.0 master spec: `specs/001-mcp-server-mvp/`
- Roadmap: `specs/001-mcp-server-mvp/roadmap.md`
- Backlog tracking: `tracking/backlog.csv`
<!-- SPECKIT END -->

<!-- Content below this line is preserved across `/speckit.plan` rewrites. -->

## Tracking discipline — read this before suggesting any work

Every meaningful finding in a session — bug, friction, missing tool, UX gap,
quirk worth remembering — MUST land as a row in `tracking/backlog.csv`
before the session ends, unless an existing row already covers it.

On every session that produces a finding:

1. **Open `tracking/backlog.csv` and search first.** Look for an existing
   row by title, summary, or notes that already covers the finding.
2. **If found and the row is stale**, update the row in place (status,
   notes, branch, pr, commit) — never add a duplicate.
3. **If not found**, append a new row using the columns documented in
   `tracking/README.md`. Minimum required fields: `id`, `layer`,
   `parent_id`, `title`, `status`. Use the `notes` column for context
   the title can't carry. Date-stamp the surfacing event in `notes`
   so we can correlate findings to sessions.
4. **If multiple findings cluster around a new theme**, also add a parent
   epic row (`E0N`) so they have a home before adding the features.
5. **Honor the CSV convention**: use semicolons inside cells; avoid
   commas; one row per shippable thing.
6. **Commit the backlog update** alongside the change that surfaced it,
   or in a focused `chore(backlog):` commit if no code changed.

The CSV is the project's append-only memory. A session that surfaces a
finding without recording it has thrown away the work — the next session
(or the next contributor) won't know it exists.

See `tracking/README.md` for the full column conventions, status
lifecycle, and how rows get promoted through Spec Kit into
`specs/NNN-*/` directories.

## Constitution gate

Every plan-level change MUST pass the five principles in
`.specify/memory/constitution.md`. If you're touching the server, walk
that file before sketching the change. If a finding seems to violate a
principle, log it in the backlog and surface it to the user — don't
silently work around it.
