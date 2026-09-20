import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportVisitsToCsv } from './share-helpers'

type VisitRow = Parameters<typeof exportVisitsToCsv>[0][number]

const HEADERS = [
  'ID', 'Time', 'Note Title', 'Slug', 'Country', 'City',
  'Referrer', 'Referrer Host', 'Device', 'OS', 'Browser', 'Type',
]

const EXPECTED_HEADER = HEADERS.map((name) => `"${name}"`).join(',')

const FIRST_ROW = [
  '7', '1970-01-01T00:00:00.000Z', 'Shared note', 'abc123', 'US', '',
  '', 'ref.example', 'desktop', 'macOS', 'Chrome', 'Real',
]

function visitRow(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: 7,
    visitedAt: 0,
    noteTitle: 'Shared note',
    slug: 'abc123',
    country: 'US',
    city: null,
    referrer: null,
    referrerHost: 'ref.example',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    isBot: false,
    ...overrides,
  }
}

/** Minimal RFC 4180 reader: enough to prove no cell leaked into a second column. */
function readQuotedCell(line: string, start: number): [cell: string, next: number] {
  let cell = ''
  let index = start + 1
  while (index < line.length) {
    if (line[index] !== '"') {
      cell += line[index]
      index += 1
      continue
    }
    if (line[index + 1] !== '"') return [cell, index + 1]
    cell += '"'
    index += 2
  }
  return [cell, index]
}

function parseRow(line: string): string[] {
  const cells: string[] = []
  let next = 0
  while (next < line.length) {
    const [cell, after] = readQuotedCell(line, next)
    cells.push(cell)
    next = after + 1
  }
  return cells
}

const downloaded: Blob[] = []
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  downloaded.length = 0
  // The download is the module's only side effect; capture the blob it hands the
  // browser and stub the anchor click so jsdom never tries to navigate.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      downloaded.push(blob)
      return 'blob:csv'
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} })
  // The anchor has to really land in the body: the module removes it again, and a
  // mock that swallows the append turns that removal into a not-a-child throw.
  const appendChild = document.body.appendChild.bind(document.body)
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLAnchorElement) node.click = () => {}
    return appendChild(node)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL })
})

async function exportedCsv(visits: VisitRow[]): Promise<string> {
  exportVisitsToCsv(visits, 'visits.csv')
  expect(downloaded).toHaveLength(1)
  return downloaded[0].text()
}

function dataLines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, '').split('\r\n')
}

describe('visit log CSV escaping (SH-79)', () => {
  it('quotes the header and every cell so the columns line up', async () => {
    const csv = await exportedCsv([visitRow()])
    const [header, line] = dataLines(csv)

    expect(header).toBe(EXPECTED_HEADER)
    expect(parseRow(header)).toEqual(HEADERS)
    expect(line).toBe(FIRST_ROW.map((cell) => `"${cell}"`).join(','))
  })

  it('keeps a comma, a quote or a line break inside one column', async () => {
    const csv = await exportedCsv([visitRow({ noteTitle: 'a,b\n"c"', city: 'Paris, FR' })])
    const lines = dataLines(csv)
    const line = lines[1]

    expect(lines).toHaveLength(2)
    expect(line).toContain('"a,b ""c"""')
    expect(parseRow(line)).toEqual([...FIRST_ROW.slice(0, 2), 'a,b "c"', ...FIRST_ROW.slice(3, 5), 'Paris, FR', ...FIRST_ROW.slice(6)])
  })

  it('neutralises a cell a spreadsheet would evaluate as a formula', async () => {
    const csv = await exportedCsv([visitRow({ noteTitle: '=HYPERLINK("http://evil.example")' })])

    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`)
    expect(csv).not.toContain(',"=HYPERLINK')
  })

})

describe('visit log CSV covers every column (SH-79)', () => {
  it('escapes and neutralises every column, not just the title and the referrer', async () => {
    const csv = await exportedCsv([
      visitRow({
        city: 'A "quoted" city',
        deviceType: '+plus',
        os: '-minus',
        browser: 'B,C',
        referrer: '@formula',
        referrerHost: 'host\r\nnewline',
      }),
    ])
    const line = dataLines(csv)[1]

    expect(line).toContain('"A ""quoted"" city"')
    expect(line).toContain('"\'+plus"')
    expect(line).toContain('"\'-minus"')
    expect(line).toContain('"B,C"')
    expect(line).toContain('"\'@formula"')
    expect(parseRow(line)).toHaveLength(HEADERS.length)
    expect(parseRow(line)[5]).toBe('A "quoted" city')
    expect(parseRow(line)[7]).toBe('host  newline')
  })

  it('keeps a bot, author and self visit labelled in the Type column', async () => {
    const csv = await exportedCsv([
      visitRow({ id: 1, isBot: true, botName: 'GPTBot' }),
      visitRow({ id: 2, isOwner: true }),
      visitRow({ id: 3, isSelfReferrer: true }),
    ])

    expect(dataLines(csv).slice(1).map((line) => parseRow(line)[11])).toEqual([
      'Bot (GPTBot)', 'Author', 'Self',
    ])
  })
})
