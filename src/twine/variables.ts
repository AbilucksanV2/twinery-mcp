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
