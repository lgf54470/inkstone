import { useCallback, useMemo } from 'react';
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart2,
  Bold,
  BookOpen,
  Braces,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Columns2,
  ArrowDownUp,
  ArrowUpAZ,
  ArrowDownAZ,
  Copy,
  CopyPlus,
  HelpCircle,
  Download,
  Eraser,
  ExternalLink,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Maximize2,
  Minus,
  Network,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Rows,
  Scissors,
  Sigma,
  Smile,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { Menu, type MenuItem } from '../../components/overlay';
import { Kbd } from '../../components/primitives';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { useUi } from '../../store/ui';
import { useNotes } from '../../store/notes';
import { findNoteByTitle } from '../../store/notes/selectors';
import { preferredScrollBehavior } from '../../lib/motion';
import {
  clearTableCell,
  clearTableRow,
  deleteEntireTableInText,
  deleteTableColumn,
  deleteTableRow,
  duplicateTableRow,
  formatMarkdownTable,
  insertTableColumn,
  insertTableRow,
  parseMarkdownTable,
  setColumnAlignment,
  sortTableRowByColumn,
  tableToCsv,
  type ParsedTable,
} from '../../lib/markdown/table-editor';
import { formatCode } from '../../lib/markdown/code-formatter';
import {
  insertAdvancedCodeBlock,
  insertCallout,
  insertCodeBlock,
  insertDetails,
  insertFrontMatter,
  insertHorizontalRule,
  insertLink,
  insertDiagramCode,
  CHARTJS_TEMPLATES,
  COMMON_EMOJIS,
  MERMAID_TEMPLATES,
  insertAbbreviation,
  insertDefinitionList,
  insertEmoji,
  insertNoteTemplate,
  insertRuby,
  insertRunnableJsBlock,
  insertTable,
  insertTableOfContents,
  insertTabs,
  insertTaskWithStatus,
  setHeading,
  toggleBold,
  toggleBulletList,
  toggleHighlight,
  toggleInlineCode,
  toggleInlineMath,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  toggleStrikethrough,
  toggleUnderline,
  toggleSubscript,
  toggleSuperscript,
  toggleTaskDone,
  toggleTaskList,
  toggleWikiLink,
} from '../../editor/commands';
import type { EditorContextData, PreviewContextData } from './context-menu-detect';

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

  const items = useMemo<MenuItem[]>(() => {
    if (editorContext && editorContext.type === 'selection' && editorContext.selectedText) {
      const selected = editorContext.selectedText;
      return [
        {
          id: 'cut',
          label: t('contextmenu.cut'),
          icon: <Scissors size={14} />,
          combo: 'mod+x',
          onSelect: handleCutFromEditor,
        },
        {
          id: 'copy',
          label: t('contextmenu.copy'),
          icon: <Copy size={14} />,
          combo: 'mod+c',
          onSelect: () => handleCopy(selected),
        },
        {
          id: 'paste',
          label: t('contextmenu.paste'),
          icon: <Copy size={14} className="rotate-90" />,
          combo: 'mod+v',
          onSelect: handlePasteIntoEditor,
        },
        {
          id: 'format-sub',
          label: t('contextmenu.format'),
          icon: <Highlighter size={14} />,
          separatorBefore: true,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                { id: 'bold', label: t('common.bold'), icon: <Bold size={13} />, combo: 'mod+b', onSelect: () => runStateCommand(toggleBold) },
                { id: 'italic', label: t('common.italic'), icon: <Italic size={13} />, combo: 'mod+i', onSelect: () => runStateCommand(toggleItalic) },
                { id: 'strikethrough', label: t('common.strikethrough'), icon: <Strikethrough size={13} />, combo: 'mod+shift+x', onSelect: () => runStateCommand(toggleStrikethrough) },
                { id: 'underline', label: t('common.underline'), icon: <Underline size={13} />, combo: 'mod+u', onSelect: () => runStateCommand(toggleUnderline) },
                { id: 'highlight', label: t('common.highlight'), icon: <Highlighter size={13} />, combo: 'mod+shift+h', onSelect: () => runStateCommand(toggleHighlight) },
                { id: 'subscript', label: t('workspace.subscript'), icon: <Subscript size={13} />, onSelect: () => runStateCommand(toggleSubscript) },
                { id: 'superscript', label: t('workspace.superscript'), icon: <Superscript size={13} />, onSelect: () => runStateCommand(toggleSuperscript) },
                { id: 'ruby', label: t('workspace.ruby_annotation'), icon: <Languages size={13} />, onSelect: () => runStateCommand(insertRuby) },
                { id: 'code', label: t('common.inline_code'), icon: <FileCode size={13} />, combo: 'mod+e', onSelect: () => runStateCommand(toggleInlineCode) },
                { id: 'math', label: t('workspace.inline_math'), icon: <Sigma size={13} />, onSelect: () => runStateCommand(toggleInlineMath) },
              ]}
            />
          ),
        },
        {
          id: 'headings-sub',
          label: t('contextmenu.headings'),
          icon: <Heading size={14} />,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[1, 2, 3, 4, 5, 6].map((lvl) => ({
                id: `h${lvl}`,
                label: t('workspace.heading_value0', { value0: lvl }),
                combo: `mod+${lvl}`,
                onSelect: () => runStateCommand(setHeading(lvl)),
              }))}
            />
          ),
        },
        {
          id: 'lists-sub',
          label: t('contextmenu.lists_quotes'),
          icon: <List size={14} />,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                { id: 'bullet', label: t('common.unordered_list'), icon: <List size={13} />, combo: 'mod+shift+8', onSelect: () => runStateCommand(toggleBulletList) },
                { id: 'ordered', label: t('common.ordered_list'), icon: <ListOrdered size={13} />, combo: 'mod+shift+7', onSelect: () => runStateCommand(toggleOrderedList) },
                { id: 'task', label: t('common.task_list'), icon: <ListTodo size={13} />, combo: 'mod+shift+9', onSelect: () => runStateCommand(toggleTaskList) },
                { id: 'quote', label: t('common.quote'), icon: <Quote size={13} />, combo: 'mod+shift+.', onSelect: () => runStateCommand(toggleQuote) },
                { id: 'callout', label: t('workspace.callout'), icon: <Sparkles size={13} />, onSelect: () => runStateCommand(insertCallout) },
              ]}
            />
          ),
        },
        {
          id: 'convert-sub',
          label: t('contextmenu.convert_to'),
          icon: <Link2 size={14} />,
          separatorBefore: true,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                { id: 'link', label: t('contextmenu.convert_to_link'), icon: <Link2 size={13} />, onSelect: () => runStateCommand(insertLink()) },
                { id: 'wikilink', label: t('contextmenu.convert_to_wikilink'), icon: <Network size={13} />, onSelect: () => runStateCommand(toggleWikiLink) },
                { id: 'codeblock', label: t('contextmenu.convert_to_codeblock'), icon: <Braces size={13} />, onSelect: () => runStateCommand(insertCodeBlock) },
              ]}
            />
          ),
        },
      ];
    }

    if (previewContext && previewContext.type === 'selection' && previewContext.selectedText) {
      const selected = previewContext.selectedText;
      return [
        {
          id: 'copy',
          label: t('contextmenu.copy'),
          icon: <Copy size={14} />,
          combo: 'mod+c',
          onSelect: () => handleCopy(selected),
        },
        {
          id: 'preview-locate',
          label: t('contextmenu.preview_jump_to_editor'),
          icon: <Pencil size={14} />,
          separatorBefore: true,
          onSelect: () => {
            if (previewContext.sourceLine !== undefined) {
              onJumpToLine(previewContext.sourceLine);
            } else {
              const idx = content.indexOf(selected);
              if (idx >= 0) {
                const line = content.slice(0, idx).split('\n').length - 1;
                onJumpToLine(line);
              }
            }
          },
        },
        {
          id: 'create-from-selection',
          label: t('contextmenu.preview_create_note_from_selection'),
          icon: <Plus size={14} />,
          onSelect: () => {
            void createNote({ title: selected, open: true });
          },
        },
      ];
    }

    if (editorContext?.type === 'table' && editorContext.table) {
      const table = editorContext.table;
      return [
        {
          id: 'insert-row-above',
          label: t('contextmenu.table_insert_row_above'),
          icon: <Rows size={14} />,
          onSelect: () => replaceTableInEditor(table, insertTableRow(table, table.cursorRowIndex, 'above')),
        },
        {
          id: 'insert-row-below',
          label: t('contextmenu.table_insert_row_below'),
          icon: <Rows size={14} />,
          onSelect: () => replaceTableInEditor(table, insertTableRow(table, table.cursorRowIndex, 'below')),
        },
        {
          id: 'duplicate-row',
          label: t('contextmenu.table_duplicate_row'),
          icon: <CopyPlus size={14} />,
          disabled: table.cursorRowIndex < 0,
          onSelect: () => replaceTableInEditor(table, duplicateTableRow(table, table.cursorRowIndex)),
        },
        {
          id: 'delete-row',
          label: t('contextmenu.table_delete_row'),
          icon: <Trash2 size={14} />,
          onSelect: () => replaceTableInEditor(table, deleteTableRow(table, table.cursorRowIndex)),
        },
        {
          id: 'insert-col-left',
          label: t('contextmenu.table_insert_col_left'),
          icon: <Plus size={14} />,
          separatorBefore: true,
          onSelect: () => replaceTableInEditor(table, insertTableColumn(table, table.cursorColIndex, 'left')),
        },
        {
          id: 'insert-col-right',
          label: t('contextmenu.table_insert_col_right'),
          icon: <Plus size={14} />,
          onSelect: () => replaceTableInEditor(table, insertTableColumn(table, table.cursorColIndex, 'right')),
        },
        {
          id: 'delete-col',
          label: t('contextmenu.table_delete_col'),
          icon: <Trash2 size={14} />,
          disabled: table.columnCount <= 1,
          onSelect: () => replaceTableInEditor(table, deleteTableColumn(table, table.cursorColIndex)),
        },
        {
          id: 'align-sub',
          label: t('contextmenu.table_align'),
          icon: <AlignCenter size={14} />,
          separatorBefore: true,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                {
                  id: 'align-left',
                  label: t('contextmenu.table_align_left'),
                  icon: <AlignLeft size={13} />,
                  checked: table.alignments[table.cursorColIndex] === 'left',
                  onSelect: () => replaceTableInEditor(table, setColumnAlignment(table, table.cursorColIndex, 'left')),
                },
                {
                  id: 'align-center',
                  label: t('contextmenu.table_align_center'),
                  icon: <AlignCenter size={13} />,
                  checked: table.alignments[table.cursorColIndex] === 'center',
                  onSelect: () => replaceTableInEditor(table, setColumnAlignment(table, table.cursorColIndex, 'center')),
                },
                {
                  id: 'align-right',
                  label: t('contextmenu.table_align_right'),
                  icon: <AlignRight size={13} />,
                  checked: table.alignments[table.cursorColIndex] === 'right',
                  onSelect: () => replaceTableInEditor(table, setColumnAlignment(table, table.cursorColIndex, 'right')),
                },
                {
                  id: 'align-default',
                  label: t('contextmenu.table_align_default'),
                  icon: <Minus size={13} />,
                  checked: table.alignments[table.cursorColIndex] === 'default',
                  onSelect: () => replaceTableInEditor(table, setColumnAlignment(table, table.cursorColIndex, 'default')),
                },
              ]}
            />
          ),
        },
        {
          id: 'sort-sub',
          label: t('contextmenu.table_sort'),
          icon: <ArrowDownUp size={14} />,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                {
                  id: 'sort-asc',
                  label: t('contextmenu.table_sort_asc'),
                  icon: <ArrowUpAZ size={13} />,
                  onSelect: () => replaceTableInEditor(table, sortTableRowByColumn(table, table.cursorColIndex, 'asc')),
                },
                {
                  id: 'sort-desc',
                  label: t('contextmenu.table_sort_desc'),
                  icon: <ArrowDownAZ size={13} />,
                  onSelect: () => replaceTableInEditor(table, sortTableRowByColumn(table, table.cursorColIndex, 'desc')),
                },
              ]}
            />
          ),
        },
        {
          id: 'clear-cell',
          label: t('contextmenu.table_clear_cell'),
          icon: <Eraser size={14} />,
          separatorBefore: true,
          onSelect: () => replaceTableInEditor(table, clearTableCell(table, table.cursorRowIndex, table.cursorColIndex)),
        },
        {
          id: 'clear-row',
          label: t('contextmenu.table_clear_row'),
          icon: <Eraser size={14} />,
          onSelect: () => replaceTableInEditor(table, clearTableRow(table, table.cursorRowIndex)),
        },
        {
          id: 'format-table',
          label: t('contextmenu.table_format'),
          icon: <FileSpreadsheet size={14} />,
          separatorBefore: true,
          onSelect: () => replaceTableInEditor(table, { ...table }),
        },
        {
          id: 'copy-markdown',
          label: t('contextmenu.table_copy_markdown'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(formatMarkdownTable(table).join('\n')),
        },
        {
          id: 'copy-csv',
          label: t('contextmenu.table_copy_csv'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(tableToCsv(table)),
        },
        {
          id: 'delete-table',
          label: t('contextmenu.table_delete'),
          icon: <Trash2 size={14} />,
          tone: 'danger',
          separatorBefore: true,
          onSelect: () => {
            if (!editorView) return;
            const doc = editorView.state.doc;
            const from = doc.line(table.startLine + 1).from;
            const to = Math.min(doc.length, doc.line(table.endLine + 1).to + 1);
            editorView.dispatch({ changes: { from, to, insert: '' } });
          },
        },
      ];
    }

    if (previewContext?.type === 'table' && previewContext.table) {
      const pTable = previewContext.table;
      const sLine = pTable.sourceLine ?? 0;
      const dataRowIndex = pTable.rowIndex > 0 ? pTable.rowIndex - 1 : 0;
      return [
        {
          id: 'jump-to-editor',
          label: t('contextmenu.table_jump_to_editor'),
          icon: <Pencil size={14} />,
          onSelect: () => onJumpToLine(sLine),
        },
        {
          id: 'insert-row-above',
          label: t('contextmenu.table_insert_row_above'),
          icon: <Rows size={14} />,
          separatorBefore: true,
          onSelect: () => modifyTableInContent(sLine, (tbl) => insertTableRow(tbl, dataRowIndex, 'above')),
        },
        {
          id: 'insert-row-below',
          label: t('contextmenu.table_insert_row_below'),
          icon: <Rows size={14} />,
          onSelect: () => modifyTableInContent(sLine, (tbl) => insertTableRow(tbl, dataRowIndex, 'below')),
        },
        {
          id: 'duplicate-row',
          label: t('contextmenu.table_duplicate_row'),
          icon: <CopyPlus size={14} />,
          disabled: pTable.rowIndex === 0,
          onSelect: () => modifyTableInContent(sLine, (tbl) => duplicateTableRow(tbl, dataRowIndex)),
        },
        {
          id: 'delete-row',
          label: t('contextmenu.table_delete_row'),
          icon: <Trash2 size={14} />,
          disabled: pTable.rowIndex === 0,
          onSelect: () => modifyTableInContent(sLine, (tbl) => deleteTableRow(tbl, dataRowIndex)),
        },
        {
          id: 'insert-col-left',
          label: t('contextmenu.table_insert_col_left'),
          icon: <Plus size={14} />,
          separatorBefore: true,
          onSelect: () => modifyTableInContent(sLine, (tbl) => insertTableColumn(tbl, pTable.colIndex, 'left')),
        },
        {
          id: 'insert-col-right',
          label: t('contextmenu.table_insert_col_right'),
          icon: <Plus size={14} />,
          onSelect: () => modifyTableInContent(sLine, (tbl) => insertTableColumn(tbl, pTable.colIndex, 'right')),
        },
        {
          id: 'delete-col',
          label: t('contextmenu.table_delete_col'),
          icon: <Trash2 size={14} />,
          onSelect: () => modifyTableInContent(sLine, (tbl) => deleteTableColumn(tbl, pTable.colIndex)),
        },
        {
          id: 'align-sub-preview',
          label: t('contextmenu.table_align'),
          icon: <AlignCenter size={14} />,
          separatorBefore: true,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                {
                  id: 'align-left-prev',
                  label: t('contextmenu.table_align_left'),
                  icon: <AlignLeft size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => setColumnAlignment(tbl, pTable.colIndex, 'left')),
                },
                {
                  id: 'align-center-prev',
                  label: t('contextmenu.table_align_center'),
                  icon: <AlignCenter size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => setColumnAlignment(tbl, pTable.colIndex, 'center')),
                },
                {
                  id: 'align-right-prev',
                  label: t('contextmenu.table_align_right'),
                  icon: <AlignRight size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => setColumnAlignment(tbl, pTable.colIndex, 'right')),
                },
                {
                  id: 'align-default-prev',
                  label: t('contextmenu.table_align_default'),
                  icon: <Minus size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => setColumnAlignment(tbl, pTable.colIndex, 'default')),
                },
              ]}
            />
          ),
        },
        {
          id: 'sort-sub-preview',
          label: t('contextmenu.table_sort'),
          icon: <ArrowDownUp size={14} />,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              items={[
                {
                  id: 'sort-asc-prev',
                  label: t('contextmenu.table_sort_asc'),
                  icon: <ArrowUpAZ size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => sortTableRowByColumn(tbl, pTable.colIndex, 'asc')),
                },
                {
                  id: 'sort-desc-prev',
                  label: t('contextmenu.table_sort_desc'),
                  icon: <ArrowDownAZ size={13} />,
                  onSelect: () => modifyTableInContent(sLine, (tbl) => sortTableRowByColumn(tbl, pTable.colIndex, 'desc')),
                },
              ]}
            />
          ),
        },
        {
          id: 'clear-cell-prev',
          label: t('contextmenu.table_clear_cell'),
          icon: <Eraser size={14} />,
          separatorBefore: true,
          onSelect: () => modifyTableInContent(sLine, (tbl) => clearTableCell(tbl, pTable.rowIndex === 0 ? -1 : dataRowIndex, pTable.colIndex)),
        },
        {
          id: 'clear-row-prev',
          label: t('contextmenu.table_clear_row'),
          icon: <Eraser size={14} />,
          onSelect: () => modifyTableInContent(sLine, (tbl) => clearTableRow(tbl, pTable.rowIndex === 0 ? -1 : dataRowIndex)),
        },
        {
          id: 'format-table-prev',
          label: t('contextmenu.table_format'),
          icon: <FileSpreadsheet size={14} />,
          separatorBefore: true,
          onSelect: () => modifyTableInContent(sLine, (tbl) => ({ ...tbl })),
        },
        {
          id: 'copy-markdown-prev',
          label: t('contextmenu.table_copy_markdown'),
          icon: <Copy size={14} />,
          onSelect: () => {
            const lines = content.split('\n');
            const tbl = parseMarkdownTable(lines, sLine);
            if (tbl) handleCopy(formatMarkdownTable(tbl).join('\n'));
          },
        },
        {
          id: 'copy-csv-prev',
          label: t('contextmenu.table_copy_csv'),
          icon: <Copy size={14} />,
          onSelect: () => {
            const lines = content.split('\n');
            const tbl = parseMarkdownTable(lines, sLine);
            if (tbl) handleCopy(tableToCsv(tbl));
          },
        },
        {
          id: 'delete-table-prev',
          label: t('contextmenu.table_delete'),
          icon: <Trash2 size={14} />,
          tone: 'danger',
          separatorBefore: true,
          onSelect: () => {
            onEditContent(deleteEntireTableInText(content, sLine));
          },
        },
      ];
    }

    if (editorContext?.type === 'image' || previewContext?.type === 'image') {
      const src = previewContext?.image?.src ?? editorContext?.image?.url ?? '';
      const alt = previewContext?.image?.alt ?? editorContext?.image?.alt ?? '';
      return [
        {
          id: 'preview-lightbox',
          label: t('contextmenu.image_preview'),
          icon: <Maximize2 size={14} />,
          onSelect: () => useUi.getState().setLightbox({ src, alt }),
        },
        {
          id: 'copy-image-url',
          label: t('contextmenu.image_copy_url'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(src),
        },
        {
          id: 'copy-image-md',
          label: t('contextmenu.image_copy_markdown'),
          icon: <FileText size={14} />,
          onSelect: () => handleCopy(`![${alt}](${src})`),
        },
        ...(previewContext
          ? [
              {
                id: 'jump-image',
                label: t('contextmenu.image_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
        ...(editorContext?.image
          ? [
              {
                id: 'delete-image',
                label: t('contextmenu.image_delete'),
                icon: <Trash2 size={14} />,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: () => {
                  if (!editorView || !editorContext.image) return;
                  editorView.dispatch({
                    changes: { from: editorContext.image.from, to: editorContext.image.to, insert: '' },
                  });
                },
              },
            ]
          : []),
      ];
    }

    const mathData = editorContext?.math ?? previewContext?.math;
    if (editorContext?.type === 'math' || previewContext?.type === 'math') {
      const formula = mathData?.formula ?? '';
      return [
        {
          id: 'copy-latex',
          label: t('contextmenu.math_copy_latex'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(formula),
        },
        ...(editorContext?.math
          ? [
              {
                id: 'toggle-block-math',
                label: t('contextmenu.math_toggle_block'),
                icon: <Sigma size={14} />,
                onSelect: () => {
                  if (!editorView || !editorContext.math) return;
                  const { formula, isBlock, from, to } = editorContext.math;
                  const replacement = isBlock ? `$${formula.trim()}$` : `$$\n${formula.trim()}\n$$\n`;
                  editorView.dispatch({ changes: { from, to, insert: replacement } });
                },
              },
              {
                id: 'delete-math',
                label: t('contextmenu.math_delete'),
                icon: <Trash2 size={14} />,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: () => {
                  if (!editorView || !editorContext.math) return;
                  editorView.dispatch({ changes: { from: editorContext.math.from, to: editorContext.math.to, insert: '' } });
                },
              },
            ]
          : []),
        ...(previewContext
          ? [
              {
                id: 'jump-math',
                label: t('contextmenu.math_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    const codeData = editorContext?.codeBlock ?? previewContext?.codeBlock;
    if (editorContext?.type === 'codeblock' || previewContext?.type === 'codeblock') {
      const code = codeData?.code ?? '';
      const languages = [
        'typescript',
        'javascript',
        'python',
        'bash',
        'json',
        'html',
        'css',
        'markdown',
        'sql',
        'rust',
        'go',
      ];
      return [
        {
          id: 'copy-code',
          label: t('contextmenu.code_copy'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(code),
        },
        ...(editorContext?.codeBlock
          ? [
              {
                id: 'format-code',
                label: t('contextmenu.code_format'),
                icon: <Sparkles size={14} />,
                onSelect: () => {
                  if (!editorView || !editorContext.codeBlock) return;
                  const cb = editorContext.codeBlock;
                  const formatted = formatCode(cb.code, cb.language);
                  const doc = editorView.state.doc;
                  const startLine = doc.lineAt(cb.from);
                  const endLine = doc.lineAt(cb.to);
                  const fenceStart = startLine.text;
                  const fenceEnd = endLine.text;
                  const newBlock = `${fenceStart}\n${formatted}\n${fenceEnd}`;
                  editorView.dispatch({
                    changes: { from: startLine.from, to: endLine.to, insert: newBlock },
                    scrollIntoView: true,
                  });
                },
              },
              {
                id: 'select-code',
                label: t('contextmenu.code_select'),
                icon: <CheckSquare size={14} />,
                onSelect: () => {
                  if (!editorView || !editorContext.codeBlock) return;
                  editorView.dispatch({
                    selection: EditorSelection.range(editorContext.codeBlock.from, editorContext.codeBlock.to),
                  });
                },
              },
              {
                id: 'change-lang-sub',
                label: t('contextmenu.code_change_lang'),
                icon: <FileCode size={14} />,
                separatorBefore: true,
                submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={closeMenu}
                    items={languages.map((lang) => ({
                      id: `lang-${lang}`,
                      label: lang,
                      checked: editorContext.codeBlock?.language.toLowerCase() === lang,
                      onSelect: () => {
                        if (!editorView || !editorContext.codeBlock) return;
                        const firstLine = editorView.state.doc.lineAt(editorContext.codeBlock.from);
                        editorView.dispatch({
                          changes: { from: firstLine.from, to: firstLine.to, insert: '```' + lang },
                        });
                      },
                    }))}
                  />
                ),
              },
              {
                id: 'delete-codeblock',
                label: t('contextmenu.code_delete'),
                icon: <Trash2 size={14} />,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: () => {
                  if (!editorView || !editorContext.codeBlock) return;
                  editorView.dispatch({
                    changes: { from: editorContext.codeBlock.from, to: editorContext.codeBlock.to, insert: '' },
                  });
                },
              },
            ]
          : []),
        ...(previewContext?.codeBlock
          ? [
              {
                id: 'format-code-preview',
                label: t('contextmenu.code_format'),
                icon: <Sparkles size={14} />,
                onSelect: () => {
                  const sLine = previewContext.sourceLine ?? 0;
                  const lines = content.split('\n');
                  const cb = previewContext.codeBlock;
                  if (!cb) return;
                  const formatted = formatCode(cb.code, cb.language);
                  let openLine = -1;
                  for (let i = sLine; i >= 0; i--) {
                    if (/^\s*(`{3,}|~{3,})/.test(lines[i] ?? '')) {
                      openLine = i;
                      break;
                    }
                  }
                  if (openLine === -1) return;
                  let closeLine = -1;
                  for (let i = openLine + 1; i < lines.length; i++) {
                    if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[i] ?? '')) {
                      closeLine = i;
                      break;
                    }
                  }
                  if (closeLine === -1) return;
                  const newLines = [lines[openLine]!, ...formatted.split('\n'), lines[closeLine]!];
                  lines.splice(openLine, closeLine - openLine + 1, ...newLines);
                  onEditContent(lines.join('\n'));
                },
              },
              {
                id: 'jump-code',
                label: t('contextmenu.code_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    const mermaidData = editorContext?.mermaid ?? previewContext?.mermaid;
    if (editorContext?.type === 'mermaid' || previewContext?.type === 'mermaid') {
      const code = mermaidData?.code ?? '';
      const templates = MERMAID_TEMPLATES.map((tpl) => ({
        id: tpl.id,
        label: t(tpl.labelKey),
        text: tpl.code,
      }));
      return [
        {
          id: 'copy-mermaid',
          label: t('contextmenu.mermaid_copy'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(code),
        },
        ...(editorContext?.mermaid
          ? [
              {
                id: 'mermaid-templates-sub',
                label: t('contextmenu.mermaid_templates'),
                icon: <Sparkles size={14} />,
                separatorBefore: true,
                submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={closeMenu}
                    width={190}
                    items={templates.map((tpl) => ({
                      id: tpl.id,
                      label: tpl.label,
                      onSelect: () => {
                        if (!editorView || !editorContext.mermaid) return;
                        const block = '```mermaid\n' + tpl.text + '\n```';
                        editorView.dispatch({
                          changes: { from: editorContext.mermaid.from, to: editorContext.mermaid.to, insert: block },
                        });
                      },
                    }))}
                  />
                ),
              },
            ]
          : []),
        ...(previewContext
          ? [
              {
                id: 'jump-mermaid',
                label: t('contextmenu.mermaid_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    const chartData = editorContext?.chart ?? previewContext?.chart;
    if (editorContext?.type === 'chart' || previewContext?.type === 'chart') {
      const code = chartData?.code ?? '';
      return [
        {
          id: 'copy-chart',
          label: t('contextmenu.chart_copy'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(code),
        },
        ...(editorContext?.chart
          ? [
              {
                id: 'chart-templates-sub',
                label: t('contextmenu.chart_templates'),
                icon: <BarChart2 size={14} />,
                separatorBefore: true,
                submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={closeMenu}
                    width={190}
                    items={CHARTJS_TEMPLATES.map((tpl) => ({
                      id: tpl.id,
                      label: t(tpl.labelKey),
                      onSelect: () => {
                        if (!editorView || !editorContext.chart) return;
                        const block = '```chart\n' + tpl.code + '\n```';
                        editorView.dispatch({
                          changes: { from: editorContext.chart.from, to: editorContext.chart.to, insert: block },
                        });
                      },
                    }))}
                  />
                ),
              },
            ]
          : []),
        ...(previewContext
          ? [
              {
                id: 'jump-chart',
                label: t('contextmenu.chart_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    if (editorContext?.type === 'wikilink' || previewContext?.type === 'wikilink') {
      const targetTitle = editorContext?.wikiLink?.target ?? previewContext?.wikiLink?.noteTitle ?? '';
      return [
        {
          id: 'open-note',
          label: t('contextmenu.wikilink_open'),
          icon: <Network size={14} />,
          onSelect: () => {
            if (!targetTitle) return;
            const targetNote = findNoteByTitle(targetTitle);
            if (targetNote) void openNote(targetNote.id);
            else void createNote({ title: targetTitle, open: true });
          },
        },
        {
          id: 'open-secondary',
          label: t('contextmenu.wikilink_open_secondary'),
          icon: <Columns2 size={14} />,
          onSelect: () => {
            if (!targetTitle) return;
            const targetNote = findNoteByTitle(targetTitle);
            if (targetNote) setWorkspaceNote('secondary', targetNote.id, true);
          },
        },
        {
          id: 'copy-link',
          label: t('contextmenu.wikilink_copy_link'),
          icon: <Copy size={14} />,
          separatorBefore: true,
          onSelect: () => handleCopy(`[[${targetTitle}]]`),
        },
        {
          id: 'copy-title',
          label: t('contextmenu.wikilink_copy_title'),
          icon: <FileText size={14} />,
          onSelect: () => handleCopy(targetTitle),
        },
        ...(previewContext
          ? [
              {
                id: 'jump-wikilink',
                label: t('contextmenu.wikilink_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    if (editorContext?.type === 'link' || previewContext?.type === 'link') {
      const url = editorContext?.link?.url ?? previewContext?.link?.url ?? '';
      return [
        {
          id: 'open-link',
          label: t('contextmenu.link_open'),
          icon: <ExternalLink size={14} />,
          onSelect: () => {
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          },
        },
        {
          id: 'copy-url',
          label: t('contextmenu.link_copy'),
          icon: <Copy size={14} />,
          onSelect: () => handleCopy(url),
        },
        ...(editorContext?.link
          ? [
              {
                id: 'delete-link',
                label: t('contextmenu.link_delete'),
                icon: <Trash2 size={14} />,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: () => {
                  if (!editorView || !editorContext.link) return;
                  editorView.dispatch({
                    changes: { from: editorContext.link.from, to: editorContext.link.to, insert: editorContext.link.text },
                  });
                },
              },
            ]
          : []),
      ];
    }

    if (editorContext?.type === 'frontmatter' || previewContext?.type === 'frontmatter') {
      const propertyTemplates = [
        { id: 'tags', label: 'tags: []', text: 'tags: []\n' },
        { id: 'aliases', label: 'aliases: []', text: 'aliases: []\n' },
        { id: 'status', label: 'status: draft', text: 'status: draft\n' },
        { id: 'created', label: 'createdAt: ' + new Date().toISOString().slice(0, 10), text: 'createdAt: ' + new Date().toISOString().slice(0, 10) + '\n' },
      ];
      return [
        ...(editorContext
          ? [
              {
                id: 'add-prop-sub',
                label: t('contextmenu.frontmatter_add_prop'),
                icon: <Plus size={14} />,
                submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={closeMenu}
                    items={propertyTemplates.map((prop) => ({
                      id: prop.id,
                      label: prop.label,
                      onSelect: () => {
                        if (!editorView) return;
                        const line = editorView.state.doc.line(2);
                        editorView.dispatch({
                          changes: { from: line.from, insert: prop.text },
                          selection: EditorSelection.cursor(line.from + prop.text.length),
                        });
                      },
                    }))}
                  />
                ),
              },
            ]
          : []),
        {
          id: 'copy-yaml',
          label: t('contextmenu.frontmatter_copy_yaml'),
          icon: <Copy size={14} />,
          onSelect: () => {
            const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(content);
            if (match) handleCopy(match[1]!);
          },
        },
        ...(previewContext
          ? [
              {
                id: 'jump-frontmatter',
                label: t('contextmenu.frontmatter_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(0),
              },
            ]
          : []),
      ];
    }

    if (editorContext?.type === 'task' || previewContext?.type === 'task') {
      return [
        {
          id: 'toggle-task',
          label: t('contextmenu.task_toggle'),
          icon: <CheckSquare size={14} />,
          onSelect: () => {
            if (editorView) {
              runStateCommand(toggleTaskDone);
            } else if (previewContext?.task) {
              const checkbox = previewContext.target.closest<HTMLInputElement>('input[type="checkbox"]');
              if (checkbox) checkbox.click();
            }
          },
        },
        ...(editorContext
          ? [
              {
                id: 'convert-bullet',
                label: t('contextmenu.task_convert_bullet'),
                icon: <List size={14} />,
                onSelect: () => runStateCommand(toggleBulletList),
              },
              {
                id: 'delete-task',
                label: t('contextmenu.task_delete'),
                icon: <Trash2 size={14} />,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: () => {
                  if (!editorView) return;
                  const line = editorView.state.doc.line(editorContext.lineNumber);
                  const from = line.from;
                  const to = Math.min(editorView.state.doc.length, line.to + 1);
                  editorView.dispatch({ changes: { from, to, insert: '' } });
                },
              },
            ]
          : []),
        ...(previewContext
          ? [
              {
                id: 'jump-task',
                label: t('contextmenu.task_jump_to_editor'),
                icon: <Pencil size={14} />,
                separatorBefore: true,
                onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
              },
            ]
          : []),
      ];
    }

    if (editorView && (!previewContext || previewContext.type === 'empty')) {
      return [
        {
          id: 'undo',
          label: t('contextmenu.undo'),
          icon: <Undo2 size={14} />,
          combo: 'mod+z',
          onSelect: () => document.execCommand('undo'),
        },
        {
          id: 'redo',
          label: t('contextmenu.redo'),
          icon: <Redo2 size={14} />,
          combo: 'mod+shift+z',
          onSelect: () => document.execCommand('redo'),
        },
        {
          id: 'paste',
          label: t('contextmenu.paste'),
          icon: <Copy size={14} className="rotate-90" />,
          combo: 'mod+v',
          onSelect: handlePasteIntoEditor,
        },
        {
          id: 'select-all',
          label: t('contextmenu.select_all'),
          icon: <CheckSquare size={14} />,
          combo: 'mod+a',
          onSelect: () => {
            editorView.dispatch({ selection: EditorSelection.range(0, editorView.state.doc.length) });
          },
        },
        {
          id: 'insert-sub',
          label: t('contextmenu.insert'),
          icon: <Plus size={14} />,
          separatorBefore: true,
          submenu: ({ closeMenu }: { closeMenu: () => void }) => (
            <SubmenuList
              closeMenu={closeMenu}
              width={200}
              items={[
                { id: 'link', label: t('workspace.link'), icon: <Link2 size={13} />, onSelect: () => runStateCommand(insertLink()) },
                { id: 'image', label: t('workspace.insert_image'), icon: <ImageIcon size={13} />, onSelect: () => onPickImage?.() },
                { id: 'file', label: t('workspace.insert_file'), icon: <Paperclip size={13} />, onSelect: () => onPickFile?.() },
                { id: 'table', label: t('workspace.table'), icon: <TableIcon size={13} />, onSelect: () => runStateCommand(insertTable) },
                { id: 'codeblock', label: t('workspace.code_block'), icon: <Braces size={13} />, onSelect: () => runStateCommand(insertCodeBlock) },
                { id: 'advanced-code', label: t('workspace.enhanced_code_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertAdvancedCodeBlock) },
                { id: 'js-example', label: t('workspace.runnable_js_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertRunnableJsBlock) },
                { id: 'math', label: t('workspace.math'), icon: <Sigma size={13} />, onSelect: () => runStateCommand(toggleInlineMath) },
                {
                  id: 'mermaid',
                  label: t('workspace.mermaid_diagram'),
                  icon: <Sparkles size={13} />,
                  submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
                    <SubmenuList
                      closeMenu={() => {
                        closeSub();
                        closeMenu();
                      }}
                      width={190}
                      items={MERMAID_TEMPLATES.map((tpl) => ({
                        id: tpl.id,
                        label: t(tpl.labelKey),
                        onSelect: () => runStateCommand(insertDiagramCode('mermaid', tpl.code)),
                      }))}
                    />
                  ),
                },
                {
                  id: 'chartjs',
                  label: t('workspace.chartjs_diagram'),
                  icon: <BarChart2 size={13} />,
                  submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
                    <SubmenuList
                      closeMenu={() => {
                        closeSub();
                        closeMenu();
                      }}
                      width={180}
                      items={CHARTJS_TEMPLATES.map((tpl) => ({
                        id: tpl.id,
                        label: t(tpl.labelKey),
                        onSelect: () => runStateCommand(insertDiagramCode('chart', tpl.code)),
                      }))}
                    />
                  ),
                },
                { id: 'callout', label: t('workspace.callout'), icon: <Quote size={13} />, onSelect: () => runStateCommand(insertCallout) },
                { id: 'divider', label: t('workspace.divider'), icon: <Minus size={13} />, onSelect: () => runStateCommand(insertHorizontalRule) },
                { id: 'details', label: t('workspace.details_block'), icon: <ChevronDown size={13} />, onSelect: () => runStateCommand(insertDetails) },
                { id: 'tabs', label: t('common.tabs'), icon: <Columns2 size={13} />, onSelect: () => runStateCommand(insertTabs) },
                { id: 'toc', label: t('common.table_of_contents'), icon: <ListTree size={13} />, onSelect: () => runStateCommand(insertTableOfContents) },
                { id: 'deflist', label: t('workspace.definition_list'), icon: <BookOpen size={13} />, onSelect: () => runStateCommand(insertDefinitionList) },
                { id: 'abbr', label: t('workspace.abbreviation'), icon: <HelpCircle size={13} />, onSelect: () => runStateCommand(insertAbbreviation) },
                {
                  id: 'tasks-status',
                  label: t('common.task_list'),
                  icon: <ListTodo size={13} />,
                  submenu: ({ closeMenu: closeSub }) => (
                    <SubmenuList
                      closeMenu={() => {
                        closeSub();
                        closeMenu();
                      }}
                      width={180}
                      items={[
                        { id: 'task-in-progress', label: t('workspace.task_in_progress'), onSelect: () => runStateCommand(insertTaskWithStatus('/')) },
                        { id: 'task-cancelled', label: t('workspace.task_cancelled'), onSelect: () => runStateCommand(insertTaskWithStatus('-')) },
                        { id: 'task-question', label: t('workspace.task_question'), onSelect: () => runStateCommand(insertTaskWithStatus('?')) },
                        { id: 'task-important', label: t('workspace.task_important'), onSelect: () => runStateCommand(insertTaskWithStatus('!')) },
                      ]}
                    />
                  ),
                },
                {
                  id: 'emoji',
                  label: t('common.emoji'),
                  icon: <Smile size={13} />,
                  submenu: ({ closeMenu: closeSub }) => (
                    <SubmenuList
                      closeMenu={() => {
                        closeSub();
                        closeMenu();
                      }}
                      width={180}
                      items={COMMON_EMOJIS.map((item) => ({
                        id: item.code,
                        label: `${item.emoji}  ${item.code}`,
                        onSelect: () => runStateCommand(insertEmoji(item.emoji)),
                      }))}
                    />
                  ),
                },
                { id: 'frontmatter', label: 'Front Matter', icon: <FileText size={13} />, onSelect: () => runStateCommand(insertFrontMatter) },
                { id: 'template', label: t('workspace.insert_note_template'), icon: <Calendar size={13} />, onSelect: () => runStateCommand(insertNoteTemplate) },
              ]}
            />
          ),
        },
      ];
    }

    return [
      {
        id: 'switch-edit',
        label: currentLayout === 'edit' ? t('contextmenu.preview_switch_split') : t('contextmenu.preview_switch_edit'),
        icon: <Pencil size={14} />,
        onSelect: () => onSwitchLayout?.(currentLayout === 'edit' ? 'split' : 'edit'),
      },
      {
        id: 'switch-split',
        label: t('contextmenu.preview_switch_split'),
        icon: <Columns2 size={14} />,
        checked: currentLayout === 'split',
        onSelect: () => onSwitchLayout?.('split'),
      },
      {
        id: 'copy-full-md',
        label: t('contextmenu.preview_copy_markdown'),
        icon: <Copy size={14} />,
        separatorBefore: true,
        onSelect: () => handleCopy(content),
      },
      ...(onExport
        ? [
            {
              id: 'export-sub',
              label: t('workspace.export'),
              icon: <Download size={14} />,
              submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                <SubmenuList
                  closeMenu={closeMenu}
                  items={[
                    { id: 'export-md', label: t('workspace.export_markdown'), icon: <FileText size={13} />, onSelect: () => onExport('md') },
                    { id: 'export-html', label: t('workspace.export_html'), icon: <FileCode size={13} />, onSelect: () => onExport('html') },
                    { id: 'export-pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13} />, onSelect: () => onExport('pdf') },
                  ]}
                />
              ),
            },
          ]
        : []),
      {
        id: 'scroll-top',
        label: t('contextmenu.preview_scroll_top'),
        icon: <Minus size={14} className="rotate-90" />,
        separatorBefore: true,
        onSelect: () => {
          previewScrollerRef?.current?.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
        },
      },
      {
        id: 'scroll-bottom',
        label: t('contextmenu.preview_scroll_bottom'),
        icon: <Minus size={14} className="-rotate-90" />,
        onSelect: () => {
          if (previewScrollerRef?.current) {
            previewScrollerRef.current.scrollTo({
              top: previewScrollerRef.current.scrollHeight,
              behavior: preferredScrollBehavior(),
            });
          }
        },
      },
    ];
  }, [
    editorContext,
    previewContext,
    editorView,
    content,
    handleCutFromEditor,
    handleCopy,
    handlePasteIntoEditor,
    runStateCommand,
    replaceTableInEditor,
    modifyTableInContent,
    onJumpToLine,
    createNote,
    openNote,
    setWorkspaceNote,
    onPickImage,
    currentLayout,
    onSwitchLayout,
    onExport,
    previewScrollerRef,
  ]);

  if (!point || items.length === 0) return null;

  return (
    <Menu
      anchor={point}
      open={Boolean(point)}
      onClose={onClose}
      items={items}
      width={216}
      zIndex={280}
    />
  );
}

export function SubmenuList({
  items,
  closeMenu,
  width = 180,
}: {
  items: MenuItem[];
  closeMenu: () => void;
  width?: number;
}) {
  return (
    <div
      style={{ width }}
      className="max-h-[380px] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />}
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              closeMenu();
            }}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[12.5px] md:h-[30px]',
              'transition-colors duration-[80ms] hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40',
              item.tone === 'danger'
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {item.icon && (
              <span className="flex size-4 shrink-0 items-center justify-center opacity-85">{item.icon}</span>
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && <Check size={13} className="shrink-0 text-[var(--accent)]" />}
            {item.combo && <Kbd combo={item.combo} />}
          </button>
        </div>
      ))}
    </div>
  );
}
