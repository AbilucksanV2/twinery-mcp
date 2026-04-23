# Feature Specification: Twinery MCP Server — v1.0 MVP

**Feature Branch**: `001-mcp-server-mvp`
**Created**: 2026-04-23
**Status**: Draft
**Input**: User description: "i want this mcp server to be used like how unitymcp or
gofot mcp works. understand the twinery properly to create required tools. A guidefile
to be attched and always maintained with the mcp server for the llms to understand how
to make of the tools. No assumption based decision making, should ask questions to
clarify. first realease version can support making stories with decision points could
place image place holders and ask the users to place images with expected name in the
expected folder. the code should be runnable in windows mac or linux so any scripts
should have relevant versions. add a readme with every update readme needs to be double
checked. keep easy integration in mind."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a branching decision-point story end-to-end (Priority: P1)

An interactive-fiction author, working from inside any MCP-compatible client (Claude
Desktop, VS Code's MCP client, a local agent, etc.), wants to build a branching Twine
story from a premise — including at least one decision point where the player chooses
between two or more paths — and end up with a playable HTML file they can share. They
never leave the chat UI, never hand-edit Twee, and never touch the Twine editor; the
MCP server drives every mutation.

**Why this priority**: This is the core value of the project. Without it, nothing else
matters. It also validates the format-fidelity and graph-integrity principles in the
smallest possible increment.

**Independent Test**: From a fresh MCP client session, an author can describe a story
premise in natural language, have the LLM call server tools to build a story with at
least 3 passages and one 2-way branch, save it, open the resulting HTML in a browser,
and reach every passage by following links — and the same HTML opens in the native
Twine 2 editor and shows the same graph.

**Acceptance Scenarios**:

1. **Given** a fresh MCP client session with the server attached, **When** the author
   asks the LLM to "make a short branching story about a locked door," **Then** the LLM
   calls server tools to create the story, add passages, and link them into a
   decision-point graph, and returns a path to a saved playable HTML file.
2. **Given** the HTML file produced by acceptance scenario 1, **When** the author opens
   it in a web browser, **Then** every passage is reachable from the start passage by
   clicking links, and no link leads to a missing passage.
3. **Given** the same HTML file, **When** the author opens it in the native Twine 2
   editor (desktop or web), **Then** all passages, links, tags, and positions appear
   identically to the graph the LLM built.
4. **Given** a story where passage "Hallway" is linked from three other passages,
   **When** the author asks the LLM to rename "Hallway" to "Corridor," **Then** all
   three incoming links are rewritten and the story remains fully connected with zero
   broken references.

---

### User Story 2 - Server asks instead of assuming (Priority: P1)

When a tool call lacks information the server needs to produce a correct, format-
faithful result (e.g., "which story format?", "which passage should be the start?",
"the link target doesn't exist — create it or fail?"), the server MUST surface a
clarification request to the human author rather than pick a silent default. This
prevents the entire class of bugs where an LLM fills in a guess, the author doesn't
notice, and the story ships with the wrong format, broken links, or an orphaned start
passage.

**Why this priority**: The author explicitly called this out as non-negotiable. It is
also the cheapest way to make the server trustworthy — no retraining, no prompt
tuning; the behavior lives in the tool contracts.

**Independent Test**: Calling any mutation tool with a required field omitted results
in the client receiving a structured "needs clarification" signal with a specific
question and (where applicable) a short list of valid answers. The tool does NOT apply
a default and does NOT silently fail.

**Acceptance Scenarios**:

1. **Given** an empty server state, **When** the LLM calls `create_story` without
   specifying a story format, **Then** the server returns a clarification request
   asking which story format (Harlowe / SugarCube / Chapbook / Snowman) to use, and
   makes no state change.
2. **Given** a story exists with passages "A" and "B," **When** the LLM calls
   `link_passages` from "A" to "C" where "C" does not exist, **Then** the server
   returns a clarification request asking whether to create "C" as a new empty passage
   or cancel the link, and does not silently create "C".
3. **Given** a freshly created story, **When** the LLM calls `save_story` without an
   output path, **Then** the server returns a clarification request for the
   destination folder, and writes nothing.

---

### User Story 3 - Image placeholders with deterministic file drop (Priority: P2)

The author wants a passage to display an image, but the image file hasn't been drawn
yet. They ask the LLM to add an image placeholder at a specific point in the passage.
The server inserts the placeholder, and then tells the author exactly where to put the
image file (folder path + filename) so that when the HTML is played, the image will
load with no further code changes. If the author never drops the file, the play
experience degrades gracefully (labeled box, not a blank gap or broken-icon shock).

**Why this priority**: The author called this out as a v1 feature. It is also the
simplest content type beyond text that makes stories look produced.

**Independent Test**: After the LLM adds an image placeholder to a passage, the server
returns a concrete absolute-or-project-relative path where the image file is expected.
The author drops a file at that path with the reported filename; the played HTML shows
the image with no further tool calls. If the author skips the drop, the played HTML
shows a labeled placeholder instead of a broken-image icon.

**Acceptance Scenarios**:

1. **Given** a passage "Forest" exists in story "Locked Door," **When** the LLM adds
   an image placeholder labeled "ancient-tree" inside "Forest," **Then** the server
   returns the expected file path `<saved-story-dir>/assets/locked-door/ancient-tree.<ext>`
   (with `<ext>` being one of the allowed extensions) and the exact filename the
   played HTML will request.
2. **Given** the author drops an image file at the reported path with the reported
   filename, **When** they open the compiled HTML and navigate to "Forest," **Then**
   the image renders inline in the passage.
3. **Given** the author does NOT drop the image file, **When** they open the compiled
   HTML and navigate to "Forest," **Then** a labeled placeholder box is shown with the
   image name instead of a broken-image icon or empty space.

---

### User Story 4 - LLM-facing guide + README always current (Priority: P2)

Every copy of the MCP server ships with a guide file that explains every tool, when
to use it, what it returns, and what to do on error. The guide is surfaced both as a
static file in the repository AND as an MCP resource the server exposes, so an LLM
sees it automatically when the client is started. Separately, a human-readable README
covers install, configuration, and a minimal worked example. Both documents are
updated on every user-visible change, and release cannot happen until both have been
verified against the current tool surface.

**Why this priority**: The author called out both documents as always-maintained.
A guide file is the difference between an LLM using the tools correctly on turn one
versus discovering the surface through trial and error.

**Independent Test**: Starting the server from a fresh MCP client exposes a guide
resource whose contents list every currently-registered tool. Every tool named in the
guide actually exists in the server; every tool the server exposes is described in
the guide. The README documents install and a minimal example for the current release.

**Acceptance Scenarios**:

1. **Given** the server is started and connected to an MCP client, **When** the client
   lists available resources, **Then** a guide resource appears whose content covers
   every tool currently exposed by the server.
2. **Given** a contributor adds a new tool in a pull request, **When** CI or the
   release gate runs, **Then** the build fails if the guide or the README has not been
   updated to reference the new tool (or the tool change).
3. **Given** a user reads the README for the current release, **When** they follow the
   install + minimal example end-to-end, **Then** they reach a playable HTML without
   encountering any undocumented step.

---

### User Story 5 - Cross-platform install and run (Priority: P3)

A maintainer on Windows, macOS, or Linux can install and start the server using a
platform-appropriate script (PowerShell on Windows, bash on macOS and Linux). No
manual patching of line endings, shell invocations, or path separators is required.
An MCP client config snippet in the README works on every supported platform with at
most one OS-specific substitution (e.g., the path to the executable).

**Why this priority**: The author called this out explicitly. It is a launch-blocker
for adoption but not for the first usable build.

**Independent Test**: Following the README's install steps on each of Windows, macOS,
and Linux produces a running server and a successful first tool call from an MCP
client, with no edits to the scripts themselves.

**Acceptance Scenarios**:

1. **Given** a clean Windows 11 environment, **When** the maintainer runs the
   documented PowerShell install script, **Then** the server starts successfully and
   responds to a tool-list request from an MCP client.
2. **Given** a clean macOS or Linux environment, **When** the maintainer runs the
   documented bash install script, **Then** the server starts successfully and
   responds to a tool-list request from an MCP client.
3. **Given** the MCP client config snippet from the README, **When** the maintainer
   pastes it into their client's config (adjusting only the executable path for their
   OS), **Then** the server appears in the client's server list and tool calls work.

