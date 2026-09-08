import {
  formatMarkdownTable,
  insertTableColumn,
  insertTableRow,
  parseMarkdownTable,
  sortTableRowByColumn,
  tableToCsv,
  updateTableCell,
  type ParsedTable,
} from '../../lib/markdown/table-editor'
import { t } from '../../lib/i18n'

export function enhanceTablesInRoot(root: HTMLElement): void {
  const tableWraps = root.querySelectorAll<HTMLElement>('.table-wrap')
  tableWraps.forEach((wrap) => {
    if (!wrap.querySelector('.table-floating-bar')) {
      const bar = document.createElement('div')
      bar.className = 'table-floating-bar'
      bar.innerHTML = [
        `<button type="button" class="table-floating-btn" data-table-action="add-row" title="${t('contextmenu.table_insert_row_below')}">${t('contextmenu.table_quick_add_row')}</button>`,
        `<button type="button" class="table-floating-btn" data-table-action="add-col" title="${t('contextmenu.table_insert_col_right')}">${t('contextmenu.table_quick_add_col')}</button>`,
        `<button type="button" class="table-floating-btn" data-table-action="sort" title="${t('contextmenu.table_sort')}">${t('contextmenu.table_quick_sort')}</button>`,
        `<button type="button" class="table-floating-btn" data-table-action="format" title="${t('contextmenu.table_format')}">${t('contextmenu.table_quick_format')}</button>`,
        `<button type="button" class="table-floating-btn" data-table-action="copy-csv" title="${t('contextmenu.table_copy_csv')}">${t('contextmenu.table_quick_csv')}</button>`,
      ].join('')
      wrap.prepend(bar)
    }
  })
}

export function handleTableCellSelection(cell: HTMLTableCellElement, root: HTMLElement): void {
  root.querySelectorAll('.is-selected-cell').forEach((el) => {
    if (el !== cell) el.classList.remove('is-selected-cell')
  })
  cell.classList.add('is-selected-cell')
}

export function startTableCellEditing(
  cell: HTMLTableCellElement,
  content: string,
  onEdit: (next: string) => void,
): void {
  if (cell.classList.contains('is-editing-cell')) return

  const originalText = cell.textContent ?? ''
  focusCellContent(cell)

  let isCommitted = false

  const commit = (shouldMove?: 'next' | 'prev' | 'down') => {
    if (isCommitted) return
    isCommitted = true
    finishCellEditing(cell, onKeyDown, onBlur)

    const newText = (cell.textContent ?? '').trim()
    const nextContent = applyCellEdit(cell, content, originalText, newText)
    if (nextContent !== null) onEdit(nextContent)

    if (shouldMove && cell.closest('table')) {
      setTimeout(() => {
        handleMoveAfterCommit(cell, shouldMove, nextContent ?? content, onEdit)
      }, 50)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      escapeCellEdit(e, cell, originalText, () => { isCommitted = true; }, onKeyDown, onBlur)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      commit(e.shiftKey ? 'prev' : 'next')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit('down')
    }
  }

  const onBlur = () => {
    commit()
  }

  cell.addEventListener('keydown', onKeyDown)
  cell.addEventListener('blur', onBlur)
}

