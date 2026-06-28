import { z } from "zod";
import { requireActiveStory, getVariableByName } from "../state.js";
import { ClarificationResponse } from "../clarification.js";
import { reportedType, validateVariableName } from "../../twine/variables.js";

export const description =
  "Read-only probe — return the current declared / set value of a named variable plus how many setters and readers reference it. Returns a recoverable error (not a clarification) when the name isn't declared.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Check the current value and usage of playerName",
  input: { name: "playerName" },
};

export const inputSchema = {
  name: z.string().min(1),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  requireActiveStory();

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };

  const variable = getVariableByName(args.name);
  if (variable === undefined) {
    return {
      kind: "error",
      message: `Variable "${args.name}" is not declared. Use declare_variable to create it, or list_variables to see what exists.`,
    };
  }

  return {
    kind: "ok",
    name: variable.name,
    type: reportedType(variable),
    initial_value: variable.initialValue,
    setter_count: variable.setters.length,
    reader_count: variable.readers.length,
    loaded_without_setter: variable.loadedWithoutSetter ?? false,
  };
}