---

### Edge Cases

- **Rename a passage that is the `Start` passage.** Incoming links (if any) are
  rewritten AND the story's start-passage field is updated to the new name.
- **Delete a passage other passages link to.** The server refuses silent deletion and
  (per US2) asks the author whether to also remove the dangling links or rename them
  to a placeholder.
- **Duplicate passage names.** Rejected at creation/rename time with a structured
  error naming the existing passage.
- **Invalid IFID shape.** Rejected at save time; `create_story` auto-generates a valid
  IFID when none is provided (this is not an "assumption" — it is spec-defined
  behavior documented in the guide).
- **Link syntax that does not match the story's declared format.** Rejected with a
  clarification request; the server does NOT silently rewrite.
- **Image placeholder label collides with an existing placeholder in the same
  story.** Server surfaces a clarification (per FR-006) asking the author to pick a
  new label or confirm an auto-suffixed alternative (`ancient-tree-2`, `-3`, ...).
  The server MUST NOT silently rename.
- **Author runs the image-placeholder path report before saving the story.** The
  server returns the path relative to the not-yet-chosen output folder and warns that
  the final path depends on the eventual save location.
- **Two clients (or two tool calls) mutate the same passage concurrently.** Per
  constitution: last-write-wins with a warning emitted to the losing client.
