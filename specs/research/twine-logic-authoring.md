# Twine Logic Authoring — cross-format reference

**Status:** standing reference · **Compiled:** 2026-06-29 · **Feeds:** E07 (Stateful authoring) — F-VAR-MATH, F-CONDITIONALS, F-WIDGETS, F-VAR-INIT, F-LOGIC-GUIDE

This document distills how **logic and conditional rendering** actually work
in the four Twine 2 story formats, and what that means for the MCP's tool
surface. It exists because the central design constraint is easy to miss:

> **In Twine, logic lives *inside passage text* as format-specific markup.**
> There is no separate "logic editor." Conditionals, variable assignments, and
> links-with-side-effects are written inline into passage prose. The *concept*
> (a stat, a gated choice, a clock) is format-agnostic; the *syntax* is not.

So the MCP cannot just "set a variable" — its tools and docstrings must teach
the calling model **which dialect to emit for the active format** and **where
logic and initialization belong**. A model that averages across the four
dialects it saw in training will emit mixed, broken markup. This is the single
highest-probability failure mode (confirmed across all five research streams).

Sourced from the official format docs (SugarCube docs, Harlowe manual, Chapbook
guide, Snowman docs) and the IFTF Twine Cookbook, which publishes the *same
recipe in all four formats* — proof that the recipe is a shape and the format
selects the dialect. Community/forum sources are flagged inline where used.

---

## 1. Cross-format capability matrix

| Capability | SugarCube | Harlowe | Chapbook | Snowman |
|---|---|---|---|---|
| **Variable sigil** | `$story`, `_temp` | `$story`, `_temp` | bare `name` (no sigil) | `s.name` (JS prop on `window.story.state`) |
| **Set (literal)** | `<<set $x to 5>>` | `(set: $x to 5)` | `x: 5` (above `--`) | `<% s.x = 5 %>` |
| **Set (computed)** | `<<set $cash to $cash + 100>>` / `+=` / `++` | `(set: $cash to it + 100)` / `+=` | `cash: cash + 100` (evaluated once) | `<% s.cash = s.cash + 100 %>` |
| **Print inline** | `$x` naked · `<<= $x>>` / `<<print>>` for exprs | `$x` naked · `(print: $x)` | `{x}` insert (no exprs) | `<%= s.x %>` |
| **If / else** | `<<if>>` `<<elseif>>` `<<else>>` `<</if>>` | `(if:)[…](else-if:)[…](else:)[…]` (hooks) | `[if cond]` `[else]` `[continue]` (modifiers) | `<% if(){ %>…<% }else{ %>…<% } %>` |
| **Operators** | `is`/`isnot`/`gt`/`gte`/`lt`/`lte`/`and`/`or`/`not` (or JS symbols) | `is`/`is not`/`>`/`>=`/`and`/`or`/`not`/`contains` (words) | JS `===`/`>=`/`&&`/`!` (inside `[if]`) | JS `===`/`>=`/`&&`/`!` |
| **Gated link** | `<<if c>>[[Text->T]]<</if>>` | `(if: c)[[[Text->T]]]` | `[if c]`\n`[[Text->T]]` | `<% if(c){ %>[[Text->T]]<% } %>` |
| **Set on link click** | setter-link `[[T->P][$x to 5]]` · `<<link>>`+`<<set>>` body | `(link-reveal-goto:"t","P")[(set:…)]` | **none** — set in target's vars section | top of target passage · jQuery on `a[data-passage]` |
| **Reusable logic** | `<<widget>>` (passage tagged `widget`) | `(macro:)` (3.2+) or `(display:)` | custom JS inserts/modifiers · `[JavaScript]` | plain JS fns on `window.setup` (Story JS) |
| **Popup / dialog** | `<<dialog>>` + `Dialog` API (core) · `<<notify>>` toast (3rd-party) | `(dialog:)` (3.1+) / `(alert:)` | **none** native (embed/reveal/JS fallback) | **none** native (`window.alert`/DOM) |
| **Init-once passage** | `StoryInit` (special name) | passage **tagged `startup`** | vars section of a **once-only** passage | `[script]` UserScript / Story JS |
| **Per-move hook** | `PassageReady` / `PassageHeader` / `PassageFooter` | passages tagged `header` / `footer` | header/footer passage | `[script]` + history events |
| **Sidebar stat display** | `StoryCaption` | `header`/`footer` passage | header/footer passage | DOM injection |

