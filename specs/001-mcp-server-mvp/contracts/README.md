# Contracts Index — Twinery MCP Server v1.0

**Source of truth**: The zod schemas in `src/guide/registry.ts` will be the
runtime origin. The JSON-Schema files in this folder are hand-authored at
planning time to drive task generation; at implementation time, the zod schemas
MUST emit JSON Schemas that match these files. A contract test
(`tests/contract/contracts-match-registry.test.ts`) enforces parity.

Every tool listed below is a Model Context Protocol **Tool**. Every resource is
an MCP **Resource**.

## Tools (13 total for v1.0)

| # | Tool | Contract file | Category |
|---|------|---------------|----------|
| 1 | `create_story` | [tool.create_story.json](./tool.create_story.json) | Story lifecycle |
| 2 | `create_passage` | [tool.create_passage.json](./tool.create_passage.json) | Passage lifecycle |
| 3 | `update_passage` | [tool.update_passage.json](./tool.update_passage.json) | Passage lifecycle |
| 4 | `rename_passage` | [tool.rename_passage.json](./tool.rename_passage.json) | Graph integrity |
| 5 | `delete_passage` | [tool.delete_passage.json](./tool.delete_passage.json) | Graph integrity |
| 6 | `link_passages` | [tool.link_passages.json](./tool.link_passages.json) | Graph integrity |
| 7 | `set_start_passage` | [tool.set_start_passage.json](./tool.set_start_passage.json) | Story lifecycle |
| 8 | `add_image_placeholder` | [tool.add_image_placeholder.json](./tool.add_image_placeholder.json) | Assets |
| 9 | `list_passages` | [tool.list_passages.json](./tool.list_passages.json) | Read-only |
| 10 | `get_passage` | [tool.get_passage.json](./tool.get_passage.json) | Read-only |
| 11 | `validate_story` | [tool.validate_story.json](./tool.validate_story.json) | Read-only |
| 12 | `save_story` | [tool.save_story.json](./tool.save_story.json) | I/O |
| 13 | `respond_to_clarification` | [tool.respond_to_clarification.json](./tool.respond_to_clarification.json) | Clarification fallback |

## Resources

| URI | Contract file | Purpose |
|-----|---------------|---------|
| `twinery://guide` | [resource.guide.json](./resource.guide.json) | LLM-facing tool guide (bytes of `docs/GUIDE.md`) |
| `twinery://story/current/summary` | [resource.story.summary.json](./resource.story.summary.json) | Story overview |
| `twinery://story/current/graph` | [resource.story.graph.json](./resource.story.graph.json) | Adjacency list |
| `twinery://story/current/twee` | [resource.story.twee.json](./resource.story.twee.json) | Full Twee source |

## Shared schemas

| File | Purpose |
|------|---------|
| [shared.clarification.json](./shared.clarification.json) | `ClarificationRequest` / `clarification_needed` response shape (R1 + data-model) |
| [shared.story-format.json](./shared.story-format.json) | Enum + default version per format |
| [shared.passage-id.json](./shared.passage-id.json) | Passage name validation rules |

## Output convention

Every mutation tool returns a result object with:
- `kind`: `"ok"` or `"clarification_needed"`
- On `"ok"`: a tool-specific payload documented in its contract.
- On `"clarification_needed"`: a `ClarificationRequest` embedded per
  `shared.clarification.json`.
Read-only tools never return `"clarification_needed"`.