- **Guide file drifts from the tool surface.** Release gate fails before artifacts are
  published (see US4).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST expose its surface through the Model Context Protocol as
  Tools, Resources, and (where appropriate) Prompts, using the standard MCP SDK. Any
  compliant MCP client MUST be able to drive the full surface without custom adapters.
- **FR-002**: The server MUST NOT import, call, or branch on any specific LLM-provider
  SDK or model identity.
- **FR-003**: Authors MUST be able to create a new story, add passages with decision-
  point links, save to Twee source, and compile to a playable HTML, entirely via tool
  calls.
- **FR-004**: The server MUST preserve link integrity on every graph mutation:
  renaming a passage rewrites all incoming link targets; deleting a passage surfaces
  every affected link; linking to a nonexistent passage surfaces a clarification
  request.
- **FR-005**: The compiled HTML MUST open in the current release of the native Twine
  2 editor (desktop, web, and any officially supported native-device UI) and MUST
  round-trip through that editor without loss of passage names, tags, position, size,
  IFID, story format, format version, tag colors, zoom, style, or script.
- **FR-006**: When a tool call is missing any required input, the server MUST NOT pick
  a silent default; it MUST surface a structured clarification request to the client.
  The server MUST use the MCP **elicitation** capability when the client advertises
  support for it at session initialisation, and MUST fall back to a structured
  `clarification_needed` response payload (carrying the question, any enumerated valid
  answers, and a stable clarification id) when the client does not. The same
  information content MUST appear in either path so authors receive the same question
  regardless of client.