---

## 2. Per-format gotchas the MCP must encode

### Harlowe — the hook-attachment model is the trap
- `(if:)`, `(link:)`, changers produce a **changer value** that must be
  **immediately followed by a hook `[ … ]`** — no `then`, no operator, no space.
  `(if: $x is 2)[shown]` is right; `(if: $x is 2) shown` does nothing.
- **Word operators only:** equality is `is` (NOT `==`), logic is `and`/`or`/`not`
  (NOT `&&`/`||`/`!`), membership is `contains`/`is in`.
- **Gated link nests three brackets:** `(if: $int > 1)[[[Pass->Pass]]]` — outer
  `[ ]` is the if-hook, inner `[[ ]]` the link. Not a typo.
- Uninitialized variables default to `0`. **No `StoryInit`** — init in a
  `startup`-tagged passage. `header`/`footer` tags run on *every* passage.
- Reuse: `(macro:)` stored in a var + `(output:)`, called `($name: args)`; or
  `(display: "Passage")`. **Never** emit `<<widget>>`.
- Relative set uses the `it` keyword: `(set: $cash to it + 100)` (or `+=`).

### SugarCube — `$`/`_` is semantic; init in StoryInit; toasts are third-party
- `$var` persists and is saved; `_var` is wiped each render. Choosing wrong
  silently breaks saves or leaks state.
- Initialize every `$var` in the **`StoryInit`** special passage (fixed,
  case-sensitive name).
- Set with `to` (`<<set $x to 5>>`), compare with `is`/`gt`/`lt`/… — never bare
  `=` in a conditional. Every `<<if>>` needs `<</if>>`; every `<<link>>`/
  `<<widget>>`/`<<dialog>>` needs its closing tag. **Validate balanced tags.**
- Two side-effect-link syntaxes: setter-link `[[Text|Pass][$x to 5]]` (runs on
  click, before nav; multiple setters `;`-separated) and `<<link>>` with a
  `<<set>>` body (may omit target to stay on page).
- Reuse = `<<widget "name">>…<</widget>>` in a `widget`-tagged passage; args are
  `_args[0]`, `_args.length`; `container` widgets expose `_contents`.
- Popups: `<<dialog>>` + `Dialog.setup()→Dialog.wiki()→Dialog.open()` are **core**.
  `<<notify>>` toast is **Chapel's third-party macro** — do NOT emit it unless
  that script is installed, or the story throws "macro does not exist."
- Mid-passage `<<set>>` does **not** repaint the passage or `StoryCaption`; use
  `<<replace "#id">>` to show an immediate change.

### Chapbook — fundamentally different: vars-section + modifiers, no setter-link
- State goes in the **vars section above a `--` line**; body below. Bare names,
  no `$`. Exactly one vars section, at the top. **Never** emit `(set:)`/`<<set>>`.
- The vars section **evaluates expressions once, top-to-bottom**, and forbids
  `{inserts}` and `[modifiers]`. Conditional assignment uses `name (cond): value`.
- Display a variable with `{name}` (no expressions — compute into a temp var
  first). Built-in inserts always contain a space, distinguishing them.
- Conditionals are **line-level modifiers**: `[if cond]` / `[else]` / `[unless]`
  / `[continue]`. They don't nest, have **no `else if`**, and need `[continue]`
  to resume unconditional text. JS operators go *inside* the condition.
- **No setter-link exists.** Set state in the **destination passage's vars
  section** (canonical), using `passage.from` if it depends on origin; or drop
  to `[JavaScript]` + `engine.state.set()`.
- **No native popup** — use `{embed passage}`, `{reveal link}`, or `[JavaScript]`+`[CSS]`.
- No StoryInit — init in the Start (or a `{embed}`-ed Setup) passage's vars
  section; guard run-once with `passage.visits` since a vars section re-runs on
  every visit.

