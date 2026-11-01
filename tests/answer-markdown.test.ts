import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, test } from "vitest";
import { answerFilename, providerAnnotations, safeAnswerUrl } from "../src/lib/answer-markdown";
describe("safe formatted evidence", () => {
  test("formats Markdown without changing source offsets or turning authored links into citations", () => {
    const text =
      "## Heading\n\n**Karburo** and a [link](https://example.com).\n\n| Brand | Mentions |\n| --- | --- |\n| Karburo | 2 |";
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        children: text,
        remarkPlugins: [remarkGfm],
        skipHtml: true,
        urlTransform: safeAnswerUrl,
        rehypePlugins: [
          [
            providerAnnotations,
            {
              textLength: text.length,
              links: [
                {
                  end: text.indexOf(" and"),
                  url: "https://example.com/source",
                  title: "Provider source",
                },
              ],
            },
          ],
        ],
      }),
    );
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>Karburo</strong>");
    expect(html).toContain("<table>");
    expect(html.match(/citation-marker/g)).toHaveLength(1);
    expect(html).toContain('title="Provider source"');
    expect(text).toContain("**Karburo**");
  });
  test("rejects unsafe links and invalid annotations; filenames cannot contain a path or prompt", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://localhost/test",
      "https://user:pass@example.com",
    ])
      expect(safeAnswerUrl(value)).toBe("");
    expect(safeAnswerUrl("#user-content-fn-1")).toBe("#user-content-fn-1");
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        children: "**Safe**<script>alert(1)</script> [unsafe](javascript:alert%281%29)",
        skipHtml: true,
        urlTransform: safeAnswerUrl,
      }),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(answerFilename("mimo", "../../unsafe", true)).toBe("ai-visibility-mimo-------unsafe.md");
  });
});
