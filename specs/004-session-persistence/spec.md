# Feature Specification: Session Persistence — Open / Inspect / Save loop

**Feature Branch**: `004-session-persistence`
**Created**: 2026-04-25
**Status**: Draft
**Input**: External tester feedback dated 2026-04-25 (`.feedbacks/feedback-25-apr.md`).
The session was friction-heavy because the server is currently *write-only from
disk's perspective* — `save_story` writes Twee/HTML, but there's no way to load
those files back. Every session starts from scratch. This feature closes that
loop and makes session state legible to the LLM and the human author.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume work on an existing story (Priority: P1)

An author has a `.twee` file from a previous session (or hand-authored / exported
from the Twine 2 editor). They want to load it into the MCP server, see what's
inside, make changes, and save it back — all without rebuilding the graph by
hand. The Twee 3 format is canonical, well-specified, and round-trippable, so
this should be a single tool call away.

**Why this priority**: This is the single biggest unlock identified in the
tester feedback. Without it, every session pays a "rebuild from scratch" tax.
With it, the server moves from a one-shot authoring tool to a real iterative
authoring loop. Rated P1 by the tester.

**Independent Test**: Author calls `load_story` with a path to a previously-saved
`.twee` file. The active story state matches what was written: same passage
names, links, tags, IFID, format, start passage. Subsequent tool calls (e.g.
`get_passage`, `validate_story`, `add_image_placeholder`) operate on the loaded
content as if it had been built tool-by-tool in the current session.

**Acceptance Scenarios**:

1. **Given** a `.twee` file on disk produced by a previous `save_story`, **When**
   the author calls `load_story` with its path, **Then** the server replaces the
   active story with the parsed content and returns a summary (passage count,
   start passage, format, IFID, any validation issues found on load).
2. **Given** an active story with unsaved changes, **When** the author calls
   `load_story` without `discard_unsaved: true`, **Then** the server refuses with
   a clarification offering save | discard | cancel — the current work is never
   silently clobbered.
3. **Given** a `.twee` file that fails to parse, **When** `load_story` is called
   on it, **Then** the active story is unchanged and the tool returns a clear
   error explaining why parsing failed (line number where possible).
4. **Given** a freshly loaded story, **When** the author calls
   `add_image_placeholder` and then `save_story` to the original path, **Then**
   the resulting `.twee` round-trips through `load_story` again with no data
   loss across at least one full open/edit/save cycle.

---

### User Story 2 - Inspect the current session state (Priority: P1)

The author (or the LLM acting on their behalf) needs a cheap, read-only way to
ask "what's loaded right now?" without scraping `list_passages` for inference.
The result should answer: is there a story at all, what's its name and format,
how many passages does it have, what's the start, where was it last saved, and
does it have unsaved changes.

**Why this priority**: Today the only way to discover session state is to call
`list_passages` and infer. That fails when the LLM and the human disagree about
what story is loaded — exactly the situation the tester ran into. Rated P2 by
the tester. Promoting to P1 because it's a prerequisite for safe behaviour
under US1 (the dirty flag in particular needs to exist before `load_story` can
honour the "refuse to clobber" guarantee).

**Independent Test**: At any point in a session — including before
`create_story` — calling `current_story_info` returns either `{ active: false }`
(no story loaded) or a populated record. After every mutation the `dirty` field
is `true`; after `save_story` succeeds the `dirty` field is `false`.

**Acceptance Scenarios**:

1. **Given** a fresh server with no active story, **When** the author calls
   `current_story_info`, **Then** the response is `{ active: false }` — no error,
   no clarification.
2. **Given** an active story that has been mutated since its last save (or
   never saved), **When** the author calls `current_story_info`, **Then** the
   response includes `dirty: true` plus the basic fields (name, format, IFID,
   passage count, start_passage, last_saved_path, last_saved_at).
3. **Given** a story that has just been saved, **When** the author calls
   `current_story_info`, **Then** `dirty: false` and `last_saved_path` reflects
   the most recent save destination.
4. **Given** any tool that mutates story state (`create_passage`, `update_*`,
   `rename_*`, `delete_*`, `link_*`, `set_start_passage`, `add_image_placeholder`),
   **When** the call succeeds, **Then** subsequent `current_story_info` reports
   `dirty: true`.

---

### User Story 3 - `save_story` remembers where I last saved (Priority: P2)

After the first explicit `save_story` to a folder, repeated saves to the same
location should not require the author to re-specify `output_dir` every time.
The server should remember the last-used save location for the active story and
use it as the default.

