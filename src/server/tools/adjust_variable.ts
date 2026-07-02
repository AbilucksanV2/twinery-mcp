import { z } from "zod";
import { requireActiveStory, getVariableByName } from "../state.js";
import { ClarificationResponse } from "../clarification.js";
import { validateVariableName, buildAdjustExpression } from "../../twine/variables.js";
import * as setVariable from "./set_variable.js";

export const description =
  "Change a numeric variable by a relative amount inside a passage — e.g. working adds +100 cash, studying adds +1 intelligence. Emits the format-correct relative assignment (SugarCube <<set $cash to $cash + 100>>, Harlowe (set: $cash to $cash + 100), Chapbook cash: cash + 100, Snowman <% s.cash = s.cash + 100 %>). Idempotent within a passage — re-adjusting the same variable in the same passage replaces the prior adjustment rather than stacking. Use set_variable for absolute values.";

export const clarificationTriggers: string[] = [
  "variable not declared: ask declare_now | cancel (inherited from set_variable).",
  "passage_name does not exist: ask which passage was meant (inherited from set_variable).",
];

export const example = {
  title: "Working pays 100 cash",
  input: { passage_name: "Work", name: "cash", delta: 100 },
  note: "Use a negative delta to subtract, e.g. { passage_name: \"Bar\", name: \"cash\", delta: -20 }.",
};

export const inputSchema = {
  passage_name: z.string().min(1),
  name: z.string().min(1),
  delta: z.number().describe("Amount to add (negative to subtract)."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { format } = requireActiveStory();

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };

  // Guard: relative math only makes sense for a numeric variable. (An unknown
  // variable falls through to set_variable's declare_now clarification.)
  const variable = getVariableByName(args.name);
  if (variable !== undefined && variable.type !== "number") {
    return {
      kind: "error",
      message: `adjust_variable needs a numeric variable, but "${args.name}" is ${variable.type}. Use set_variable to change it.`,
    };
  }

  const expression = buildAdjustExpression(format, args.name, args.delta);

  // Reuse set_variable's expression mode — it owns idempotency, the
  // declare_now / passage-not-found clarifications, offset shifting, and the
  // registry update.
  const result = (await setVariable.handler({
    passage_name: args.passage_name,
    name: args.name,
    value: expression,
    expression: true,
  })) as { kind?: string; action?: string; emitted_block?: string };

  if (result.kind !== "ok") return result as object | ClarificationResponse;

  return {
    kind: "ok",
    passage_name: args.passage_name,
    name: args.name,
    delta: args.delta,
    action: result.action,
    emitted_block: result.emitted_block,
  };
}
