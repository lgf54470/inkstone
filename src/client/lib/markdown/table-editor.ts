export type ColumnAlignment = 'left' | 'center' | 'right' | 'default';

export interface ParsedTable {
  startLine: number;
  endLine: number;
  headerRow: string[];
  alignments: ColumnAlignment[];
  rows: string[][];
  columnCount: number;
  cursorRowIndex: number;
  cursorColIndex: number;
}

export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let isEscaped = false;

  const trimmed = line.trim();
  let str = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  if (str.endsWith('|') && !str.endsWith('\\|')) {
    str = str.slice(0, -1);
  }

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (isEscaped) {
      current += char;
      isEscaped = false;
    } else if (char === '\\') {
      current += char;
      isEscaped = true;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function isDelimiterRow(line: string): boolean {
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

export function parseCellAlignment(cell: string): ColumnAlignment {
  const trimmed = cell.trim();
  const leftColon = trimmed.startsWith(':');
  const rightColon = trimmed.endsWith(':');
  if (leftColon && rightColon) return 'center';
  if (rightColon) return 'right';
  if (leftColon) return 'left';
  return 'default';
}

export function formatDelimiterCell(align: ColumnAlignment, width = 3): string {
  const fillWidth = Math.max(3, width);
  switch (align) {
    case 'center': {
      const dashes = '-'.repeat(Math.max(1, fillWidth - 2));
      return `:${dashes}:`;
    }
    case 'right': {
      const dashes = '-'.repeat(Math.max(2, fillWidth - 1));
      return `${dashes}:`;
    }
    case 'left': {
      const dashes = '-'.repeat(Math.max(2, fillWidth - 1));
      return `:${dashes}`;
    }
    case 'default':
    default:
      return '-'.repeat(fillWidth);
  }
}

export function findColumnIndexAtOffset(line: string, offset: number): number {
  let col = 0;
  let isInEscape = false;
  const clampedOffset = Math.max(0, Math.min(offset, line.length));

  for (let i = 0; i < clampedOffset; i++) {
    const char = line[i];
    if (isInEscape) {
      isInEscape = false;
    } else if (char === '\\') {
      isInEscape = true;
    } else if (char === '|') {
      const isLeading = line.slice(0, i).trim() === '';
      if (!isLeading) {
        col++;
      }
    }
  }
  return col;
}

export function parseMarkdownTable(
  lines: string[],
  targetLineIndex: number,
  characterOffset = 0,
): ParsedTable | null {
  if (targetLineIndex < 0 || targetLineIndex >= lines.length) return null;
  const currentLine = lines[targetLineIndex] ?? '';
  if (!currentLine.includes('|')) return null;

  let startLine = targetLineIndex;
  while (startLine > 0 && (lines[startLine - 1] ?? '').includes('|') && (lines[startLine - 1] ?? '').trim().length > 0) {
    startLine--;
  }

  let endLine = targetLineIndex;
  while (endLine + 1 < lines.length && (lines[endLine + 1] ?? '').includes('|') && (lines[endLine + 1] ?? '').trim().length > 0) {
    endLine++;
  }

  if (endLine - startLine < 1) return null;

  let delimiterLineIndex = -1;
  for (let i = startLine + 1; i <= endLine; i++) {
    if (isDelimiterRow(lines[i] ?? '')) {
      delimiterLineIndex = i;
      break;
    }
  }

  if (delimiterLineIndex === -1) return null;

  const headerLineIndex = delimiterLineIndex - 1;
  const rawHeaders = splitTableRow(lines[headerLineIndex] ?? '');
  const rawDelimiters = splitTableRow(lines[delimiterLineIndex] ?? '');

  let columnCount = Math.max(rawHeaders.length, rawDelimiters.length, 1);

  const rows: string[][] = [];
  for (let i = delimiterLineIndex + 1; i <= endLine; i++) {
    const rawRow = splitTableRow(lines[i] ?? '');
    columnCount = Math.max(columnCount, rawRow.length);
    rows.push(rawRow);
  }

  const headerRow: string[] = [];
  for (let c = 0; c < columnCount; c++) {
    headerRow.push(rawHeaders[c] ?? '');
  }

  const alignments: ColumnAlignment[] = [];
  for (let c = 0; c < columnCount; c++) {
    alignments.push(rawDelimiters[c] ? parseCellAlignment(rawDelimiters[c]!) : 'default');
  }

  const paddedRows: string[][] = rows.map((row) => {
    const padded: string[] = [];
    for (let c = 0; c < columnCount; c++) {
      padded.push(row[c] ?? '');
    }
    return padded;
  });

  let cursorRowIndex = -1;
  if (targetLineIndex === headerLineIndex || targetLineIndex === delimiterLineIndex) {
    cursorRowIndex = -1;
  } else if (targetLineIndex > delimiterLineIndex) {
    cursorRowIndex = targetLineIndex - delimiterLineIndex - 1;
  }

  const cursorColIndex = Math.min(
    columnCount - 1,
    Math.max(0, findColumnIndexAtOffset(currentLine, characterOffset)),
  );

  return {
    startLine: headerLineIndex,
    endLine,
    headerRow,
    alignments,
    rows: paddedRows,
    columnCount,
    cursorRowIndex,
    cursorColIndex,
  };
}

export function insertTableRow(
  table: ParsedTable,
  rowIndex: number,
  position: 'above' | 'below',
): ParsedTable {
  const newRow = new Array<string>(table.columnCount).fill('');
  const rows = [...table.rows.map((r) => [...r])];

  if (rowIndex < 0) {
    if (position === 'above') {
      rows.unshift(table.headerRow);
      return {
        ...table,
        headerRow: newRow,
        rows,
        cursorRowIndex: 0,
      };
    } else {
      rows.unshift(newRow);
      return {
        ...table,
        rows,
        cursorRowIndex: 0,
      };
    }
  }

  const insertIndex = position === 'above' ? rowIndex : rowIndex + 1;
  rows.splice(insertIndex, 0, newRow);

  return {
    ...table,
    rows,
    cursorRowIndex: insertIndex,
  };
}

export function deleteTableRow(table: ParsedTable, rowIndex: number): ParsedTable {
  if (rowIndex < 0) {
    if (table.rows.length === 0) {
      return table;
    }
    const [newHeader, ...remainingRows] = table.rows;
    return {
      ...table,
      headerRow: newHeader ?? table.headerRow,
      rows: remainingRows,
      cursorRowIndex: -1,
    };
  }

  const rows = table.rows.filter((_, idx) => idx !== rowIndex);
  const nextCursor = Math.min(rowIndex, rows.length - 1);
  return {
    ...table,
    rows,
    cursorRowIndex: nextCursor,
  };
}

export function insertTableColumn(
  table: ParsedTable,
  colIndex: number,
  position: 'left' | 'right',
): ParsedTable {
  const insertIndex = position === 'left' ? colIndex : colIndex + 1;
  const columnCount = table.columnCount + 1;

  const headerRow = [...table.headerRow];
  headerRow.splice(insertIndex, 0, '');

  const alignments = [...table.alignments];
  alignments.splice(insertIndex, 0, 'default');

  const rows = table.rows.map((row) => {
    const updated = [...row];
    updated.splice(insertIndex, 0, '');
    return updated;
  });

  return {
    ...table,
    headerRow,
    alignments,
    rows,
    columnCount,
    cursorColIndex: insertIndex,
  };
}

export function deleteTableColumn(table: ParsedTable, colIndex: number): ParsedTable {
  if (table.columnCount <= 1) return table;

  const columnCount = table.columnCount - 1;
  const headerRow = table.headerRow.filter((_, idx) => idx !== colIndex);
  const alignments = table.alignments.filter((_, idx) => idx !== colIndex);
  const rows = table.rows.map((row) => row.filter((_, idx) => idx !== colIndex));
  const cursorColIndex = Math.min(colIndex, columnCount - 1);

  return {
    ...table,
    headerRow,
    alignments,
    rows,
    columnCount,
    cursorColIndex,
  };
}

export function setColumnAlignment(
  table: ParsedTable,
  colIndex: number,
  align: ColumnAlignment,
): ParsedTable {
  if (colIndex < 0 || colIndex >= table.columnCount) return table;
  const alignments = [...table.alignments];
  alignments[colIndex] = align;
  return {
    ...table,
    alignments,
  };
}

export function formatMarkdownTable(table: ParsedTable): string[] {
  const colWidths = new Array<number>(table.columnCount).fill(3);

  for (let c = 0; c < table.columnCount; c++) {
    const headerLen = (table.headerRow[c] ?? '').length;
    colWidths[c] = Math.max(colWidths[c]!, headerLen);
    for (const row of table.rows) {
      const cellLen = (row[c] ?? '').length;
      colWidths[c] = Math.max(colWidths[c]!, cellLen);
    }
  }

  const lines: string[] = [];

  const formattedHeader = table.headerRow
    .map((cell, c) => ` ${cell.padEnd(colWidths[c]!)} `)
    .join('|');
  lines.push(`|${formattedHeader}|`);

  const formattedDelimiter = table.alignments
    .map((align, c) => ` ${formatDelimiterCell(align, colWidths[c]!)} `)
    .join('|');
  lines.push(`|${formattedDelimiter}|`);

  for (const row of table.rows) {
    const formattedRow = row
      .map((cell, c) => ` ${cell.padEnd(colWidths[c]!)} `)
      .join('|');
    lines.push(`|${formattedRow}|`);
  }

  return lines;
}

export function tableToCsv(table: ParsedTable): string {
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines: string[] = [];
  lines.push(table.headerRow.map(escapeCsv).join(','));
  for (const row of table.rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

export function updateTableCell(
  table: ParsedTable,
  rowIndex: number,
  colIndex: number,
  newContent: string,
): ParsedTable {
  if (colIndex < 0 || colIndex >= table.columnCount) return table;
  const safeContent = newContent.replace(/\|/g, '\\|');

  if (rowIndex === -1) {
    const headerRow = [...table.headerRow];
    headerRow[colIndex] = safeContent;
    return {
      ...table,
      headerRow,
    };
  }

  if (rowIndex >= 0 && rowIndex < table.rows.length) {
    const rows = table.rows.map((r, rIdx) => {
      if (rIdx !== rowIndex) return r;
      const newRow = [...r];
      newRow[colIndex] = safeContent;
      return newRow;
    });
    return {
      ...table,
      rows,
    };
  }

  return table;
}

export function sortTableRowByColumn(
  table: ParsedTable,
  colIndex: number,
  direction: 'asc' | 'desc',
): ParsedTable {
  if (colIndex < 0 || colIndex >= table.columnCount) return table;

  const sortedRows = [...table.rows].sort((rowA, rowB) => {
    const valA = (rowA[colIndex] ?? '').trim();
    const valB = (rowB[colIndex] ?? '').trim();

    const numA = Number(valA);
    const numB = Number(valB);
    const isNumA = valA !== '' && !Number.isNaN(numA);
    const isNumB = valB !== '' && !Number.isNaN(numB);

    let cmp = 0;
    if (isNumA && isNumB) {
      cmp = numA - numB;
    } else {
      cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    }

    return direction === 'asc' ? cmp : -cmp;
  });

  return {
    ...table,
    rows: sortedRows,
  };
}

export function duplicateTableRow(
  table: ParsedTable,
  rowIndex: number,
): ParsedTable {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;
  const sourceRow = table.rows[rowIndex]!;
  const newRow = [...sourceRow];
  const rows = [...table.rows];
  rows.splice(rowIndex + 1, 0, newRow);

  return {
    ...table,
    rows,
    endLine: table.endLine + 1,
  };
}

export function clearTableCell(
  table: ParsedTable,
  rowIndex: number,
  colIndex: number,
): ParsedTable {
  return updateTableCell(table, rowIndex, colIndex, '');
}

export function clearTableRow(
  table: ParsedTable,
  rowIndex: number,
): ParsedTable {
  if (rowIndex === -1) {
    return {
      ...table,
      headerRow: new Array(table.columnCount).fill(''),
    };
  }
  if (rowIndex >= 0 && rowIndex < table.rows.length) {
    const rows = table.rows.map((r, rIdx) =>
      rIdx === rowIndex ? new Array(table.columnCount).fill('') : r,
    );
    return {
      ...table,
      rows,
    };
  }
  return table;
}

export function deleteEntireTableInText(content: string, sourceLine: number): string {
  const lines = content.split('\n');
  const table = parseMarkdownTable(lines, sourceLine);
  if (!table) return content;
  lines.splice(table.startLine, table.endLine - table.startLine + 1);
  return lines.join('\n');
}
