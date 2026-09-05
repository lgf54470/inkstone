import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'


export const baseTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { fontFamily: 'inherit' },
  '.cm-content': { paddingBlock: 'var(--sp-1)' },
  '.cm-line': { paddingInline: 'var(--sp-4)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { border: 'none', background: 'transparent' },
  '.cm-panels': { zIndex: 'var(--z-menu)' },
})

export function editorTheme(): Extension {
  return [baseTheme]
}
