import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownUp,
  ArrowUpAZ,
  ArrowDownAZ,
  Copy,
  CopyPlus,
  Eraser,
  FileSpreadsheet,
  Minus,
  Pencil,
  Plus,
  Rows,
  Trash2,
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { clearTableCell, clearTableRow, deleteEntireTableInText, deleteTableColumn, deleteTableRow, duplicateTableRow, formatMarkdownTable, insertTableColumn, insertTableRow, parseMarkdownTable, setColumnAlignment, sortTableRowByColumn, tableToCsv, type ParsedTable } from '../../../lib/markdown/table-editor';
import type { MenuCtx } from './types';
import { SubmenuList } from './submenu';

type TableApply = (next: ParsedTable) => void;

function alignSubmenuItems(table: ParsedTable, apply: TableApply): MenuItem[] {
  const col = table.cursorColIndex;
  return [
    { id: 'align-left', label: t('contextmenu.table_align_left'), icon: <AlignLeft size={13} />, checked: table.alignments[col] === 'left', onSelect: () => apply(setColumnAlignment(table, col, 'left')) },
    { id: 'align-center', label: t('contextmenu.table_align_center'), icon: <AlignCenter size={13} />, checked: table.alignments[col] === 'center', onSelect: () => apply(setColumnAlignment(table, col, 'center')) },
    { id: 'align-right', label: t('contextmenu.table_align_right'), icon: <AlignRight size={13} />, checked: table.alignments[col] === 'right', onSelect: () => apply(setColumnAlignment(table, col, 'right')) },
    { id: 'align-default', label: t('contextmenu.table_align_default'), icon: <Minus size={13} />, checked: table.alignments[col] === 'default', onSelect: () => apply(setColumnAlignment(table, col, 'default')) },
  ];
}

function sortSubmenuItems(table: ParsedTable, apply: TableApply): MenuItem[] {
  const col = table.cursorColIndex;
  return [
    { id: 'sort-asc', label: t('contextmenu.table_sort_asc'), icon: <ArrowUpAZ size={13} />, onSelect: () => apply(sortTableRowByColumn(table, col, 'asc')) },
    { id: 'sort-desc', label: t('contextmenu.table_sort_desc'), icon: <ArrowDownAZ size={13} />, onSelect: () => apply(sortTableRowByColumn(table, col, 'desc')) },
  ];
}

function deleteTableInEditor(editorView: EditorView | null | undefined, table: ParsedTable) {
  if (!editorView) return;
  const doc = editorView.state.doc;
  const from = doc.line(table.startLine + 1).from;
  const to = Math.min(doc.length, doc.line(table.endLine + 1).to + 1);
  editorView.dispatch({ changes: { from, to, insert: '' } });
}

function copyTableAs(content: string, sourceLine: number, handleCopy: (text: string) => void, format: (table: ParsedTable) => string) {
  const lines = content.split('\n');
  const table = parseMarkdownTable(lines, sourceLine);
  if (table) handleCopy(format(table));
}

