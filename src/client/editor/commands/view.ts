import type { EditorView } from '@codemirror/view';


export let activeEditorView: EditorView | null = null


export function setActiveEditorView(view: EditorView | null): void {
    activeEditorView = view
}


export function getActiveEditorView(): EditorView | null {
    return activeEditorView
}
