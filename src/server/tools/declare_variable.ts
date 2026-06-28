import { z } from "zod";
import {
  requireActiveStory,
  setDirty,
  getVariableByName,
  upsertVariable,
  shiftRecordsInPassage,
} from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import {
  Variable,
  SetterRecord,
  isReserved,
  validateVariableName,
  inferType,
  reportedType,
  insertSetterIntoText,
} from "../../twine/variables.js";

export const description =
  "Declare a story-level variable and emit a format-correct setter into the active story's Start passage. Omit `initial` to declare the name only (no setter). Rejects names reserved by the active format; asks how to resolve a name that's already declared.";

export const clarificationTriggers: string[] = [
  "name already declared: ask replace_initial | leave_as_is | cancel (no silent overwrite).",
  "initial provided but no Start passage exists: ask cancel (create a passage first, then retry).",
];

export const example = {
  title: "Declare the player's name with an initial value",
  input: { name: "playerName", initial: "the stranger" },
  note: "Emits e.g. (set: $playerName to \"the stranger\") into the Start passage for Harlowe.",
};

export const inputSchema = {
  name: z.string().min(1),
  initial: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function okResponse(v: Variable, declaredIn: string | null): object {
  return {
    kind: "ok",
    variable: {
      name: v.name,
      type: reportedType(v),
      initial_value: v.initialValue,
      declared_in: declaredIn,
    },
  };
}

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, format } = active;

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };
  if (isReserved(format, args.name)) {
    return {
      kind: "error",
      message: `"${args.name}" is reserved by the ${format} runtime and cannot be used as a variable name. Pick a different name.`,
    };
  }

  const initial = args.initial ?? null;
  const existing = getVariableByName(args.name);

  if (existing !== undefined) {
    return needClarification(
      "declare_variable",
      args as Record<string, unknown>,
      `Variable "${args.name}" is already declared (current initial value: ${JSON.stringify(existing.initialValue)}). Replace its initial value, leave it as is, or cancel?`,
      {
        valid_answers: ["replace_initial", "leave_as_is", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "leave_as_is") {
            const startSetter = existing.setters.find((s) => s.passageName === story.start);
            return okResponse(existing, startSetter?.passageName ?? existing.setters[0]?.passageName ?? null);
          }
          if (answer === "replace_initial") {
            return replaceInitialValue(existing, initial);
          }
          throw new Error(`Invalid answer: ${answer}`);
        },
      },
    );
  }

  // Declared-only — no value, no setter emitted.
  if (initial === null) {
    const v: Variable = { name: args.name, type: "string", initialValue: null, setters: [], readers: [] };
    upsertVariable(v);
    setDirty();
    return okResponse(v, null);
  }

  if (story.start === "") {
    return needClarification(
      "declare_variable",
      args as Record<string, unknown>,
      `Cannot place the initial setter for "${args.name}" — the story has no Start passage yet. Create a passage (the first one becomes the start) or set_start_passage, then re-call declare_variable. Cancel for now?`,
      {
        valid_answers: ["cancel"],
        free_text_allowed: false,
        replay: async () => ({ kind: "ok", cancelled: true }),
      },
    );
  }

  const startPassage = story.getPassageByName(story.start);
  if (startPassage === null) {
    return { kind: "error", message: `Start passage "${story.start}" is missing from the story.` };
  }

  const ins = insertSetterIntoText(format, startPassage.text, args.name, initial);
  shiftRecordsInPassage(story.start, ins.offset, ins.block.length);
  startPassage.text = ins.text;

  const setter: SetterRecord = {
    passageName: story.start,
    value: initial,
    offset: ins.offset,
    block: ins.block,
  };
  const v: Variable = {
    name: args.name,
    type: inferType(initial),
    initialValue: initial,
    setters: [setter],
    readers: [],
  };
  upsertVariable(v);
  setDirty();
  return okResponse(v, story.start);
}

/** replace_initial branch — overwrite the existing initial setter's value. */
function replaceInitialValue(
  existing: Variable,
  initial: string | number | boolean | null,
): object {
  const active = requireActiveStory();
  const { story, format } = active;

  const target =
    existing.setters.find((s) => s.passageName === story.start) ?? existing.setters[0];

  if (initial === null) {
    // Drop the value back to declared-only by removing the initial setter.
    if (target !== undefined) {
      const passage = story.getPassageByName(target.passageName);
      if (passage !== null) {
        passage.text =
          passage.text.slice(0, target.offset) + passage.text.slice(target.offset + target.block.length);
        shiftRecordsInPassage(target.passageName, target.offset, -target.block.length);
      }
      existing.setters = existing.setters.filter((s) => s !== target);
    }
    existing.initialValue = null;
    upsertVariable(existing);
    setDirty();
    return okResponse(existing, null);
  }

  if (target === undefined) {
    // Declared-only existing variable — emit a fresh setter into Start.
    if (story.start === "") {
      return { kind: "error", message: `No Start passage to place the initial setter for "${existing.name}".` };
    }
    const startPassage = story.getPassageByName(story.start);
    if (startPassage === null) {
      return { kind: "error", message: `Start passage "${story.start}" is missing from the story.` };
    }
    const ins = insertSetterIntoText(format, startPassage.text, existing.name, initial);
    shiftRecordsInPassage(story.start, ins.offset, ins.block.length);
    startPassage.text = ins.text;
    existing.setters.push({ passageName: story.start, value: initial, offset: ins.offset, block: ins.block });
    existing.initialValue = initial;
    existing.type = inferType(initial);
    upsertVariable(existing);
    setDirty();
    return okResponse(existing, story.start);
  }

  const passage = story.getPassageByName(target.passageName);
  if (passage === null) {
    return { kind: "error", message: `Passage "${target.passageName}" holding the initial setter is missing.` };
  }
  const newBlock = insertSetterIntoText(format, "", existing.name, initial).block;
  passage.text =
    passage.text.slice(0, target.offset) + newBlock + passage.text.slice(target.offset + target.block.length);
  shiftRecordsInPassage(target.passageName, target.offset + target.block.length, newBlock.length - target.block.length);
  target.block = newBlock;
  target.value = initial;
  existing.initialValue = initial;
  existing.type = inferType(initial);
  upsertVariable(existing);
  setDirty();
  return okResponse(existing, target.passageName);
}
