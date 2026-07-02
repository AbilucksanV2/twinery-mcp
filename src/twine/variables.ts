import { StoryFormat } from "./formats.js";

// ---------------------------------------------------------------------------
// Types (T002) — mirror specs/011-variables/data-model.md
// ---------------------------------------------------------------------------

export type VariableType = "string" | "number" | "boolean";

export interface SetterRecord {
  /** The passage whose text contains this setter. */
  passageName: string;
  /** The current value the setter writes. Matches the Variable.type. */
  value: string | number | boolean;
  /** Character offset within the passage text where the setter block starts. */
  offset: number;
  /** The full setter substring including the trailing newline the emitter adds. */
  block: string;
}

export interface ReaderRecord {
  /** The passage whose text contains this reader. */
  passageName: string;
  /** Character offset within the passage text where the reader starts. */
  offset: number;
  /** The exact reader substring as it appears in text. */
  block: string;
}

export interface Variable {
  name: string;
  type: VariableType;
  initialValue: string | number | boolean | null;
  setters: SetterRecord[];
  readers: ReaderRecord[];
  /** true only when load_story extracted a reader but no setter for this name. */
  loadedWithoutSetter?: boolean;
}

// ---------------------------------------------------------------------------
// Reserved names + name validation (T002) — research R4, contracts reserved_names
// ---------------------------------------------------------------------------

export const RESERVED_NAMES: Record<StoryFormat, Set<string>> = {
  Harlowe: new Set<string>(["time"]),
  SugarCube: new Set<string>(["setup", "settings", "prehistory"]),
  Chapbook: new Set<string>([]),
  Snowman: new Set<string>(["s", "window", "document"]),
};

