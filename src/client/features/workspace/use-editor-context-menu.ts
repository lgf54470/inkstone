import { useCallback, useMemo } from 'react'
import type { EditorLayout } from '@shared/types'
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import type { MenuItem } from '../../components/overlay'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { formatMarkdownTable, parseMarkdownTable, type ParsedTable } from '../../lib/markdown/table-editor'
import type { MenuCtx } from './context-menu/types'
import { buildEditorSelectionItems, buildPreviewSelectionItems } from './context-menu/selection'
import { buildEditorTableItems, buildPreviewTableItems } from './context-menu/table'
import { buildImageItems, buildMathItems, buildCodeBlockItems, buildMermaidItems, buildMindmapItems, buildKanbanItems, buildSlidesItems, buildExcalidrawItems } from './context-menu/media'
import { buildChartItems, buildEchartsItems } from './context-menu/charts'
import { buildWikiLinkItems, buildLinkItems, buildFrontmatterItems, buildTaskItems, buildHeadingItems } from './context-menu/structure'
import { buildCommonEditorItems, buildPreviewCanvasItems } from './context-menu/canvas'
import { type ContextToolbarProps } from './context-menu/toolbar'
import type { EditorContextData, PreviewContextData } from './context-menu-detect'

export interface EditorContextMenuProps {
  point: { x: number; y: number } | null
  onClose: () => void
  editorView?: EditorView | null
  editorContext?: EditorContextData | null
  previewContext?: PreviewContextData | null
  content: string
  noteId?: string
  noteTitle?: string
  onEditContent: (next: string) => void
  onJumpToLine: (lineNumber: number) => void
  onPickImage?: () => void
  onPickFile?: () => void
  onSwitchLayout?: (layout: EditorLayout) => void
  currentLayout?: EditorLayout
  previewScrollerRef?: React.RefObject<HTMLDivElement | null>
  onExport?: (format: 'md' | 'html' | 'pdf') => void
  onPresent?: () => void
}

function useRunStateCommand(editorView: EditorView | null | undefined) {
  return useCallback((cmd: (view: EditorView) => boolean) => {
    if (!editorView) return
    cmd(editorView)
    editorView.focus()
  }, [editorView])
}

function useTableActions(editorView: EditorView | null | undefined, content: string, onEditContent: (next: string) => void) {
  const replaceTableInEditor = useCallback((oldTable: ParsedTable, newTable: ParsedTable) => {
    if (!editorView) return
    const doc = editorView.state.doc
    const startPos = doc.line(oldTable.startLine + 1).from
    const endPos = doc.line(oldTable.endLine + 1).to
    editorView.dispatch({
      changes: { from: startPos, to: endPos, insert: formatMarkdownTable(newTable).join('\n') },
      scrollIntoView: true,
    })
    editorView.focus()
  }, [editorView])

  const modifyTableInContent = useCallback((sourceLine: number, modifier: (table: ParsedTable) => ParsedTable) => {
    const lines = content.split('\n')
    const table = parseMarkdownTable(lines, sourceLine)
    if (!table) return
    const updated = modifier(table)
    const newLines = formatMarkdownTable(updated)
    lines.splice(table.startLine, table.endLine - table.startLine + 1, ...newLines)
    onEditContent(lines.join('\n'))
  }, [content, onEditContent])

  return { replaceTableInEditor, modifyTableInContent }
}

function useClipboardActions(editorView: EditorView | null | undefined) {
  const handleCopy = useCallback((text: string) => {
    if (!navigator.clipboard?.writeText) {
      document.execCommand('copy')
      return
    }
    void navigator.clipboard.writeText(text)
  }, [])

  const handlePasteIntoEditor = useCallback(async () => {
    if (!editorView) return
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        if (!text) return
        const range = editorView.state.selection.main
        editorView.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: EditorSelection.cursor(range.from + text.length),
          scrollIntoView: true,
        })
        editorView.focus()
      } catch {
        document.execCommand('paste')
      }
    } else {
      document.execCommand('paste')
    }
  }, [editorView])

  const handleCutFromEditor = useCallback(() => {
    if (!editorView) return
    const range = editorView.state.selection.main
    if (range.empty) return
    const selected = editorView.state.sliceDoc(range.from, range.to)
    handleCopy(selected)
    editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: '' },
      selection: EditorSelection.cursor(range.from),
      scrollIntoView: true,
    })
    editorView.focus()
  }, [editorView, handleCopy])

  return { handleCopy, handlePasteIntoEditor, handleCutFromEditor }
}