### Snowman — raw JavaScript, `s.` state, no macros, no UI helpers
- Three template tags: `<% run %>`, `<%= print %>`, `<%- print-escaped %>`.
  Logic is plain JS. **Never** emit format macros.
- All state on `window.story.state`; `s` is an alias **only inside template tags
  / passage `<script>`**. In Story JS or any standalone function, `s` does not
  exist — use `window.story.state` (or `var s = story.state;` locally).
- Conditionals are literal JS braces split across tags: `<% if (c) { %> … <% } %>`.
  The closing `<% } %>` is a frequent omission — guard it.
- Links render to `<a data-passage="T">`. **No setter-link** — set at the top of
  the target passage or bind a jQuery handler on `a[data-passage]`. Programmatic
  nav is `story.show('Name')`.
- Reuse = plain functions on `window.setup` (not saved) or `window.story.state`
  (saved); each `<% %>` block is its own scope. jQuery and Underscore (`_`) are
  bundled.
- **No dialog/modal/toast** — `window.alert`/`confirm` or hand-injected DOM.
- Init must be idempotent (`if (s.x === undefined)`) because history replays state.

---

## 3. Format-agnostic patterns (the "recipes")

Each is one logic *shape*; the format selects the dialect (§1). These map 1:1
to Twine Cookbook recipes (`playerstatistics/`, `conditionalstatements/`,
`arrays/`, `turncounter/`, `dateandtime/`, `headersandfooters/`, `modal/`).

1. **Stat system** — declare+init all stats once in the format's init passage;
   mutate on actions via compound assignment attached to a link/button; **clamp**
   at min/max; display in **one central place** (`StoryCaption` / header passage),
   never copied per-passage.
2. **Day / time-period clock** — keep `day` + a within-day index; advance on
   "spend time" actions; roll over with modulo (`period = t % 4`,
   `day = floor(t/4)+1`). Prefer the **manual counter** form; SugarCube's
   `State.turns`-based clock ticks on *every* click, which life-sims usually
   don't want. Gate events with `if day is 2 and location is "school"`.
3. **Inventory** — array of item names is the common idiom: add with
   `push`/`+`, test ownership with `includes`/`contains`, gate links on
   ownership. Objects/datamaps for quantities; boolean-per-item for trivial cases.
4. **Triggered event** — two complementary mechanisms: (a) a **header/footer
   passage** checks state on every load and fires ambient/recurring events
   centrally; (b) **in-passage** `if` blocks for location/moment-specific events.
   Authors mix both; put routine content in a shared passage and override only
   when a special event's conditions match.
5. **Stat-change popup** — the key idiom is **mutate + notify in one unit** so
   they can never drift and changes don't double-apply on re-render/revisit
   (SugarCube `<<statChange>>`/widget with a unique id; Harlowe `(set:)`+`(replace:)`
   or `(dialog:)`; Chapbook/Snowman DIY). Default to clamping.

---

## 4. Top gotchas an LLM author will hit

1. **Mixing dialects** — Harlowe `(set:)` in a SugarCube story, etc. *(headline risk)*
2. **Forgetting to initialize** in the format's init passage → `undefined`/`NaN`.
3. **Assignment vs comparison** — `to`/`is` (SugarCube), `=` vs `===` (Chapbook/Snowman).
4. **Expecting mid-passage `set` to update printed text / sidebar** — needs `replace`.
5. **Temp vs story variable** — `_temp` doesn't persist; beginners wonder why state "resets."
6. **Setter-link misuse** — runs on click before nav; multiple assignments need separators.
7. **Double-applied stat changes** on revisit/re-render — the mutate+notify-with-id pattern fixes this.
8. **Real-world clock vs in-game clock** — `new Date()`/`(current-time:)` is the player's wall clock, not game time.
9. **Chapbook vars-section re-runs every visit** — init in a once-only passage.
10. **Exact tag/name spelling** — `StoryInit`, `startup`, `header`, `widget` must be exact.

---

## 5. What this means for the MCP (design implications)

These map directly to backlog features under E07:

