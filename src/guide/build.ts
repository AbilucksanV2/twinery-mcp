import { z, ZodTypeAny } from "zod";
import { TOOL_REGISTRY, ToolMetadata } from "./registry.js";

const GUIDE_TITLE = "# Twinery MCP Server — Tool Guide";
const GUIDE_VERSION_NOTE =
  "> This guide is auto-generated from `src/guide/registry.ts` and the zod schemas on each tool. If you're editing this file by hand, you're editing the wrong thing — change the tool and regenerate.";

export function buildGuide(): string {
  const parts: string[] = [];
  parts.push(GUIDE_TITLE);
  parts.push("");
  parts.push(GUIDE_VERSION_NOTE);
  parts.push("");
  parts.push(overviewSection());
  parts.push("");
  parts.push(clarificationSection());
  parts.push("");
  parts.push(imageSection());
  parts.push("");
  parts.push(logicSection());
  parts.push("");
  parts.push("## Tools");
  parts.push("");
  for (const tool of TOOL_REGISTRY) {
    parts.push(renderTool(tool));
    parts.push("");
  }
  parts.push(endToEndExample());
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function overviewSection(): string {
  const lines = [
    "## What this server does",
    "",
    "Every tool below is callable from any MCP-compliant client over stdio. The server holds one active story in memory at a time and writes it to disk on `save_story`. Parsing and emission of Twee / Twine 2 HTML go through [extwee](https://github.com/videlais/extwee); the server never hand-rolls Twine format code.",
    "",
    "The tool surface is deliberately small and verb-shaped (think UnityMCP / GodotMCP patterns):",
    "",
    TOOL_REGISTRY.map((t) => `- **\`${t.name}\`** — ${t.description.split(". ")[0]}.`).join("\n"),
  ];
  return lines.join("\n");
}

function clarificationSection(): string {
  return [
    "## How the server handles missing info",
    "",
    "**No silent defaults.** If a tool is called without enough information to proceed safely, the server returns a structured `clarification_needed` response:",
    "",
    "```json",
    "{",
    '  "kind": "clarification_needed",',
    '  "clarification": {',
    '    "clarification_id": "<uuid>",',
    '    "question": "Which Twine story format should this story use?",',
    '    "valid_answers": ["Harlowe", "SugarCube", "Chapbook", "Snowman"],',
    '    "free_text_allowed": false,',
    '    "originating_tool": "create_story",',
    '    "originating_args": { "name": "Locked Door" }',
    "  }",
    "}",
    "```",
    "",
    "Relay the `question` to the human, get their answer, then call `respond_to_clarification` with the same `clarification_id` and the selected `answer`. The server replays the original tool call with the answer merged in.",
  ].join("\n");
}

function imageSection(): string {
  return [
    "## Image placeholder convention",
    "",
    "`add_image_placeholder` inserts a self-contained `<div><img>…</div>` block into the chosen passage and reports where the image file is expected on disk. The convention:",
    "",
    "- **Folder**: `<saved-story-dir>/assets/<story-slug>/`",
    "- **Filename**: `<author-label>.<ext>` where `<ext>` defaults to `png`. Allowed: `png`, `jpg`, `jpeg`, `gif`, `webp`.",
    "- **Missing-file behaviour**: the compiled HTML shows a labeled dashed-border box instead of a broken-image icon. Nothing else to wire up — the fallback is inline CSS + an `onerror` hook.",
    "",
    "Labels must be unique within the story. On collision, the server surfaces a clarification offering an auto-suffix; it will never silently rename.",
  ].join("\n");
}

function logicSection(): string {
  return [
    "## Authoring logic (variables & conditions)",
    "",
    "**Logic in Twine lives inside passage text**, written as the active story format's own markup — there is no separate logic layer. The *concept* (a stat, a computed change, a gated choice) is the same across formats; the **syntax is not**. Always emit markup for the story's declared format — mixing dialects (e.g. Harlowe `(set:)` in a SugarCube story) is the most common way to produce a broken story.",
    "",
    "**Variables have dedicated tools** — prefer them over hand-writing setters/readers:",
    "",
    "- `declare_variable` — introduce a variable and its initial value.",
    "- `set_variable` — set an absolute value in a passage (`expression: true` to emit a computed value unquoted).",
    "- `adjust_variable` — change a numeric variable by a relative amount (e.g. `+100` cash); emits the format-correct relative setter.",
    "- `insert_variable_reader` — show a variable's value in prose.",
    "- `read_variable` / `list_variables` / `delete_variable` — inspect and remove.",
    "",
    "**Conditionals, gated links, widgets, and inventories do not yet have dedicated tools** — author them as passage text (via `create_passage` / `update_passage`) using the matrix below. Emit exactly the row for the active format.",
    "",
    "| Need | Harlowe | SugarCube | Chapbook | Snowman |",
    "|---|---|---|---|---|",
    "| Set (literal) | `(set: $x to 5)` | `<<set $x to 5>>` | `x: 5` (above `--`) | `<% s.x = 5 %>` |",
    "| Set (computed) | `(set: $x to $x + 1)` | `<<set $x to $x + 1>>` | `x: x + 1` (above `--`) | `<% s.x = s.x + 1 %>` |",
    "| Show value | `$x` | `<<= $x>>` | `{x}` | `<%= s.x %>` |",
    "| If / else | `(if: $x > 1)[…](else:)[…]` | `<<if $x gt 1>>…<<else>>…<</if>>` | `[if x > 1]`…`[else]`…`[continue]` | `<% if (s.x > 1) { %>…<% } else { %>…<% } %>` |",
    "| Gated link | `(if: $x > 1)[[[Go->T]]]` | `<<if $x gt 1>>[[Go->T]]<</if>>` | `[if x > 1]`⏎`[[Go->T]]` | `<% if (s.x > 1) { %>[[Go->T]]<% } %>` |",
    "| Initialize once in | a passage tagged `startup` | the `StoryInit` passage | the Start passage's vars section | a `[script]` passage (`window.story.state.x = …`) |",
    "",
    "**Format gotchas that break stories:**",
    "",
    "- **Harlowe** — conditionals are *changers attached to a hook*: `(if: $x is 2)[shown]` (brackets required, no space-operator). Use **word operators** (`is`, `and`, `not`, `contains`), not `==`/`&&`. A gated link nests three brackets: `(if: c)[[[Text->Target]]]`.",
    "- **SugarCube** — `$var` persists/saves, `_var` is temporary (wiped each render). Set with `to`, compare with `is`/`gt`/`lt`; never bare `=` in a condition. Every `<<if>>` needs `<</if>>`. `<<notify>>` toasts are a *third-party* macro — don't emit without the add-on.",
    "- **Chapbook** — state goes in the **vars section above the `--` line** (bare names, no `$`); conditionals are line `[if]`/`[else]`/`[continue]` modifiers (no nesting, no `else if`). There is no setter-on-link — set state in the destination passage's vars section.",
    "- **Snowman** — raw JavaScript in `<% %>` / `<%= %>`; state on `s.` (alias of `window.story.state`, available only inside template tags). Standard JS operators. No macros, no built-in dialog.",
    "",
    "General: initialize every variable before it's read; keep a single central place to display current stats (SugarCube `StoryCaption`; other formats a `header`/`footer`-tagged passage); the in-game clock is a plain variable you advance, not the real-world clock.",
  ].join("\n");
}

function renderTool(tool: ToolMetadata): string {
  const lines: string[] = [];
  lines.push(`### \`${tool.name}\``);
  lines.push("");
  lines.push(tool.description);
  lines.push("");
  lines.push("**Input**");
  lines.push("");
  for (const row of renderSchemaRows(tool.inputSchema)) {
    lines.push(row);
  }
  lines.push("");
  if (tool.clarificationTriggers.length > 0) {
    lines.push("**Surfaces a clarification when:**");
    lines.push("");
    for (const t of tool.clarificationTriggers) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }
  lines.push("**Example**");
  lines.push("");
  lines.push(`*${tool.example.title}*`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(tool.example.input, null, 2));
  lines.push("```");
  if (tool.example.note !== undefined) {
    lines.push("");
    lines.push(tool.example.note);
  }
  return lines.join("\n");
}

function renderSchemaRows(shape: Record<string, ZodTypeAny>): string[] {
  const rows: string[] = ["| Field | Type | Required | Notes |", "|---|---|---|---|"];
  for (const [key, value] of Object.entries(shape)) {
    rows.push(
      `| \`${key}\` | ${describeType(value)} | ${isRequired(value) ? "yes" : "no"} | ${describeNotes(value)} |`,
    );
  }
  return rows;
}

function isRequired(schema: ZodTypeAny): boolean {
  return !schema.isOptional();
}

function describeType(schema: ZodTypeAny): string {
  const unwrapped = unwrap(schema);
  const def = unwrapped._def as {
    typeName?: string;
    values?: unknown[];
    type?: ZodTypeAny;
    innerType?: ZodTypeAny;
  };
  const name = def.typeName ?? "";
  switch (name) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodEnum":
      return Array.isArray(def.values) ? `enum(${def.values.map((v) => `\`${String(v)}\``).join(" \\| ")})` : "enum";
    case "ZodArray":
      return def.type !== undefined ? `array<${describeType(def.type)}>` : "array";
    case "ZodObject":
      return "object";
    case "ZodNullable":
      return def.innerType !== undefined ? `${describeType(def.innerType)} | null` : "any | null";
    default:
      return name.replace(/^Zod/, "").toLowerCase() || "any";
  }
}

function describeNotes(schema: ZodTypeAny): string {
  const unwrapped = unwrap(schema);
  const d = (unwrapped as unknown as { description?: string }).description;
  return d !== undefined && d !== "" ? d.replace(/\|/g, "\\|") : "—";
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let s: ZodTypeAny = schema;
  const defAny = () => s._def as { typeName?: string; innerType?: ZodTypeAny };
  while (defAny().typeName === "ZodOptional" || defAny().typeName === "ZodDefault") {
    const inner = defAny().innerType;
    if (inner === undefined) break;
    s = inner;
  }
  return s;
}

function endToEndExample(): string {
  return [
    "## End-to-end example",
    "",
    "Building a branching story with one decision point and saving it:",
    "",
    "```text",
    "1. create_story({ name: \"Locked Door\", format: \"Harlowe\" })",
    "2. create_passage({ name: \"Start\", text: \"You stand before a locked door.\", set_as_start: true })",
    "3. create_passage({ name: \"Pick Lock\", text: \"You pick the lock and slip through.\" })",
    "4. create_passage({ name: \"Kick Door\", text: \"You kick it open with a splinter of wood.\" })",
    "5. link_passages({ from_passage: \"Start\", to_passage: \"Pick Lock\", display_text: \"Try to pick it\" })",
    "6. link_passages({ from_passage: \"Start\", to_passage: \"Kick Door\", display_text: \"Kick it down\" })",
    "7. add_image_placeholder({ passage_name: \"Pick Lock\", label: \"brass-lock\" })   // optional",
    "8. save_story({ output_dir: \"./stories/locked-door\" })",
    "```",
    "",
    "Result on disk:",
    "",
    "```text",
    "stories/locked-door/",
    "├── locked-door.twee         # canonical source",
    "├── locked-door.html         # importable into Twine 2 editor",
    "└── assets/locked-door/      # drop image files here",
    "    └── brass-lock.png       # placed by the author after add_image_placeholder",
    "```",
    "",
    "Open `locked-door.html` in the Twine 2 editor (Library → Import From File) to verify the graph and Publish to File for standalone playable HTML.",
  ].join("\n");
}