function buildPrivateEditorItems(ctx: MenuCtx): MenuItem[] | null {
  return (
    buildEditorSelectionItems(ctx) ??
    buildHeadingItems(ctx) ??
    buildEditorTableItems(ctx) ??
    buildImageItems(ctx) ??
    buildMathItems(ctx) ??
    buildCodeBlockItems(ctx) ??
    buildMermaidItems(ctx) ??
    buildChartItems(ctx) ??
    buildEchartsItems(ctx) ??
    buildMindmapItems(ctx) ??
    buildKanbanItems(ctx) ??
    buildSlidesItems(ctx) ??
    buildExcalidrawItems(ctx) ??
    buildWikiLinkItems(ctx) ??
    buildLinkItems(ctx) ??
    buildFrontmatterItems(ctx) ??
    buildTaskItems(ctx)
  )
}

function buildPrivatePreviewItems(ctx: MenuCtx): MenuItem[] | null {
  return (
    buildPreviewSelectionItems(ctx) ??
    buildHeadingItems(ctx) ??
    buildPreviewTableItems(ctx) ??
    buildImageItems(ctx) ??
    buildMathItems(ctx) ??
    buildCodeBlockItems(ctx) ??
    buildMermaidItems(ctx) ??
    buildChartItems(ctx) ??
    buildEchartsItems(ctx) ??
    buildMindmapItems(ctx) ??
    buildKanbanItems(ctx) ??
    buildSlidesItems(ctx) ??
    buildExcalidrawItems(ctx) ??
    buildWikiLinkItems(ctx) ??
    buildLinkItems(ctx) ??
    buildFrontmatterItems(ctx) ??
    buildTaskItems(ctx)
  )
}

function useToolbarProps(
  ctx: MenuCtx,
  isEditor: boolean,
  hasSelection: boolean,
  onClose: () => void,
): ContextToolbarProps {
  const { editorView, editorContext, previewContext, content, handleCopy, handlePasteIntoEditor, handleCutFromEditor, runStateCommand } = ctx

  const getCopyText = useCallback(() => {
    if (editorContext) {
      if (editorContext.type === 'selection' && editorContext.selectedText) return editorContext.selectedText
      if (editorContext.type === 'codeblock' && editorContext.codeBlock) return editorContext.codeBlock.code
      if (editorContext.type === 'mermaid' && editorContext.mermaid) return editorContext.mermaid.code
      if (editorContext.type === 'chart' && editorContext.chart) return editorContext.chart.code
      if (editorContext.type === 'mindmap' && editorContext.mindmap) return editorContext.mindmap.code
      if (editorContext.type === 'kanban' && editorContext.kanban) return editorContext.kanban.code
      if (editorContext.type === 'slides' && editorContext.slides) return editorContext.slides.code
      if (editorContext.type === 'excalidraw' && editorContext.excalidraw) return editorContext.excalidraw.code
      if (editorContext.type === 'table' && editorContext.table) return formatMarkdownTable(editorContext.table).join('\n')
      if (editorContext.type === 'math' && editorContext.math) return editorContext.math.formula
      if (editorContext.type === 'heading' && editorContext.heading) return editorContext.heading.text
      if (editorContext.type === 'image' && editorContext.image) return editorContext.image.raw || editorContext.image.url
      if (editorContext.type === 'wikilink' && editorContext.wikiLink) return `[[${editorContext.wikiLink.target}]]`
      if (editorContext.type === 'link' && editorContext.link) return editorContext.link.url
      if (editorContext.type === 'frontmatter') {
        const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(content)
        if (match) return match[1]!
      }
      return ''
    }
    if (previewContext) {
      if (previewContext.type === 'selection' && previewContext.selectedText) return previewContext.selectedText
      if (previewContext.type === 'heading' && previewContext.heading) return previewContext.heading.text
      if (previewContext.type === 'codeblock' && previewContext.codeBlock) return previewContext.codeBlock.code
      if (previewContext.type === 'math' && previewContext.math) return previewContext.math.formula
      if (previewContext.type === 'image' && previewContext.image) return previewContext.image.src
      return ''
    }
    return ''
  }, [editorContext, previewContext, content])

  const canCopy = Boolean(
    hasSelection ||
    (editorContext && editorContext.type !== 'empty') ||
    (previewContext && previewContext.type !== 'empty' && getCopyText().length > 0),
  )

  const onCopy = useCallback(() => {
    const text = getCopyText()
    if (text) {
      handleCopy(text)
    }
  }, [handleCopy, getCopyText])

  const canUndo = Boolean(isEditor && editorView && undoDepth(editorView.state) > 0)
  const canRedo = Boolean(isEditor && editorView && redoDepth(editorView.state) > 0)

  return {
    canCut: isEditor && hasSelection,
    onCut: handleCutFromEditor,
    canCopy,
    onCopy,
    canPaste: isEditor,
    onPaste: handlePasteIntoEditor,
    canUndo,
    onUndo: () => {
      if (editorView) runStateCommand(undo)
    },
    canRedo,
    onRedo: () => {
      if (editorView) runStateCommand(redo)
    },
    onClose,
  }
}