**Why this priority**: A small ergonomic improvement that compounds over a long
authoring session. Cheap to implement (the `lastSavedDir` field already exists
in `state.ts` — it's just unused). Tester-mentioned alongside `current_story_info`
but not separately ranked. P2 because US1+US2 deliver the bulk of the unlock.

**Independent Test**: After one `save_story({ output_dir: "X" })` call, a later
`save_story({})` writes to `X` without surfacing a clarification.

**Acceptance Scenarios**:

1. **Given** an active story that has never been saved, **When** the author calls
   `save_story({})`, **Then** the server surfaces a clarification asking for the
   destination (existing v0.3 behaviour — unchanged).
2. **Given** an active story that was saved to `./stories/foo`, **When** the
   author calls `save_story({})`, **Then** the server writes to `./stories/foo`
   without asking, and the response includes `output_dir: "./stories/foo"` so the
   LLM can confirm to the human.
3. **Given** an active story saved to `./stories/foo`, **When** the author calls
   `save_story({ output_dir: "./stories/bar" })`, **Then** the server writes to
   the explicit override and updates the remembered location to `./stories/bar`
   for future calls.
4. **Given** a story loaded via `load_story` from `./stories/foo/foo.twee`,
   **When** the author calls `save_story({})`, **Then** the server writes to
   `./stories/foo` (the directory the story was loaded from) — load implicitly
   sets `last_saved_path`.

---

### Edge Cases

- **`load_story` of a path that doesn't exist.** Return a clear error; active
  story is unchanged.
- **`load_story` of a `.html` file** (Twine 2 HTML, not `.twee`). v1 of this
  feature accepts `.twee` only; `.html` parsing is deferred to a follow-up. The
  tool surfaces a clarification offering "I only parse `.twee` for now — extract
  Twee from the HTML and try again, or cancel".
- **`load_story` with both `discard_unsaved: true` and a clean active story.**
  The flag is a no-op; load proceeds normally.
- **`current_story_info` while a `load_story` is mid-flight** (theoretically
  concurrent). Per the Constitution, last-write-wins with a warning; for v1 of
  this feature both reads and loads are synchronous so this is moot in practice.
- **The remembered `output_dir` no longer exists at save time** (folder deleted
  externally). `save_story` recreates the directory with `mkdir -p` semantics
  (existing behaviour) and proceeds.
- **`load_story` of a file the server itself just wrote.** Should be a no-op for
  state but re-parsing is honest — the `dirty` flag flips back to `false` since
  on-disk and in-memory now match by definition.
- **Loading a story whose IFID conflicts with the previously-active one.** Not
  an error — IFIDs are story-level identifiers, not session identifiers; the new
  story is simply the new active story.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST expose a `load_story` MCP tool that accepts a
  filesystem path, parses the file as Twee 3 via the existing extwee adapter,
  and replaces the active story with the parsed content.
- **FR-002**: `load_story` MUST refuse to clobber unsaved changes by default —
  if the active story has `dirty: true`, the tool surfaces a clarification with
  three answers: `save_first` (call `save_story` to the remembered path then
  load), `discard_unsaved` (proceed with load, losing in-memory work), or
  `cancel`. A `discard_unsaved: true` flag in the input bypasses the check
  outright for callers who know what they're doing.
- **FR-003**: `load_story` MUST set the active story's `last_saved_path` to the
  loaded file's directory and clear the `dirty` flag. A freshly-loaded story is
  by definition in sync with disk.
- **FR-004**: `load_story` MUST run `validate_story`-equivalent checks on the
  loaded content and include any issues in its response (broken links, orphans,
  duplicate names, IFID shape, start validity). It does NOT refuse to load on
  validation issues — surfacing them is the point.
- **FR-005**: The server MUST expose a `current_story_info` MCP tool that
  returns either `{ active: false }` (no story loaded) or
  `{ active: true, name, format, format_version, ifid, story_slug, passage_count,
  start_passage, last_saved_path, last_saved_at, dirty }`.
- **FR-006**: The server MUST track a `dirty` flag on the active story. The
  flag is `true` after any mutation tool succeeds and `false` only after
  `save_story` succeeds, `load_story` succeeds, or `create_story` succeeds (in
  the last case the new story has no on-disk state but is also not modified
  *since* its zero-state).
- **FR-007**: `save_story` MUST default `output_dir` to the active story's
  `last_saved_path` when the field is omitted and the path is set. If both the
  argument and the remembered path are missing, the existing clarification flow
  applies (ask for the destination).
- **FR-008**: `save_story` MUST update `last_saved_path` to whatever directory
  it actually wrote to (whether the explicit argument or the remembered
  default). It MUST update `last_saved_at` to the wall-clock timestamp at write
  completion.
- **FR-009**: The dirty-flag tracking MUST be implemented in the existing
  `state.ts` module so no tool needs to opt in — mutations go through the
  state interface and the flag is updated in one place.
- **FR-010**: `load_story` MUST reject paths that do not exist or fail extwee's
  parser, returning `{ kind: "error", message }` with a useful diagnostic. The
  active story state MUST be unchanged on parse failure.
- **FR-011**: `current_story_info` MUST be read-only — it never sets `dirty:
  true`, never modifies state, never emits a clarification.
- **FR-012**: All three new behaviours MUST be reflected in the LLM-facing
  guide (`twinery://guide` / `docs/GUIDE.md`) without manual edits — the
  registry-driven generator covers the new tools and `save_story`'s description
  reflects the default-behaviour change.

### Key Entities

- **Active Story** (extended): the existing `ActiveStory` record gains
  `lastSavedPath` (replacing the under-used `lastSavedDir`), `lastSavedAt`
  (epoch milliseconds), and `dirty` (boolean).
- **`load_story` input**: `path: string` (required, absolute or cwd-relative),
  `discard_unsaved: boolean` (optional, default `false`).
- **`load_story` output**: `kind: "ok"`, plus the same shape returned by
  `current_story_info`'s `active: true` branch, plus a `validation` object
  (subset of `validate_story`'s output for non-blocking issues found on load).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Round-trip parity — for any story authored end-to-end via this
  server's tools and saved via `save_story`, calling `load_story` on the
  resulting `.twee` produces an active story whose `list_passages`,
  `validate_story`, and `current_story_info` outputs are identical to the
  pre-save state in 100% of test stories. Verified across at least one fixture
  per supported story format (Harlowe + at least one other).
- **SC-002**: An author can resume work on a previously-saved story in under 30
  seconds: one `load_story` call + one `current_story_info` call to confirm
  state. No tool-by-tool reconstruction.
- **SC-003**: In a test matrix of mutation tools (`create_passage`,
  `update_passage`, `rename_passage`, `delete_passage`, `link_passages`,
  `set_start_passage`, `add_image_placeholder`), 100% of successful calls flip
  `dirty` to `true`. 100% of subsequent successful `save_story` calls flip it
  back to `false`. 0% silent inversions.
- **SC-004**: Calling `load_story` on a dirty active story without
  `discard_unsaved: true` triggers a clarification 100% of the time. 0% silent
  data loss.
- **SC-005**: `current_story_info` adds zero on-the-fly cost beyond a structure
  copy — it never re-walks the graph or re-parses anything. Targeting <5 ms
  response for stories up to 500 passages.
- **SC-006**: After one `save_story({ output_dir: X })` call, the next
  `save_story({})` writes to `X` without a clarification in 100% of cases.
- **SC-007**: After `load_story("./foo/bar.twee")` followed by `save_story({})`,
  the file written is at `./foo/bar.twee` (same path) — load implicitly sets
  the remembered output dir.

## Assumptions

- **`.twee` is the only input format for v1 of this feature.** Twine 2 HTML
  loading is deferred (a follow-up that wraps `extwee.parseTwine2HTML`).
  Twine 2 JSON loading is also deferred.
- **The active-story model stays single-story.** Loading a new story replaces
  the active one (after the dirty-check guard); there is no multi-story
  workspace in this feature. That stays as a deferred Constitution-acknowledged
  decision.
- **Validation on load is non-blocking.** A loaded story can have broken links
  or orphans — the tool reports them but loads successfully. Authors often
  load specifically to *fix* such issues.
- **Existing baseline for this feature is v0.3** (the 13-tool authoring
  surface from `003-complete-us1-tools`, currently in PR review). The branch
  for this feature targets `dev`; if it merges before `003` does, the resulting
  diff will include only the new tools, state changes, and tests.
- **Constitution alignment unchanged.** No new principles needed; the work
  satisfies the existing five (extwee for parsing, MCP-native, graph-integrity
  preserved on load, native-Twine round-trip, OSI-permissive licensing).

## Dependencies

- **`extwee.parseTwee`**: already a runtime dependency — load_story uses it.
  No new dependency added.
- **Existing tool registry + guide generator**: the two new tools register the
  same way as v0.3 tools and surface in `docs/GUIDE.md` automatically.
- **Existing dirty-flag state plumbing**: this feature *adds* the
  infrastructure (currently nothing tracks dirty); future features (find &
  replace, batch ops, etc.) will rely on it being in place.
