import { describe, expect, it } from 'vitest';
import {
  deleteTableColumn,
  deleteTableRow,
  findColumnIndexAtOffset,
  formatMarkdownTable,
  insertTableColumn,
  insertTableRow,
  isDelimiterRow,
  parseMarkdownTable,
  setColumnAlignment,
  splitTableRow,
  tableToCsv,
} from './table-editor';

describe('splitTableRow and delimiter row detection', () => {
  it('splits standard pipe-delimited row', () => {
    const row = '| First | Second | Third |';
    expect(splitTableRow(row)).toEqual(['First', 'Second', 'Third']);
  });

  it('handles escaped pipes correctly', () => {
    const row = '| A \\| B | C |';
    expect(splitTableRow(row)).toEqual(['A \\| B', 'C']);
  });

  it('detects delimiter rows and extracts alignments', () => {
    expect(isDelimiterRow('| :--- | :---: | ---: | --- |')).toBe(true);
    expect(isDelimiterRow('| not | delimiter |')).toBe(false);
  });

  it('finds column index at character offset', () => {
    const line = '| Col 1 | Col 2 | Col 3 |';
    expect(findColumnIndexAtOffset(line, 4)).toBe(0);
    expect(findColumnIndexAtOffset(line, 12)).toBe(1);
    expect(findColumnIndexAtOffset(line, 20)).toBe(2);
  });
});

describe('parseMarkdownTable and modifications', () => {
  const sampleDoc = [
    'Some text before table',
    '',
    '| Name | Age | City |',
    '| :--- | :---: | ---: |',
    '| Alice | 24 | Paris |',
    '| Bob | 30 | London |',
    '',
    'Some text after table',
  ];

  it('parses valid markdown table accurately', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3);
    expect(table).not.toBeNull();
    expect(table?.startLine).toBe(2);
    expect(table?.endLine).toBe(5);
    expect(table?.columnCount).toBe(3);
    expect(table?.headerRow).toEqual(['Name', 'Age', 'City']);
    expect(table?.alignments).toEqual(['left', 'center', 'right']);
    expect(table?.rows).toHaveLength(2);
    expect(table?.cursorRowIndex).toBe(0);
  });

  it('inserts row above and below', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3)!;
    const addedAbove = insertTableRow(table, 0, 'above');
    expect(addedAbove.rows).toHaveLength(3);
    expect(addedAbove.rows[0]).toEqual(['', '', '']);
    expect(addedAbove.rows[1]).toEqual(['Alice', '24', 'Paris']);

    const addedBelow = insertTableRow(table, 0, 'below');
    expect(addedBelow.rows).toHaveLength(3);
    expect(addedBelow.rows[1]).toEqual(['', '', '']);
    expect(addedBelow.rows[2]).toEqual(['Bob', '30', 'London']);
  });

  it('deletes rows properly', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3)!;
    const deleted = deleteTableRow(table, 0);
    expect(deleted.rows).toHaveLength(1);
    expect(deleted.rows[0]).toEqual(['Bob', '30', 'London']);
  });

  it('inserts and deletes columns properly', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3)!;
    const colAdded = insertTableColumn(table, 1, 'right');
    expect(colAdded.columnCount).toBe(4);
    expect(colAdded.headerRow).toEqual(['Name', 'Age', '', 'City']);
    expect(colAdded.rows[0]).toEqual(['Alice', '24', '', 'Paris']);

    const colDeleted = deleteTableColumn(colAdded, 2);
    expect(colDeleted.columnCount).toBe(3);
    expect(colDeleted.headerRow).toEqual(['Name', 'Age', 'City']);
    expect(colDeleted.rows[0]).toEqual(['Alice', '24', 'Paris']);
  });

  it('formats table with alignment and uniform column width', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3)!;
    const modified = setColumnAlignment(table, 0, 'center');
    const formatted = formatMarkdownTable(modified);
    expect(formatted[0]).toBe('| Name  | Age | City   |');
    expect(formatted[1]).toBe('| :---: | :-: | -----: |');
    expect(formatted[2]).toBe('| Alice | 24  | Paris  |');
  });

  it('exports table to CSV format', () => {
    const table = parseMarkdownTable(sampleDoc, 4, 3)!;
    const csv = tableToCsv(table);
    expect(csv).toBe('Name,Age,City\nAlice,24,Paris\nBob,30,London');
  });
});
