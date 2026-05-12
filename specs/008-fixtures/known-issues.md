# Known issues — F-FIXTURES round-trip divergences

Per plan R3, when a round-trip diverges through `extwee@^2.2.0` we document
the divergence here rather than silently weakening the test. Each entry
records: the input/output paths involved, the field that diverges, and the
remediation we apply in `src/fixtures.ts`.

## KI-001 — `parseJSON` drops `storyJavaScript` and `storyStylesheet`

**Discovered**: 2026-05-04, on the first run of `npm run fixtures`.

**Reproduction**:

```ts
import { parseTwee, parseJSON } from "extwee";
const story = parseTwee(/* any source with a UserScript or UserStylesheet */);
const back = parseJSON(story.toJSON());
// back.storyJavaScript === ""  (expected: original)
// back.storyStylesheet === ""  (expected: original)
```

**Findings**:
- `Story.toJSON()` writes the script and stylesheet under top-level keys
  `script` and `style` respectively (visible in the JSON output).
- `parseJSON` does NOT populate `storyJavaScript` / `storyStylesheet` on
  the resulting Story regardless of whether the input uses
  `script`/`style` or `storyJavaScript`/`storyStylesheet` as the JSON
  keys.
- `Story.toTwine2HTML` → `parseTwine2HTML` round-trip preserves both
  fields correctly, so this is a JSON-codec-specific gap inside extwee.

**Scope of impact**:
- `save_story` does not currently emit `.json`, so the gap does not
  affect any user-facing save/load flow today.
- `F-T3-LOAD` (load `.html` and `.json`) is the future feature that
  would care; it should either route JSON-load through a fixed extwee
  release, or include a tiny adapter that backfills the dropped fields.

**Remediation in this feature**:
- The fixture runner skips `storyJavaScript` / `storyStylesheet`
  comparison on the `twee→json→twee` round-trip path only, marked with
  a comment pointing back to this entry. Both fields remain strict on
  the `twee→twee` and `twee→html→twee` paths so a regression there
  surfaces immediately.

**Upstream tracking**:
- Worth reporting upstream at https://github.com/videlais/extwee/issues
  with a minimal repro. Out of scope for this feature; tag for follow-up.
