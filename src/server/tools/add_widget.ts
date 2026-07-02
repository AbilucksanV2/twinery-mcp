import { z } from "zod";
import { requireActiveStory, setDirty } from "../state.js";
import { ClarificationResponse } from "../clarification.js";
import { newPassage } from "../../twine/adapter.js";

export const description =
  "Define a reusable SugarCube widget in the `widget`-tagged Widgets passage, callable from any passage. Pass a custom { name, body }, or preset:\"stat_popup\" to install a ready-made <<statpop 'name' delta>> widget that changes a numeric stat AND shows a popup (core SugarCube Dialog) — the \"notify whenever a stat changes\" pattern. SugarCube only (Harlowe uses (macro:), Chapbook/Snowman use JavaScript); idempotent per widget name.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Install a stat-change popup widget",
  input: { preset: "stat_popup" },
  note: "Then call it in a passage: <<statpop 'cash' 100>> adds 100 to $cash and pops a dialog. Custom form: { name: \"greet\", body: \"Hello, _args[0]!\" }.",
};

export const inputSchema = {
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional().describe("Widget name (required unless a preset is given)."),
  body: z.string().optional().describe("Widget body markup; args arrive as _args[0], _args[1], … (required for a custom widget)."),
  preset: z.enum(["stat_popup"]).optional().describe("Install a ready-made widget instead of a custom one."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const PRESETS: Record<string, { name: string; body: string }> = {
  stat_popup: {
    name: "statpop",
    // <<statpop 'cash' 100>> — change a numeric story variable by _args[1] and
    // show a core-SugarCube Dialog. Uses State.variables for dynamic-name access.
    body: [
      "<<set State.variables[_args[0]] += _args[1]>>",
      "<<run Dialog.setup('Stat changed')>>",
      "<<run Dialog.wiki(_args[0] + ': ' + State.variables[_args[0]])>>",
      "<<run Dialog.open()>>",
    ].join("\n"),
  },
};

const WIDGETS_PASSAGE = "Widgets";

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  if (format !== "SugarCube") {
    return {
      kind: "error",
      message: `Widgets are a SugarCube feature. In ${format}, define reusable logic with ${format === "Harlowe" ? "(macro:) stored in a startup-tagged passage, or (display:)" : "plain JavaScript functions on window.setup in a [script] passage"}.`,
    };
  }

  let name: string;
  let body: string;
  if (args.preset !== undefined) {
    ({ name, body } = PRESETS[args.preset]!);
  } else {
    if (args.name === undefined || args.body === undefined) {
      return { kind: "error", message: "Provide either a preset, or both name and body for a custom widget." };
    }
    name = args.name;
    body = args.body;
  }

  const widgetBlock = `<<widget "${name}">>\n${body}\n<</widget>>\n`;

  const existing = story.getPassageByName(WIDGETS_PASSAGE);
  let action: "created" | "replaced" | "appended";
  if (existing === null) {
    const count = story.size();
    story.addPassage(
      newPassage(WIDGETS_PASSAGE, widgetBlock, ["widget"], {
        position: `${100 + (count % 6) * 150},${100 + Math.floor(count / 6) * 150}`,
        size: "100,100",
      }),
    );
    action = "created";
  } else {
    if (!existing.tags.includes("widget")) existing.tags.push("widget");
    // Idempotent per widget name — replace an existing definition in place.
    const re = new RegExp(`<<widget "${name}">>[\\s\\S]*?<</widget>>\\n?`);
    if (re.test(existing.text)) {
      existing.text = existing.text.replace(re, widgetBlock);
      action = "replaced";
    } else {
      existing.text = existing.text.endsWith("\n") || existing.text === ""
        ? existing.text + widgetBlock
        : existing.text + "\n" + widgetBlock;
      action = "appended";
    }
  }

  setDirty();

  return {
    kind: "ok",
    widget: name,
    passage: WIDGETS_PASSAGE,
    action,
    call_example: args.preset === "stat_popup" ? "<<statpop 'cash' 100>>" : `<<${name}>>`,
    emitted_block: widgetBlock,
  };
}
