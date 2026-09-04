import type { EditorView } from '@codemirror/view';
import type { RefObject } from 'react';
import type { ParsedTable } from '../../lib/markdown/table-editor';
import type { NotesState } from '../../store/notes/model';
import type { WorkspacePane } from '../../store/ui';
import type { EditorContextData, PreviewContextData } from './context-menu-detect';

/**
 * Everything an EditorContextMenu item builder can read or trigger.
 * Assembled once per render by the `EditorContextMenu` component and handed to
 * the per-context builder modules so each branch stays a pure function of the
 * menu state (decoupled from the component's hooks and DOM plumbing).
 */
export interface MenuCtx {
  editorView?: EditorView | null;
  editorContext?: EditorContextData | null;
  previewContext?: PreviewContextData | null;
  content: string;
  onEditContent: (next: string) => void;
  onJumpToLine: (lineNumber: number) => void;
  onPickImage?: () => void;
  onPickFile?: () => void;
  onSwitchLayout?: (layout: 'edit' | 'split' | 'preview') => void;
  currentLayout?: 'edit' | 'split' | 'preview';
  previewScrollerRef?: RefObject<HTMLDivElement | null>;
  onExport?: (format: 'md' | 'html' | 'pdf') => void;
  createNote: NotesState['createNote'];
  openNote: NotesState['openNote'];
  setWorkspaceNote: (pane: WorkspacePane, id: string | null, activate?: boolean) => void;
  runStateCommand: (cmd: (view: EditorView) => boolean) => void;
  replaceTableInEditor: (oldTable: ParsedTable, newTable: ParsedTable) => void;
  modifyTableInContent: (sourceLine: number, modifier: (table: ParsedTable) => ParsedTable) => void;
  handleCopy: (text: string) => void;
  handlePasteIntoEditor: () => void;
  handleCutFromEditor: () => void;
}
