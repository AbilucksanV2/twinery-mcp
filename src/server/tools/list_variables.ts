import { requireActiveStory } from "../state.js";
import { ClarificationResponse } from "../clarification.js";
import { reportedType } from "../../twine/variables.js";

export const description =
  "Return every declared variable in the active story with its type, initial value, and the passages that set or read it. Reads from the in-memory registry — populated by declare_variable / set_variable this session, or extracted from passage text on load_story.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Inspect all variables in the active story",
  input: {},
};

export const inputSchema = {};

export async function handler(): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();

  const variables = active.variables.map((v) => ({
    name: v.name,
    type: reportedType(v),
    initial_value: v.initialValue,
    setter_passages: dedupeInOrder(v.setters.map((s) => s.passageName)),
    reader_passages: dedupeInOrder(v.readers.map((r) => r.passageName)),
    loaded_without_setter: v.loadedWithoutSetter ?? false,
  }));

  return { kind: "ok", variables };
}

function dedupeInOrder(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