export interface EditorContextMenuData {
  toolbarProps: ContextToolbarProps
  menuItems: MenuItem[]
}

export function useEditorContextMenu(props: EditorContextMenuProps): EditorContextMenuData {
  const { editorView, editorContext, previewContext, content, onEditContent, onJumpToLine, onPickImage, onPickFile, onSwitchLayout, currentLayout, previewScrollerRef, onExport, onPresent, onClose } = props
  const openNote = useNotes((s) => s.openNote)
  const createNote = useNotes((s) => s.createNote)
  const setWorkspaceNote = useUi((s) => s.setWorkspaceNote)
  const runStateCommand = useRunStateCommand(editorView)
  const { replaceTableInEditor, modifyTableInContent } = useTableActions(editorView, content, onEditContent)
  const clipboard = useClipboardActions(editorView)

  const ctx = useMemo<MenuCtx>(
    () => ({
      editorView, editorContext, previewContext, content, onEditContent, onJumpToLine,
      onPickImage, onPickFile, onSwitchLayout, currentLayout, previewScrollerRef, onExport, onPresent,
      createNote, openNote, setWorkspaceNote,
      runStateCommand, replaceTableInEditor, modifyTableInContent,
      ...clipboard,
    }),
    [editorView, editorContext, previewContext, content, onEditContent, onJumpToLine, onPickImage, onPickFile, onSwitchLayout, currentLayout, previewScrollerRef, onExport, onPresent, createNote, openNote, setWorkspaceNote, runStateCommand, replaceTableInEditor, modifyTableInContent, clipboard.handleCopy, clipboard.handlePasteIntoEditor, clipboard.handleCutFromEditor],
  )

  const isEditor = Boolean(editorView && !previewContext)
  const hasSelection = Boolean(editorContext?.type === 'selection' && editorContext.selectedText)
  const toolbarProps = useToolbarProps(ctx, isEditor, hasSelection, onClose)

  const menuItems = useMemo<MenuItem[]>(() => {
    if (previewContext) {
      const privateItems = buildPrivatePreviewItems(ctx)
      const commonItems = buildPreviewCanvasItems(ctx)
      if (privateItems && privateItems.length > 0) {
        return [
          ...privateItems,
          ...commonItems.map((item, idx) => (idx === 0 ? { ...item, separatorBefore: true } : item)),
        ]
      }
      return commonItems
    }

    const privateItems = buildPrivateEditorItems(ctx)
    const hasPrivate = Boolean(privateItems && privateItems.length > 0)
    const commonItems = buildCommonEditorItems(ctx, hasPrivate)

    if (hasPrivate) {
      return [...privateItems!, ...commonItems]
    }
    return commonItems
  }, [ctx, previewContext])

  return { toolbarProps, menuItems }
}

export function useEditorMenuItems(props: EditorContextMenuProps): MenuItem[] {
  return useEditorContextMenu(props).menuItems
}