export function isReserved(format: StoryFormat, name: string): boolean {
  return RESERVED_NAMES[format].has(name);
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateVariableName(
  name: string,
): { ok: true } | { ok: false; message: string } {
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      message: `Invalid variable name "${name}". Names must match ^[A-Za-z_][A-Za-z0-9_]*$ (letters, digits, and underscore; cannot start with a digit, no leading "$").`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Value formatting helpers
// ---------------------------------------------------------------------------

export function inferType(value: string | number | boolean): VariableType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function quoteChar(format: StoryFormat): string {
  // Harlowe / SugarCube favour double quotes; Chapbook / Snowman single quotes.
  return format === "Harlowe" || format === "SugarCube" ? '"' : "'";
}

/** Render a typed value as a format-correct literal (numbers / booleans bare). */
function formatValue(format: StoryFormat, value: string | number | boolean): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false"; // Chapbook too (clarify Q4)
  const q = quoteChar(format);
  const escaped = value.replace(/\\/g, "\\\\").split(q).join("\\" + q);
  return `${q}${escaped}${q}`;
}

/** Parse an extracted literal back into a typed JS value. */
function parseValue(raw: string): string | number | boolean {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(['"])([\s\S]*)\1$/);
  if (m) return m[2]!.replace(/\\(['"\\])/g, "$1");
  return t; // bare unquoted string fallback
}

// ---------------------------------------------------------------------------
// Emit helpers (T003) — eight (format, role) branches, see format_syntax_matrix
// ---------------------------------------------------------------------------

/**
 * Format-correct setter text for `name = value`, with a trailing newline so it
 * slots cleanly into existing passage text. For Chapbook the returned line is a
 * vars-section entry; the caller is responsible for `--`-separator placement.
 */
export function emitSetter(
  format: StoryFormat,
  name: string,
  value: string | number | boolean,
): string {
  const v = formatValue(format, value);
  switch (format) {
    case "Harlowe":
      return `(set: $${name} to ${v})\n`;
    case "SugarCube":
      return `<<set $${name} to ${v}>>\n`;
    case "Chapbook":
      return `${name}: ${v}\n`;
    case "Snowman":
      return `<% s.${name} = ${v} %>\n`;
  }
}

export interface SetterInsertion {
  /** The full passage text after the setter was inserted. */
  text: string;
  /** Character offset where the setter block starts in the new text. */
  offset: number;
  /** The exact setter substring inserted (includes its trailing newline). */
  block: string;
}

/**
 * Insert a format-correct setter for `name = value` into `passageText`,
 * returning the new text plus the offset / block of the inserted setter.
 *
 * Harlowe / SugarCube / Snowman append the setter to the end of the passage
 * (a separating newline is added when the body doesn't already end in one).
 * Chapbook places the setter in the vars section above the `--` separator,
 * creating the section if the passage doesn't have one yet (research R2).
 */
export function insertSetterIntoText(
  format: StoryFormat,
  passageText: string,
  name: string,
  value: string | number | boolean,
): SetterInsertion {
  return insertBlockIntoText(format, passageText, emitSetter(format, name, value));
}

/**
 * Place a pre-built setter block into `passageText` with format-correct
 * positioning: Chapbook goes into the vars section above the `--` separator
 * (creating it if absent); the macro formats append to the end of the body.
 * Shared by literal setters (emitSetter) and expression setters
 * (emitSetterExpression).
 */
export function insertBlockIntoText(
  format: StoryFormat,
  passageText: string,
  block: string,
): SetterInsertion {
  if (format === "Chapbook") {
    const sep = passageText.match(/^--[ \t]*$/m);
    if (sep) {
      const offset = sep.index!;
      const text = passageText.slice(0, offset) + block + passageText.slice(offset);
      return { text, offset, block };
    }
    // No vars section yet — create one ahead of the existing prose.
    const text = `${block}--\n${passageText}`;
    return { text, offset: 0, block };
  }

  const prefix = passageText.length > 0 && !passageText.endsWith("\n") ? "\n" : "";
  const offset = passageText.length + prefix.length;
  const text = passageText + prefix + block;
  return { text, offset, block };
}

// ---------------------------------------------------------------------------
// Expression / relative setters (F-VAR-MATH) — emit an UNQUOTED expression so
// stats can change relatively (e.g. SugarCube <<set $cash to $cash + 100>>).
// ---------------------------------------------------------------------------

/** How the active format refers to a variable inside an expression. */
export function variableRef(format: StoryFormat, name: string): string {
  switch (format) {
    case "Snowman":
      return `s.${name}`;
    case "Chapbook":
      return name;
    case "Harlowe":
    case "SugarCube":
      return `$${name}`;
  }
}

/**
 * Format-correct setter whose value is a raw expression, emitted verbatim
 * (NOT quoted). The caller is responsible for the expression being valid in
 * the active format's syntax; `buildAdjustExpression` produces safe ones.
 */
export function emitSetterExpression(
  format: StoryFormat,
  name: string,
  expression: string,
): string {
  switch (format) {
    case "Harlowe":
      return `(set: $${name} to ${expression})\n`;
    case "SugarCube":
      return `<<set $${name} to ${expression}>>\n`;
    case "Chapbook":
      return `${name}: ${expression}\n`;
    case "Snowman":
      return `<% s.${name} = ${expression} %>\n`;
  }
}

/** Build a relative-adjust expression like `$cash + 100` / `s.cash - 5`. */
export function buildAdjustExpression(
  format: StoryFormat,
  name: string,
  delta: number,
): string {
  const ref = variableRef(format, name);
  return delta < 0 ? `${ref} - ${-delta}` : `${ref} + ${delta}`;
}

export function insertExpressionSetterIntoText(
  format: StoryFormat,
  passageText: string,
  name: string,
  expression: string,
): SetterInsertion {
  return insertBlockIntoText(format, passageText, emitSetterExpression(format, name, expression));
}

/** Reported type for tool responses — "null" when declared-only / reader-only. */
export function reportedType(v: Variable): "string" | "number" | "boolean" | "null" {
  if (v.initialValue === null && v.setters.length === 0) return "null";
  return v.type;
}

/** Format-correct inline reader expression for `name`. */
export function emitReader(format: StoryFormat, name: string): string {
  switch (format) {
    case "Harlowe":
      return `$${name}`;
    case "SugarCube":
      return `<<= $${name}>>`;
    case "Chapbook":
      return `{${name}}`;
    case "Snowman":
      return `<%= s.${name} %>`;
  }
}

// ---------------------------------------------------------------------------
// Extract helpers (T004) — per-format regex; Chapbook splits on the `--` line
// ---------------------------------------------------------------------------

export interface ExtractedSetter {
  name: string;
  value: string | number | boolean;
  offset: number;
  block: string;
}

export interface ExtractedReader {
  name: string;
  offset: number;
  block: string;
}

export function extractSetters(format: StoryFormat, passageText: string): ExtractedSetter[] {
  switch (format) {
    case "Harlowe":
      return matchSetters(passageText, /\(set:\s*\$([A-Za-z_][A-Za-z0-9_]*)\s+to\s+([^)]+)\)\n?/g);
    case "SugarCube":
      return matchSetters(passageText, /<<set\s+\$([A-Za-z_][A-Za-z0-9_]*)\s+to\s+(.+?)>>\n?/g);
    case "Snowman":
      return matchSetters(passageText, /<%\s*s\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*%>\n?/g);
    case "Chapbook":
      return extractChapbookSetters(passageText);
  }
}

function matchSetters(text: string, re: RegExp): ExtractedSetter[] {
  const out: ExtractedSetter[] = [];
  for (const m of text.matchAll(re)) {
    out.push({
      name: m[1]!,
      value: parseValue(m[2]!),
      offset: m.index!,
      block: m[0]!,
    });
  }
  return out;
}

function extractChapbookSetters(text: string): ExtractedSetter[] {
  // Chapbook: vars are `name: value` lines above the first standalone `--` line
  // (research R6). Only the upper half is the vars section.
  const sep = text.match(/^--[ \t]*$/m);
  const varsSection = sep ? text.slice(0, sep.index!) : "";
  if (varsSection.length === 0) return [];
  const out: ExtractedSetter[] = [];
  const lineRe = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]*:[ \t]*(.+?)[ \t]*$/gm;
  for (const m of varsSection.matchAll(lineRe)) {
    out.push({
      name: m[1]!,
      value: parseValue(m[2]!),
      offset: m.index!, // varsSection starts at index 0 of text, so offsets align
      block: `${m[0]!}\n`,
    });
  }
  return out;
}

export function extractReaders(format: StoryFormat, passageText: string): ExtractedReader[] {
  switch (format) {
    case "Harlowe":
      return matchReaders(passageText, /\$([A-Za-z_][A-Za-z0-9_]*)/g);
    case "SugarCube":
      return matchReaders(passageText, /<<=\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*>>/g);
    case "Chapbook":
      return matchReaders(passageText, /\{([A-Za-z_][A-Za-z0-9_]*)\}/g);
    case "Snowman":
      return matchReaders(passageText, /<%=\s*s\.([A-Za-z_][A-Za-z0-9_]*)\s*%>/g);
  }
}

function matchReaders(text: string, re: RegExp): ExtractedReader[] {
  const out: ExtractedReader[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ name: m[1]!, offset: m.index!, block: m[0]! });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extract-on-load registry builder (T017 support) — research R6
// ---------------------------------------------------------------------------

export interface PassageLike {
  name: string;
  text: string;
}

/**
 * Rebuild the variable registry from the setter / reader text of every passage.
 * Deduplicates by variable name; initialValue comes from the Start passage's
 * setter when present, otherwise the first setter encountered. Readers found
 * with no setter anywhere land with `loadedWithoutSetter: true`.
 */
export function buildRegistryFromStory(
  passages: PassageLike[],
  startName: string,
  format: StoryFormat,
): Variable[] {
  const byName = new Map<string, Variable>();
  const ensure = (name: string): Variable => {
    let v = byName.get(name);
    if (v === undefined) {
      v = { name, type: "string", initialValue: null, setters: [], readers: [] };
      byName.set(name, v);
    }
    return v;
  };

  for (const p of passages) {
    const setters = extractSetters(format, p.text);
    const setterRanges: Array<[number, number]> = [];
    for (const s of setters) {
      ensure(s.name).setters.push({
        passageName: p.name,
        value: s.value,
        offset: s.offset,
        block: s.block,
      });
      setterRanges.push([s.offset, s.offset + s.block.length]);
    }
    // Readers that fall inside a setter block (e.g. the `$name` inside a Harlowe
    // `(set: $name to ...)`) are part of the setter, not standalone reads.
    for (const r of extractReaders(format, p.text)) {
      const insideSetter = setterRanges.some(([lo, hi]) => r.offset >= lo && r.offset < hi);
      if (insideSetter) continue;
      ensure(r.name).readers.push({ passageName: p.name, offset: r.offset, block: r.block });
    }
  }

  const byPassageThenOffset = (
    a: { passageName: string; offset: number },
    b: { passageName: string; offset: number },
  ): number => a.passageName.localeCompare(b.passageName) || a.offset - b.offset;

  const result: Variable[] = [];
  for (const v of byName.values()) {
    // Resolve initial value before sorting (the source is the first setter
    // encountered in passage order, or the Start passage's setter).
    const startSetter = v.setters.find((s) => s.passageName === startName);
    const source = startSetter ?? v.setters[0];
    if (source !== undefined) {
      v.initialValue = source.value;
      v.type = inferType(source.value);
    } else {
      v.initialValue = null;
      v.loadedWithoutSetter = true;
    }
    v.setters.sort(byPassageThenOffset);
    v.readers.sort(byPassageThenOffset);
    if (v.setters.length === 0 && v.readers.length === 0) continue; // never hold ghosts
    result.push(v);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reader auto-placement (T005) — insert before the first trailing [[...]] block
// ---------------------------------------------------------------------------

/**
 * Returns the character index immediately before the first trailing `[[...]]`
 * link block, walking past trailing whitespace from the end of the text. If no
 * trailing-link block exists, returns `passageText.length` (append).
 *
 * The `[[...]]` block shape is identical across all four formats (only the
 * internal separator differs), so the same matcher serves every format.
 */
export function findInsertOffsetBeforeTrailingLinks(
  format: StoryFormat,
  passageText: string,
): number {
  void format; // signature is uniform across formats; link grammar is shared
  const trimmedEnd = passageText.replace(/\s+$/, "");
  const m = trimmedEnd.match(/(?:\[\[[^\[\]]+\]\][ \t]*\n?\s*)+$/);
  if (!m) return passageText.length;
  return m.index!;
}