1. **Format is a first-class, required input bound to every emitted snippet.**
   Tool docstrings carry the §1 matrix so the model picks the right dialect.
   → *F-LOGIC-GUIDE, and a `format` parameter discipline across logic tools.*
2. **"Initialize in the format's init passage" must be a structural guarantee,
   not advice.** Today `declare_variable` writes the setter into the **Start**
   passage — idiomatically it should target `StoryInit` (SugarCube) /
   `startup`-tagged (Harlowe) / a once-only vars section (Chapbook) / UserScript
   (Snowman). → *F-VAR-INIT.*
3. **Maintain a variable manifest** (name, type, default, where displayed, where
   mutated) so the MCP can detect used-before-init, mutated-but-never-shown, and
   sigil/dialect errors, and answer "what stats exist?" without re-parsing prose.
   → *extends the existing `ActiveStory.variables` registry.*
4. **Computed/relative updates** — emit `$cash + 100` style unquoted expressions
   (and the `it`/`+=`/`++` variants per format). → *F-VAR-MATH.*
5. **Conditional rendering + gated choices** — emit the right `if`/hook/modifier
   per format, plus state-gated links and the hidden-vs-disabled distinction.
   → *F-CONDITIONALS.*
6. **Mutation + notification as one tool** (`change_stat(name, delta, message?)`)
   emitting an idempotent unit so the popup can't drift and changes don't
   double-apply. → *F-WIDGETS + F-VAR-MATH.*
7. **Central stat-display tool** targeting the right surface per format
   (`StoryCaption` / header-footer). → *F-STATBLOCK (new).*
8. **Elicit the time model** before generating a clock (per-action vs per-nav;
   granularity; what gates on day). → *clarification in the clock template.*
9. **Lint emitted markup** — balanced macro tags, never `=` in a conditional,
   warn on temp-expected-to-persist, never emit third-party macros (`<<notify>>`)
   without the dependency. → *validate_story extension.*
10. **Teach, don't just emit** — the user's core ask: a calling model (any model)
    must be able to learn from the MCP what logic is possible and how. Enrich
    tool docstrings AND the `twinery://guide` resource with a format-aware logic
    capability section; consider format-aware elicitation. → *F-LOGIC-GUIDE.*

---

## 6. Sources

**Official format docs / cookbook**
- SugarCube v2 docs — https://www.motoslave.net/sugarcube/2/docs/ ; state/saving guide — https://github.com/tmedwards/sugarcube-2
- Harlowe 3 manual — https://twine2.neocities.org/
- Chapbook guide — https://klembot.github.io/chapbook/guide/ (vars section, conditional display, conditions-and-variables, link inserts, reveal links, embedding, JS/CSS in passages)
- Snowman 2 docs — https://videlais.github.io/snowman/2/ (templates, links, print, functions, scope, elements)
- Twine Cookbook — https://github.com/iftechfoundation/twine-cookbook (playerstatistics, conditionalstatements, arrays, turncounter, dateandtime, headersandfooters, modal — each in all 4 formats)

**Community (opinion/convention, not spec)**
- "Smarter Stat Changes in Twine/SugarCube" — https://subjunctivegames.com/smarter-stat-changes-in-twine-sugarcube-games/
- Chapel's custom macros (Dialog, `<<notify>>`, simple-inventory) — https://github.com/ChapelR/custom-macros-for-sugarcube-2
- SugarCube stats tutorial — https://townofcrosshollow.tumblr.com/post/656001589284323328/
- StoryCaption usage — https://twinery.org/archive/questions/5840/
- Life-sim clock/day threads — https://intfiction.org/t/simple-time-and-day-system/60886 ; https://twinery.org/forum/discussion/8600/
- Working SugarCube life-sim sample repo — https://github.com/aronedwards91/twine-life-rpg
- Chapbook setter-link limitation — https://github.com/klembot/chapbook/issues/90

**Fetch note for future tooling:** several `twinery.org/cookbook/*` pages return
HTTP 403 to automated fetches; read the recipe source from the
`iftechfoundation/twine-cookbook` GitHub repo instead, or cache a copy.