function focusCellContent(cell: HTMLTableCellElement): void {
  cell.contentEditable = 'true'
  cell.classList.add('is-editing-cell')
  cell.focus()

  const range = document.createRange()
  range.selectNodeContents(cell)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function finishCellEditing(
  cell: HTMLTableCellElement,
  onKeyDown: (e: KeyboardEvent) => void,
  onBlur: () => void,
): void {
  cell.contentEditable = 'false'
  cell.classList.remove('is-editing-cell')
  cell.removeEventListener('keydown', onKeyDown)
  cell.removeEventListener('blur', onBlur)
}

function escapeCellEdit(
  e: KeyboardEvent,
  cell: HTMLTableCellElement,
  originalText: string,
  markCommitted: () => void,
  onKeyDown: (e: KeyboardEvent) => void,
  onBlur: () => void,
): void {
  e.preventDefault()
  cell.textContent = originalText
  markCommitted()
  finishCellEditing(cell, onKeyDown, onBlur)
  cell.blur()
}

function applyCellEdit(cell: HTMLTableCellElement, content: string, originalText: string, newText: string): string | null {
  if (newText === originalText) return null
  const lines = content.split('\n')
  const wrapEl = cell.closest<HTMLElement>('.table-wrap')
  const sourceLineRaw = wrapEl?.dataset.line ?? wrapEl?.dataset.sourceLine ?? '0'
  const sourceLine = parseInt(sourceLineRaw, 10)
  const table = parseMarkdownTable(lines, sourceLine)
  if (!table) return null
  const colIndex = cell.cellIndex
  const isHeader = cell.tagName.toLowerCase() === 'th'
  const tableEl = cell.closest('table')
  const tbody = tableEl?.querySelector('tbody')
  const tbodyRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : []
  const rowIndex = isHeader ? -1 : tbodyRows.indexOf(cell.closest('tr')!)
  const updated = updateTableCell(table, rowIndex, colIndex, newText)
  const newLines = formatMarkdownTable(updated)
  lines.splice(table.startLine, table.endLine - table.startLine + 1, ...newLines)
  return lines.join('\n')
}

function handleMoveAfterCommit(
  currentCell: HTMLTableCellElement,
  direction: 'next' | 'prev' | 'down',
  content: string,
  onEdit: (next: string) => void,
): void {
  const tableEl = currentCell.closest('table')
  if (!tableEl) return

  const allCells = Array.from(tableEl.querySelectorAll<HTMLTableCellElement>('th, td'))
  const currentIndex = allCells.indexOf(currentCell)
  if (currentIndex === -1) return

  if (direction === 'next') {
    if (currentIndex < allCells.length - 1) {
      const nextCell = allCells[currentIndex + 1]!
      startTableCellEditing(nextCell, content, onEdit)
    } else {
      appendRowBelow(tableEl.closest<HTMLElement>('.table-wrap'), content, onEdit)
    }
  } else if (direction === 'prev') {
    if (currentIndex > 0) {
      const prevCell = allCells[currentIndex - 1]!
      startTableCellEditing(prevCell, content, onEdit)
    }
  } else if (direction === 'down') {
    moveDownAfterCommit(currentCell, tableEl, content, onEdit)
  }
}

function moveDownAfterCommit(
  currentCell: HTMLTableCellElement,
  tableEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
): void {
  const col = currentCell.cellIndex
  const currentTr = currentCell.closest('tr')
  const isHeader = currentCell.tagName.toLowerCase() === 'th'
  const tbody = tableEl.querySelector('tbody')
  if (isHeader) {
    const firstDataTr = tbody?.querySelector('tr')
    const targetCell = firstDataTr?.children[col] as HTMLTableCellElement | undefined
    if (targetCell) {
      startTableCellEditing(targetCell, content, onEdit)
    }
    return
  }
  if (!currentTr || !tbody) return
  const tbodyRows = Array.from(tbody.querySelectorAll('tr'))
  const rIdx = tbodyRows.indexOf(currentTr)
  if (rIdx < tbodyRows.length - 1) {
    const nextTr = tbodyRows[rIdx + 1]!
    const targetCell = nextTr.children[col] as HTMLTableCellElement | undefined
    if (targetCell) {
      startTableCellEditing(targetCell, content, onEdit)
    }
  } else {
    appendRowBelow(tableEl.closest<HTMLElement>('.table-wrap'), content, onEdit)
  }
}

function appendRowBelow(wrapEl: HTMLElement | null, content: string, onEdit: (next: string) => void): void {
  const sourceLineRaw = wrapEl?.dataset.line ?? wrapEl?.dataset.sourceLine ?? '0'
  const sourceLine = parseInt(sourceLineRaw, 10)
  const lines = content.split('\n')
  const table = parseMarkdownTable(lines, sourceLine)
  if (table) {
    const updated = insertTableRow(table, table.rows.length - 1, 'below')
    const newLines = formatMarkdownTable(updated)
    lines.splice(table.startLine, table.endLine - table.startLine + 1, ...newLines)
    onEdit(lines.join('\n'))
  }
}

export function executeTableFloatingAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
): void {
  const wrapEl = targetEl.closest<HTMLElement>('.table-wrap')
  if (!wrapEl) return
  const sourceLineRaw = wrapEl.dataset.line ?? wrapEl.dataset.sourceLine ?? '0'
  const sourceLine = parseInt(sourceLineRaw, 10)

  const lines = content.split('\n')
  const table = parseMarkdownTable(lines, sourceLine)
  if (!table) return

  const tableEl = wrapEl.querySelector('table')
  const selectedCell = tableEl?.querySelector<HTMLTableCellElement>('.is-selected-cell')
  const colIndex = selectedCell?.cellIndex ?? 0
  const isHeader = selectedCell?.tagName.toLowerCase() === 'th'
  const tbody = tableEl?.querySelector('tbody')
  const tbodyRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : []
  const rowIndex = isHeader || !selectedCell ? -1 : tbodyRows.indexOf(selectedCell.closest('tr')!)

  if (action === 'copy-csv') {
    const csv = tableToCsv(table)
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(csv)
    }
    return
  }

  const updated = applyFloatingMutation(action, table, colIndex, rowIndex)
  if (!updated) return

  const newLines = formatMarkdownTable(updated)
  lines.splice(table.startLine, table.endLine - table.startLine + 1, ...newLines)
  onEdit(lines.join('\n'))
}

function applyFloatingMutation(action: string, table: ParsedTable, colIndex: number, rowIndex: number): ParsedTable | null {
  switch (action) {
    case 'add-row':
      return insertTableRow(table, rowIndex >= 0 ? rowIndex : table.rows.length - 1, 'below')
    case 'add-col':
      return insertTableColumn(table, colIndex, 'right')
    case 'sort':
      return sortTableRowByColumn(table, colIndex, 'asc')
    case 'format':
      return { ...table }
    default:
      return null
  }
}
