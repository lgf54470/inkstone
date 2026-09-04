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
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { clearTableCell, clearTableRow, deleteEntireTableInText, deleteTableColumn, deleteTableRow, duplicateTableRow, formatMarkdownTable, insertTableColumn, insertTableRow, parseMarkdownTable, setColumnAlignment, sortTableRowByColumn, tableToCsv } from '../../../lib/markdown/table-editor';
import type { MenuCtx } from './types';
import { SubmenuList } from './submenu';

export function buildEditorTableItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, replaceTableInEditor, handleCopy } = ctx;

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
  return null;
}

export function buildPreviewTableItems(ctx: MenuCtx): MenuItem[] | null {
  const { previewContext, content, onEditContent, onJumpToLine, modifyTableInContent, handleCopy } = ctx;

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
  return null;
}

