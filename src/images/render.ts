export interface ImageBlockParams {
  label: string;
  extension: string;
  storySlug: string;
}

export function imageBlockHtml(params: ImageBlockParams): string {
  const src = `assets/${params.storySlug}/${params.label}.${params.extension}`;
  const label = escapeAttr(params.label);
  return [
    `<div class="twinery-mcp-image" data-label="${label}" style="display:inline-block;margin:0.5em 0;max-width:100%">`,
    `  <img src="${escapeAttr(src)}" alt="${label}" style="max-width:100%;display:block" onerror="this.style.display='none';this.parentNode.querySelector('.twinery-mcp-missing').style.display='inline-block'">`,
    `  <span class="twinery-mcp-missing" style="display:none;padding:0.75em 1.5em;border:2px dashed #888;color:#555;font-family:monospace;background:#f5f5f5;font-size:0.9em">[image missing: ${escapeHtml(params.label)}]</span>`,
    `</div>`,
  ].join("\n");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
