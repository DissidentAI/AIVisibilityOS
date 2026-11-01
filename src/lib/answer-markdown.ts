import type { Element, Root } from "hast";
import { safePublicUrl } from "./public-url";

export type AnswerLink = { end: number; url: string; title: string };
export function safeAnswerUrl(url: string) {
  // Local GFM footnote anchors are also safe. No remote images or raw HTML are rendered.
  return /^#[a-z\d_-]+$/i.test(url) ? url : (safePublicUrl(url)?.href ?? "");
}

/** Attach provider annotations to the closest containing block, never splice Markdown syntax.
 * Positions are offsets into the unchanged source. Markdown-authored links remain ordinary
 * links, distinct from these provider-supplied annotations and the structured citation list.
 */
export function providerAnnotations(options: { textLength: number; links: AnswerLink[] }) {
  return (tree: Root) => {
    const blocks: Element[] = [];
    const visit = (node: Root | Element) => {
      if (node.type === "element" && /^(p|h[1-6]|li|td|th|blockquote)$/.test(node.tagName))
        blocks.push(node);
      for (const child of node.children) if (child.type === "element") visit(child);
    };
    visit(tree);
    const links = options.links
      .filter(
        (l) =>
          Number.isInteger(l.end) &&
          l.end >= 0 &&
          l.end <= options.textLength &&
          safePublicUrl(l.url),
      )
      .sort((a, b) => a.end - b.end);
    for (const [index, link] of links.entries()) {
      const target = blocks
        .filter((node) => {
          const start = node.position?.start.offset,
            end = node.position?.end.offset;
          return start != null && end != null && start <= link.end && end >= link.end;
        })
        .sort(
          (a, b) =>
            a.position!.end.offset! -
            a.position!.start.offset! -
            (b.position!.end.offset! - b.position!.start.offset!),
        )[0];
      const marker: Element = {
        type: "element",
        tagName: "a",
        properties: { href: link.url, title: link.title, className: ["citation-marker"] },
        children: [{ type: "text", value: `[${index + 1}]` }],
      };
      if (target) target.children.push(marker);
      else
        tree.children.push({
          type: "element",
          tagName: "p",
          properties: { className: ["annotation-reference"] },
          children: [marker],
        });
    }
  };
}

export function answerFilename(provider: string, id: string, markdown: boolean) {
  const safe = `${provider}-${id}`.replace(/[^a-z\d-]/gi, "-").slice(0, 100);
  return `ai-visibility-${safe}.${markdown ? "md" : "txt"}`;
}
