import { useCallback, useMemo } from 'react';
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { Menu, type MenuItem } from '../../components/overlay';
import { useUi } from '../../store/ui';
import { useNotes } from '../../store/notes';
import { formatMarkdownTable, parseMarkdownTable, type ParsedTable } from '../../lib/markdown/table-editor';
import { Z_INDEX } from '../../lib/z-index';
import { type EditorContextData, type PreviewContextData } from './context-menu-detect';
import type { MenuCtx } from './context-menu/types';
import {
  buildEditorSelectionItems,
  buildPreviewSelectionItems,
} from './context-menu/selection';
import {
  buildEditorTableItems,
  buildPreviewTableItems,
} from './context-menu/table';
import {
  buildImageItems,
  buildMathItems,
  buildCodeBlockItems,
  buildMermaidItems,
  buildChartItems,
} from './context-menu/media';
import {
  buildWikiLinkItems,
  buildLinkItems,
  buildFrontmatterItems,
  buildTaskItems,
} from './context-menu/structure';
import {
  buildEditorBlankItems,
  buildPreviewCanvasItems,
} from './context-menu/canvas';

export interface EditorContextMenuProps {
  point: { x: number; y: number } | null;
  onClose: () => void;
  editorView?: EditorView | null;
  editorContext?: EditorContextData | null;
  previewContext?: PreviewContextData | null;
  content: string;
  noteId?: string;
  noteTitle?: string;
  onEditContent: (next: string) => void;
  onJumpToLine: (lineNumber: number) => void;
  onPickImage?: () => void;
  onPickFile?: () => void;
  onSwitchLayout?: (layout: 'edit' | 'split' | 'preview') => void;
  currentLayout?: 'edit' | 'split' | 'preview';
  previewScrollerRef?: React.RefObject<HTMLDivElement | null>;
  onExport?: (format: 'md' | 'html' | 'pdf') => void;
}

export function EditorContextMenu({
  point,
  onClose,
  editorView,
  editorContext,
  previewContext,
  content,
  onEditContent,
  onJumpToLine,
  onPickImage,
  onPickFile,
  onSwitchLayout,
  currentLayout,
  previewScrollerRef,
  onExport,
}: EditorContextMenuProps) {
  const openNote = useNotes((s) => s.openNote);
  const createNote = useNotes((s) => s.createNote);
  const setWorkspaceNote = useUi((s) => s.setWorkspaceNote);

  const runStateCommand = useCallback(
    (cmd: (view: EditorView) => boolean) => {
      if (!editorView) return;
      cmd(editorView);
      editorView.focus();
    },
    [editorView],
  );

  const replaceTableInEditor = useCallback(
    (oldTable: ParsedTable, newTable: ParsedTable) => {
      if (!editorView) return;
      const doc = editorView.state.doc;
      const startPos = doc.line(oldTable.startLine + 1).from;
      const endPos = doc.line(oldTable.endLine + 1).to;
      const newLines = formatMarkdownTable(newTable).join('\n');
      editorView.dispatch({
        changes: { from: startPos, to: endPos, insert: newLines },
        scrollIntoView: true,
      });
      editorView.focus();
    },
    [editorView],
  );

  const modifyTableInContent = useCallback(
    (sourceLine: number, modifier: (table: ParsedTable) => ParsedTable) => {
      const lines = content.split('\n');
      const table = parseMarkdownTable(lines, sourceLine);
      if (!table) return;
      const updated = modifier(table);
      const newLines = formatMarkdownTable(updated);
      lines.splice(table.startLine, table.endLine - table.startLine + 1, ...newLines);
      onEditContent(lines.join('\n'));
    },
    [content, onEditContent],
  );

  const handleCopy = useCallback((text: string) => {
    if (!navigator.clipboard?.writeText) {
      document.execCommand('copy');
      return;
    }
    void navigator.clipboard.writeText(text);
  }, []);

  const handlePasteIntoEditor = useCallback(() => {
    if (!editorView) return;
    if (navigator.clipboard?.readText) {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (!text) return;
          const range = editorView.state.selection.main;
          editorView.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: EditorSelection.cursor(range.from + text.length),
            scrollIntoView: true,
          });
          editorView.focus();
        })
        .catch(() => {
          document.execCommand('paste');
        });
    } else {
      document.execCommand('paste');
    }
  }, [editorView]);

  const handleCutFromEditor = useCallback(() => {
    if (!editorView) return;
    const range = editorView.state.selection.main;
    if (range.empty) return;
    const selected = editorView.state.sliceDoc(range.from, range.to);
    handleCopy(selected);
    editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: '' },
      selection: EditorSelection.cursor(range.from),
      scrollIntoView: true,
    });
    editorView.focus();
  }, [editorView, handleCopy]);

  const ctx = useMemo<MenuCtx>(
    () => ({
      editorView,
      editorContext,
      previewContext,
      content,
      onEditContent,
      onJumpToLine,
      onPickImage,
      onPickFile,
      onSwitchLayout,
      currentLayout,
      previewScrollerRef,
      onExport,
      createNote,
      openNote,
      setWorkspaceNote,
      runStateCommand,
      replaceTableInEditor,
      modifyTableInContent,
      handleCopy,
      handlePasteIntoEditor,
      handleCutFromEditor,
    }),
    [
      editorView,
      editorContext,
      previewContext,
      content,
      onEditContent,
      onJumpToLine,
      onPickImage,
      onPickFile,
      onSwitchLayout,
      currentLayout,
      previewScrollerRef,
      onExport,
      createNote,
      openNote,
      setWorkspaceNote,
      runStateCommand,
      replaceTableInEditor,
      modifyTableInContent,
      handleCopy,
      handlePasteIntoEditor,
      handleCutFromEditor,
    ],
  );

  const items = useMemo<MenuItem[]>(
    () =>
      buildEditorSelectionItems(ctx) ??
      buildPreviewSelectionItems(ctx) ??
      buildEditorTableItems(ctx) ??
      buildPreviewTableItems(ctx) ??
      buildImageItems(ctx) ??
      buildMathItems(ctx) ??
      buildCodeBlockItems(ctx) ??
      buildMermaidItems(ctx) ??
      buildChartItems(ctx) ??
      buildWikiLinkItems(ctx) ??
      buildLinkItems(ctx) ??
      buildFrontmatterItems(ctx) ??
      buildTaskItems(ctx) ??
      buildEditorBlankItems(ctx) ??
      buildPreviewCanvasItems(ctx),
    [ctx],
  );

  if (!point || items.length === 0) return null;

  return (
    <Menu
      anchor={point}
      open={Boolean(point)}
      onClose={onClose}
      items={items}
      width={216}
      zIndex={Z_INDEX.hoverPinned}
    />
  );
}
