/**
 * Writing CSV, once (SH-64 and FEA-09 both hand the numbers on screen to a file). A second copy of
 * the escaping rules is how one export ends up quoting a value the other does not, so both the share
 * dashboard's export and the blog dashboard's export read these two functions.
 */

const CSV_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const CSV_FORMULA_LEAD = /^[=+\-@]/

/**
 * RFC 4180 cell: always quoted, embedded quotes doubled, so a comma, a quote or a line break can
 * never split a visit into extra columns or rows. Control characters become spaces (these fields are
 * all single-line values) and a leading =, +, - or @ gets an apostrophe so a spreadsheet shows the
 * text instead of evaluating a remote formula (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '').replace(CSV_CONTROL_CHARS, ' ')
  const safe = CSV_FORMULA_LEAD.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

/** The whole file, with the BOM that makes a spreadsheet read UTF-8 names as text rather than mojibake. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