function buildEditorTableMenu(ctx: MenuCtx, table: ParsedTable): MenuItem[] {
  const { replaceTableInEditor, handleCopy, editorView } = ctx;
  const edit = (next: ParsedTable) => replaceTableInEditor(table, next);
  const cursor = table.cursorRowIndex;
  const col = table.cursorColIndex;
  return [
    { id: 'insert-row-above', label: t('contextmenu.table_insert_row_above'), icon: <Rows size={14} />, onSelect: () => edit(insertTableRow(table, cursor, 'above')) },
    { id: 'insert-row-below', label: t('contextmenu.table_insert_row_below'), icon: <Rows size={14} />, onSelect: () => edit(insertTableRow(table, cursor, 'below')) },
    { id: 'duplicate-row', label: t('contextmenu.table_duplicate_row'), icon: <CopyPlus size={14} />, disabled: cursor < 0, onSelect: () => edit(duplicateTableRow(table, cursor)) },
    { id: 'delete-row', label: t('contextmenu.table_delete_row'), icon: <Trash2 size={14} />, onSelect: () => edit(deleteTableRow(table, cursor)) },
    { id: 'insert-col-left', label: t('contextmenu.table_insert_col_left'), icon: <Plus size={14} />, separatorBefore: true, onSelect: () => edit(insertTableColumn(table, col, 'left')) },
    { id: 'insert-col-right', label: t('contextmenu.table_insert_col_right'), icon: <Plus size={14} />, onSelect: () => edit(insertTableColumn(table, col, 'right')) },
    { id: 'delete-col', label: t('contextmenu.table_delete_col'), icon: <Trash2 size={14} />, disabled: table.columnCount <= 1, onSelect: () => edit(deleteTableColumn(table, col)) },
    {
      id: 'align-sub',
      label: t('contextmenu.table_align'),
      icon: <AlignCenter size={14} />,
      separatorBefore: true,
      submenu: ({ closeMenu }: { closeMenu: () => void }) => <SubmenuList closeMenu={closeMenu} items={alignSubmenuItems(table, edit)} />,
    },
    { id: 'sort-sub', label: t('contextmenu.table_sort'), icon: <ArrowDownUp size={14} />, submenu: ({ closeMenu }: { closeMenu: () => void }) => <SubmenuList closeMenu={closeMenu} items={sortSubmenuItems(table, edit)} /> },
    { id: 'clear-cell', label: t('contextmenu.table_clear_cell'), icon: <Eraser size={14} />, separatorBefore: true, onSelect: () => edit(clearTableCell(table, cursor, col)) },
    { id: 'clear-row', label: t('contextmenu.table_clear_row'), icon: <Eraser size={14} />, onSelect: () => edit(clearTableRow(table, cursor)) },
    { id: 'format-table', label: t('contextmenu.table_format'), icon: <FileSpreadsheet size={14} />, separatorBefore: true, onSelect: () => edit({ ...table }) },
    { id: 'copy-markdown', label: t('contextmenu.table_copy_markdown'), icon: <Copy size={14} />, onSelect: () => handleCopy(formatMarkdownTable(table).join('\n')) },
    { id: 'copy-csv', label: t('contextmenu.table_copy_csv'), icon: <Copy size={14} />, onSelect: () => handleCopy(tableToCsv(table)) },
    { id: 'delete-table', label: t('contextmenu.table_delete'), icon: <Trash2 size={14} />, tone: 'danger', separatorBefore: true, onSelect: () => deleteTableInEditor(editorView, table) },
  ];
}

export function buildEditorTableItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorContext } = ctx;
  if (editorContext?.type === 'table' && editorContext.table) {
    return buildEditorTableMenu(ctx, editorContext.table);
  }
  return null;
}

function alignPreviewSubmenuItems(col: number, modify: (fn: (table: ParsedTable) => ParsedTable) => void): MenuItem[] {
  return [
    { id: 'align-left-prev', label: t('contextmenu.table_align_left'), icon: <AlignLeft size={13} />, onSelect: () => modify((tbl) => setColumnAlignment(tbl, col, 'left')) },
    { id: 'align-center-prev', label: t('contextmenu.table_align_center'), icon: <AlignCenter size={13} />, onSelect: () => modify((tbl) => setColumnAlignment(tbl, col, 'center')) },
    { id: 'align-right-prev', label: t('contextmenu.table_align_right'), icon: <AlignRight size={13} />, onSelect: () => modify((tbl) => setColumnAlignment(tbl, col, 'right')) },
    { id: 'align-default-prev', label: t('contextmenu.table_align_default'), icon: <Minus size={13} />, onSelect: () => modify((tbl) => setColumnAlignment(tbl, col, 'default')) },
  ];
}

function sortPreviewSubmenuItems(col: number, modify: (fn: (table: ParsedTable) => ParsedTable) => void): MenuItem[] {
  return [
    { id: 'sort-asc-prev', label: t('contextmenu.table_sort_asc'), icon: <ArrowUpAZ size={13} />, onSelect: () => modify((tbl) => sortTableRowByColumn(tbl, col, 'asc')) },
    { id: 'sort-desc-prev', label: t('contextmenu.table_sort_desc'), icon: <ArrowDownAZ size={13} />, onSelect: () => modify((tbl) => sortTableRowByColumn(tbl, col, 'desc')) },
  ];
}

