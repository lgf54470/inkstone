import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'

/**
 * Inline markdown for a container's own label: a `::: details` title, a timeline node heading.
 *
 * markdown-it v15's `renderInline` runs the whole core chain over the text it is handed, and the core
 * chain is document-level work: the footnote plugin appends its tail there, and this site's heading
 * collector empties the document's list to refill it from a label that holds no headings. A label is
 * one line of inline content, so it goes through the inline parser and the renderer directly. The
 * document env still travels along, which is what keeps a labelled link resolving inside a title.
 */
export function renderInlineLabel(md: InstanceType<typeof MarkdownIt>, text: string, env: Record<string, unknown>): string {
  const tokens: Token[] = []
  md.inline.parse(text, md, env, tokens)
  return md.renderer.renderInline(tokens, md.options, env)
}
