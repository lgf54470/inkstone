import type { EditorView } from '@codemirror/view'

/**
 * The one write every block menu shares: replace the fenced block the menu was opened on with a new
 * fence of the same language, body included.
 *
 * It lives beside the menus rather than inside one of them because the diagram families and the chart
 * families all offer the same gesture — swap this block's body for a template's — and a menu that
 * rewrote the fence by hand would drift from the one next to it on the first edit to either.
 */

function applyTemplateFlow(editorView: EditorView, from: number, to: number, blockLang: string, text: string) {
  editorView.dispatch({ changes: { from, to, insert: '```' + blockLang + '\n' + text + '\n```' } })
}

/** One menu item per template, each replacing the block the menu was opened on. */
export function buildTemplateItems(editorView: EditorView | null | undefined, from: number, to: number, blockLang: string, templates: { id: string; label: string; text: string }[]) {
  return templates.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    onSelect: () => {
      if (!editorView) return
      applyTemplateFlow(editorView, from, to, blockLang, tpl.text)
    },
  }))
}