function buildPreviewTableMenu(ctx: MenuCtx, pTable: { rowIndex: number; colIndex: number; sourceLine?: number }): MenuItem[] {
  const { content, onEditContent, onJumpToLine, modifyTableInContent, handleCopy } = ctx;
  const sLine = pTable.sourceLine ?? 0;
  const rowIndex = pTable.rowIndex > 0 ? pTable.rowIndex - 1 : 0;
  const modify = (fn: (table: ParsedTable) => ParsedTable) => modifyTableInContent(sLine, fn);
  return [
    { id: 'jump-to-editor', label: t('contextmenu.table_jump_to_editor'), icon: <Pencil size={14} />, onSelect: () => onJumpToLine(sLine) },
    { id: 'insert-row-above', label: t('contextmenu.table_insert_row_above'), icon: <Rows size={14} />, separatorBefore: true, onSelect: () => modify((tbl) => insertTableRow(tbl, rowIndex, 'above')) },
    { id: 'insert-row-below', label: t('contextmenu.table_insert_row_below'), icon: <Rows size={14} />, onSelect: () => modify((tbl) => insertTableRow(tbl, rowIndex, 'below')) },
    { id: 'duplicate-row', label: t('contextmenu.table_duplicate_row'), icon: <CopyPlus size={14} />, disabled: pTable.rowIndex === 0, onSelect: () => modify((tbl) => duplicateTableRow(tbl, rowIndex)) },
    { id: 'delete-row', label: t('contextmenu.table_delete_row'), icon: <Trash2 size={14} />, disabled: pTable.rowIndex === 0, onSelect: () => modify((tbl) => deleteTableRow(tbl, rowIndex)) },
    { id: 'insert-col-left', label: t('contextmenu.table_insert_col_left'), icon: <Plus size={14} />, separatorBefore: true, onSelect: () => modify((tbl) => insertTableColumn(tbl, pTable.colIndex, 'left')) },
    { id: 'insert-col-right', label: t('contextmenu.table_insert_col_right'), icon: <Plus size={14} />, onSelect: () => modify((tbl) => insertTableColumn(tbl, pTable.colIndex, 'right')) },
    { id: 'delete-col', label: t('contextmenu.table_delete_col'), icon: <Trash2 size={14} />, onSelect: () => modify((tbl) => deleteTableColumn(tbl, pTable.colIndex)) },
    {
      id: 'align-sub-preview',
      label: t('contextmenu.table_align'),
      icon: <AlignCenter size={14} />,
      separatorBefore: true,
      submenu: ({ closeMenu }: { closeMenu: () => void }) => <SubmenuList closeMenu={closeMenu} items={alignPreviewSubmenuItems(pTable.colIndex, modify)} />,
    },
    { id: 'sort-sub-preview', label: t('contextmenu.table_sort'), icon: <ArrowDownUp size={14} />, submenu: ({ closeMenu }: { closeMenu: () => void }) => <SubmenuList closeMenu={closeMenu} items={sortPreviewSubmenuItems(pTable.colIndex, modify)} /> },
    { id: 'clear-cell-prev', label: t('contextmenu.table_clear_cell'), icon: <Eraser size={14} />, separatorBefore: true, onSelect: () => modify((tbl) => clearTableCell(tbl, pTable.rowIndex === 0 ? -1 : rowIndex, pTable.colIndex)) },
    { id: 'clear-row-prev', label: t('contextmenu.table_clear_row'), icon: <Eraser size={14} />, onSelect: () => modify((tbl) => clearTableRow(tbl, pTable.rowIndex === 0 ? -1 : rowIndex)) },
    { id: 'format-table-prev', label: t('contextmenu.table_format'), icon: <FileSpreadsheet size={14} />, separatorBefore: true, onSelect: () => modify((tbl) => ({ ...tbl })) },
    { id: 'copy-markdown-prev', label: t('contextmenu.table_copy_markdown'), icon: <Copy size={14} />, onSelect: () => copyTableAs(content, sLine, handleCopy, (tbl) => formatMarkdownTable(tbl).join('\n')) },
    { id: 'copy-csv-prev', label: t('contextmenu.table_copy_csv'), icon: <Copy size={14} />, onSelect: () => copyTableAs(content, sLine, handleCopy, tableToCsv) },
    { id: 'delete-table-prev', label: t('contextmenu.table_delete'), icon: <Trash2 size={14} />, tone: 'danger', separatorBefore: true, onSelect: () => onEditContent(deleteEntireTableInText(content, sLine)) },
  ];
}

export function buildPreviewTableItems(ctx: MenuCtx): MenuItem[] | null {
  const { previewContext } = ctx;
  if (previewContext?.type === 'table' && previewContext.table) {
    return buildPreviewTableMenu(ctx, previewContext.table);
  }
  return null;
}