- **FR-007**: The server MUST allow marking a placeholder image inside a passage and
  MUST report the expected file path and filename where the author should drop the
  image. Played HTML MUST attempt to load the image from that exact path. The image-
  asset convention is:
  - **Folder**: a sibling `assets/<story-slug>/` directory next to the saved story
    (`.twee` / `.html`). `<story-slug>` is a URL-safe kebab-case rendering of the
    story name.
  - **Filename**: `<author-label>.<ext>` where `<author-label>` is the kebab-case label
    supplied by the author at placeholder-creation time (e.g. `ancient-tree.png`).
    If a label would collide with an existing placeholder in the same story, the
    server MUST surface a clarification (per FR-006) asking the author to pick a new
    label or confirm an auto-suffixed alternative (`-2`, `-3`, ...). The server MUST
    NOT silently rename.
  - **Allowed extensions**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`. SVG is out of
    scope for v1.0.
  - **Missing-file fallback at play time**: a labeled HTML `<div>` with a dashed
    border showing the placeholder label. No broken-image icon, no empty gap.
- **FR-008**: The server MUST ship an LLM-facing guide document that describes every
  tool, its inputs, outputs, error modes, and a minimal worked example. The guide
  MUST be available both as a static file in the repository AND as an MCP resource
  served by the running server.
- **FR-009**: The guide and the human-facing README MUST be updated in the same
  change-set as any modification to the tool surface. A release-time check MUST fail
  if any currently-exposed tool is absent from the guide or README, or if the guide
  or README references a tool that does not exist.
- **FR-010**: The server MUST be installable and runnable on Windows, macOS, and
  Linux. Install and run scripts MUST be provided in both PowerShell (Windows) and
  bash (macOS / Linux) flavors with equivalent behavior.
- **FR-011**: Integrating the server into an MCP client MUST require no code changes
  — only a client configuration entry (command + args).
- **FR-012**: All runtime dependencies MUST carry OSI-approved permissive licenses
  compatible with MIT redistribution, per the project Constitution. No LLM-provider
  SDK may be a runtime dependency.
- **FR-013**: Parsing and emission of Twine formats (Twee 3, Twine 2 HTML, Twine 2
  JSON) MUST be delegated to a spec-maintained upstream library, not hand-rolled.
- **FR-014**: The server MUST auto-generate a spec-valid IFID when one is not
  provided at story creation. This is spec-defined default behavior (not a silent
  assumption) and MUST be documented in the guide.
- **FR-015**: Tool inputs and outputs MUST have explicit schemas so the guide,
  README, and client-side validation are all driven from the same source of truth.

### Key Entities

- **Story**: A container with a name, IFID, declared story format + version, a
  designated start passage, optional tag colors, zoom, global style, and global
  script. Holds the passage collection.
- **Passage**: A named node with tags, a position and size (editor metadata), and
  text. Outgoing links live as format-specific syntax inside the text.
- **Link**: A directed edge from one passage to another, embedded in the source
  passage's text using the link syntax of the story's declared format. Not a separate
  entity at rest; the server manages it as one for integrity operations.
- **Image Placeholder**: A marker inside a passage that, at play time, attempts to
  load an image from a deterministic path. Carries a label, the expected filename,
  and the expected folder path.
- **Guide**: An LLM-facing document listing every tool and its contract. Served both
  as a static repo file and as an MCP resource.
- **Clarification Request**: A structured payload the server returns when a tool
  call lacks required information. Carries a specific question, optional enumerated
  valid answers, and a stable identifier linking the clarification to the original
  tool call.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new author, starting from a fresh MCP client session with the server
  configured, can build a branching story with at least 3 passages and one 2-choice
  decision point and export a playable HTML in under 15 minutes.
- **SC-002**: 100% of HTML files produced by the server open without error in the
  current release of the native Twine 2 editor and show the same passage graph the
  server built.
- **SC-003**: In a test corpus of 20 stories covering each supported story format,
  every rename-passage operation produces 0 broken incoming links post-rename.
- **SC-004**: In a test suite of tool calls with deliberately omitted required
  inputs, the server surfaces a clarification request in 100% of cases and applies a
  silent default in 0% of cases.
- **SC-005**: A maintainer completes install and first successful tool call on each
  of Windows, macOS, and Linux using only the documented platform-specific script,
  with zero manual edits to the scripts, in under 10 minutes per platform.
- **SC-006**: Every release has 0 tools present in the server but missing from the
  guide, and 0 tools referenced by the guide or README that are not present in the
  server.
- **SC-007**: Integrating the server into a new MCP client requires exactly 1
  configuration entry (command + args) and 0 code changes.
- **SC-008**: For image placeholders, the expected file path and filename reported
  by the server match the path the played HTML actually requests in 100% of cases
  verified by automated check.
- **SC-009**: When an image file is missing at play time, 100% of image placeholders
  render a labeled fallback rather than a broken-image icon or empty space.

## Assumptions

- **Target Twine version**: 2.12.0 (current as of 2026-04-17 research). Backward
  compatibility with earlier Twine 2 versions is not an MVP goal, though output
  format fidelity per the IFTF specs transitively supports them.
- **Default story format**: Harlowe 3.x, matching Twine's UI default (per
  Constitution Principle I and Additional Constraints). The server MUST support the
  three other IFTF-documented formats (SugarCube, Chapbook, Snowman) at the format-
  fidelity level (round-trip parsing/emit) but MAY restrict author-facing convenience
  features (e.g., format-aware link insertion) to Harlowe in v1.0.
- **Transport**: stdio. HTTP / SSE transports are out of scope for v1.0.
- **Scope boundary — create vs. open**: v1.0 focuses on creating new stories and
  saving them. Loading an existing `.twee` / `.html` / `.json` file into server state
  is deferred to v1.1 unless a clarification surfaces a demand for it.
- **Single active story**: The server holds one story in memory at a time (per
  Constitution). Multi-story IDs are deferred.
- **Concurrency**: Last-write-wins with a warning, per Constitution.
- **Image formats**: Standard web formats (PNG, JPEG, GIF, WebP) are supported at
  play time. SVG is treated as supported if the story format's passage renderer
  passes it through unchanged.
- **No LLM inside the server**: The server does not call any model. All generative
  choices (prose, choice text, pacing) come from the LLM on the client side of MCP.
- **License**: MIT, per Constitution.
- **Release model**: v1.0 is a single release; subsequent features ship as minor or
  major bumps per the Constitution's versioning policy.

## Dependencies

- **Upstream Twine format library**: A spec-maintained parser/emitter for Twee 3,
  Twine 2 HTML, and Twine 2 JSON. The project depends on this rather than hand-
  rolling.
- **MCP SDK**: The standard Model Context Protocol SDK for the chosen implementation
  language.
- **MCP-compliant client**: End users need a client (Claude Desktop, VS Code MCP
  client, or equivalent). The server does not ship a client.
- **Native Twine 2 editor**: For round-trip verification during release gating.
