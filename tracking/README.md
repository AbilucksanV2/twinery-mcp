# Tracking

Two files work together:

- **[PROGRESS.md](PROGRESS.md)** — the human-readable status board (checkbox
  style). Read this first to see what's done, in flight, and next, across
  epics → features → tasks and the demo Twine stories. Agents tick boxes here
  in the same change that does the work.
- **[backlog.csv](backlog.csv)** — the append-only machine record (below).

A single, append-only CSV at [backlog.csv](backlog.csv) that tracks every
epic, feature, and task in the project. One file. Three layers. No tooling
required to read or edit it — open it in any editor, spreadsheet, or `git
diff`. `PROGRESS.md` is the friendly rollup of the same data; keep the two
reconciled.

## Layers

| Layer     | What it is                              | ID format                  |
| --------- | --------------------------------------- | -------------------------- |
| `epic`    | A theme or release-shaped goal          | `E01`, `E02`, …            |
| `feature` | A unit you'd spec via Spec Kit          | `F005` (or `F-<short>`)    |
| `task`    | A bite-sized commit-shaped change       | `T-<feature_id>-NN`        |

Hierarchy lives in `parent_id`. Epics have empty `parent_id`. Features point
to an epic. Tasks point to a feature. That's it.

## Columns

| Column       | Required | Vocabulary / format                                                |
| ------------ | -------- | ------------------------------------------------------------------ |
| `id`         | yes      | See ID format above                                                |
| `layer`      | yes      | `epic` \| `feature` \| `task`                                      |
| `parent_id`  | yes      | Empty for epics; epic id for features; feature id for tasks        |
| `title`      | yes      | Short — the headline                                               |
| `summary`    | no       | One sentence; semicolons instead of commas                         |
| `status`     | yes      | `backlog` \| `scoped` \| `in-progress` \| `in-review` \| `done` \| `dropped` |
| `priority`   | no       | `P1`–`P5` (matches tester signal vocabulary in the roadmap)        |
| `size`       | no       | `XS` \| `S` \| `M` \| `L` \| `XL`                                  |
| `spec_path`  | no       | e.g. `specs/004-session-persistence/` once promoted via Spec Kit   |
| `branch`     | no       | Git branch the work lives on                                       |
| `pr`         | no       | `#7` style                                                         |
| `commit`     | no       | Short SHA that landed the work (last commit if multi)              |
| `acceptance` | no       | One-sentence "done means this"; semicolons instead of commas       |
| `notes`      | no       | Free-form; semicolons instead of commas                            |

Use semicolons (`;`) inside cells. Avoid commas. That keeps the file
unquoted and easy to diff.

## Status lifecycle

```
backlog  →  scoped  →  in-progress  →  in-review  →  done
   ↘                                                 ↗
            dropped (can land from anywhere)
```

- **backlog** — captured but not committed to. New rows start here.
- **scoped** — promoted to `specs/NNN-*/` via `/speckit.specify`; spec_path is filled.
- **in-progress** — branch exists; work is happening. Branch column filled.
- **in-review** — PR open. `pr` column filled.
- **done** — merged. `commit` column filled with the merge or last commit SHA.
- **dropped** — decided not to do; keep the row for audit.

## How to add a new item

1. **Open [backlog.csv](backlog.csv).** Append a row at the bottom.
2. **Pick a layer.** If unsure, default to `feature`.
3. **Pick an id.**
   - Epics: next `E##`.
   - Features: next `F###` (peek at the highest one) or `F-<short>` for cross-cutting infra.
   - Tasks: `T-<feature_id>-NN` where NN is per-feature.
4. **Fill what you know.** Title + status + parent_id is enough to start.
   Leave the rest blank — fill in as the work progresses.
5. **Commit it** alongside whatever change prompted it.

That's the whole workflow. No script, no UI, no permissions.

## How Spec Kit fits in

When a `feature` row in `backlog` is ready to be detailed:

1. Run `/speckit.specify` with the row's title + summary as the input.
2. Spec Kit creates `specs/NNN-<name>/`.
3. Update the row: set `status` to `scoped` and fill `spec_path`.
4. Optionally let `/speckit.tasks` generate `tasks.md`. Mirror those task
   IDs back as `task` rows here if you want commit-level tracking in the
   CSV; or leave them in `tasks.md` and only mirror the feature row.

## How a contributor closes a task

1. Branch off `dev`. Pick a task row; set `status` to `in-progress`; fill `branch`.
2. When opening the PR, fill `pr` and set `status` to `in-review`.
3. When merged, fill `commit` (short SHA of the merge commit) and set `status`
   to `done`.

The CSV does not enforce any of this — `git log` is still the source of
truth. The CSV is a thin index over it that's easy to scan.

## Conventions worth knowing

- **One row per discrete shippable thing.** If something would be one
  commit, it's a task. If it would be a PR or two, it's a feature. If it
  would be a release or a spec dir, it's an epic.
- **Don't delete rows.** Set `status` to `dropped` and add a `notes` line
  saying why. Audit trail beats a clean diff.
- **The roadmap is the long-form companion.** [specs/001-mcp-server-mvp/roadmap.md](../specs/001-mcp-server-mvp/roadmap.md)
  has the prose and reasoning; this CSV is the index.
- **Cross-cutting infrastructure** (CI, fixtures, etc.) lives under epic
  `E06` rather than tied to a feature spec, so it doesn't get lost between
  releases.

## LLM-session discipline

The "Tracking discipline" section in [`/CLAUDE.md`](../CLAUDE.md)
enforces — for every Claude Code or other LLM session that touches this
repo — that surfaced findings (bugs, frictions, missing tools, UX gaps)
land here as rows before the session ends. Search first, update in
place if found, append a date-stamped row if not, commit alongside the
change. Read that section before recommending any work.
