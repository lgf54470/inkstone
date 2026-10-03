import { describe, expect, it } from 'vitest'
import {
  COLS_OPTION_DEFAULTS,
  formatColsHeader,
  formatColsOptions,
  formatTimelineItem,
  matchPanelHeader,
  parseTimelineItem,
} from './renderer'
import type { ColsOptions } from './renderer'

function cols(source: string): ColsOptions | undefined {
  const panel = matchPanelHeader(source)
  return panel?.header.kind === 'cols' ? panel.header.cols : undefined
}

function align(source: string): string | undefined {
  const panel = matchPanelHeader(source)
  return panel?.header.kind === 'align' ? panel.header.align : undefined
}

describe('the panel header vocabulary', () => {
  it('claims only the kinds it renders', () => {
    expect(matchPanelHeader('::: center')?.header.kind).toBe('align')
    expect(matchPanelHeader('::: cols')?.header.kind).toBe('cols')
    expect(matchPanelHeader('::: tabs')?.header.kind).toBe('tabs')
    expect(matchPanelHeader('::: t pills')?.header.kind).toBe('tabs')
    expect(matchPanelHeader('::: timeline')?.header.kind).toBe('timeline')
    expect(matchPanelHeader('::: tip')?.header.kind).toBe('callout')
    expect(matchPanelHeader('::: tab-item One')).toBeNull()
    expect(matchPanelHeader('::: {tab-set}')).toBeNull()
    expect(matchPanelHeader('::: details Open')).toBeNull()
    expect(matchPanelHeader('::: not-a-kind')).toBeNull()
  })

  it('reports the colon count that has to close the block', () => {
    expect(matchPanelHeader('::::: cols')?.markerLength).toBe(5)
    expect(matchPanelHeader('::: cols')?.markerLength).toBe(3)
  })

  it('hands the remainder of a tabs header to the tabs options', () => {
    expect(matchPanelHeader('::: t pills center')?.info).toBe('pills center')
    expect(matchPanelHeader('::: tabs')?.info).toBe('')
  })

  it('reads an indented header the same as a flush one', () => {
    expect(align(':::   justify')).toBe('justify')
  })
})

describe('column options', () => {
  it('defaults to inferred columns with nothing drawn between them', () => {
    expect(cols('::: cols')).toEqual(COLS_OPTION_DEFAULTS)
  })

  it('reads every spelling of a stated column count', () => {
    expect(cols('::: 2cols')?.fixedCount).toBe(2)
    expect(cols('::: 6cols')?.fixedCount).toBe(6)
    expect(cols('::: cols 4')?.fixedCount).toBe(4)
    expect(cols('::: cols cols=5')?.fixedCount).toBe(5)
    expect(cols('::: cols 7')?.fixedCount).toBeNull()
  })

  it('reads a track list only when there is more than one track', () => {
    expect(cols('::: cols 1fr 2fr')?.tracks).toBe('1fr 2fr')
    expect(cols('::: cols 50% 50%')?.tracks).toBe('50% 50%')
    expect(cols('::: cols 1fr 2fr 3fr 4fr 5fr 6fr')?.tracks).toBe('1fr 2fr 3fr 4fr 5fr 6fr')
    expect(cols('::: cols 1fr 2fr 3fr 4fr 5fr 6fr 7fr')?.tracks).toBeNull()
    expect(cols('::: cols 1fr')?.tracks).toBeNull()
    expect(cols('::: cols 1fr nonsense')?.tracks).toBeNull()
  })

  it('accepts a gap by name or by its common synonym', () => {
    expect(cols('::: cols gap=wide')?.gap).toBe('wide')
    expect(cols('::: cols loose')?.gap).toBe('wide')
    expect(cols('::: cols gap=squished')?.gap).toBe('normal')
  })

  it('keeps an alignment keyword as content alignment, not as a second kind', () => {
    expect(cols('::: cols center')?.align).toBe('center')
    expect(cols('::: cols align=justify')?.align).toBe('justify')
    expect(cols('::: cols 2 r')?.align).toBe('right')
  })

  it('writes back what it read, dropping the defaults', () => {
    const read = cols('::: cols 1fr 2fr gap=wide divider center')
    expect(formatColsOptions(read!)).toBe('1fr 2fr gap=wide divider center')
    expect(formatColsHeader(read!, 3)).toBe('::: cols 1fr 2fr gap=wide divider center')
  })

  it('writes a round-trippable header for an untouched block', () => {
    expect(formatColsHeader(COLS_OPTION_DEFAULTS, 3)).toBe('::: cols')
    expect(matchPanelHeader(formatColsHeader(COLS_OPTION_DEFAULTS, 4))?.markerLength).toBe(4)
  })

  it('prefers the tracks over the count it also carries', () => {
    const read = cols('::: cols 3 1fr 2fr')
    expect(formatColsOptions(read!)).toBe('1fr 2fr')
  })
})

describe('timeline nodes', () => {
  it('splits the three parts a node line can carry', () => {
    expect(parseTimelineItem('[done] 2024-01-15 shipped')).toEqual({ status: 'done', time: '2024-01-15', title: 'shipped' })
    expect(parseTimelineItem('2024-01-15 shipped')).toEqual({ status: 'todo', time: '2024-01-15', title: 'shipped' })
    expect(parseTimelineItem('shipped')).toEqual({ status: 'todo', time: '', title: 'shipped' })
    expect(parseTimelineItem('')).toEqual({ status: 'todo', time: '', title: '' })
  })

  it('reads the symbols as well as the words', () => {
    expect(parseTimelineItem('[✓] done').status).toBe('done')
    expect(parseTimelineItem('[~] mid').status).toBe('doing')
    expect(parseTimelineItem('[★] big').status).toBe('milestone')
    expect(parseTimelineItem('[!] broken').status).toBe('error')
    expect(parseTimelineItem('[nonsense] other').status).toBe('todo')
  })

  it('writes back what it read, and drops a status that says nothing', () => {
    const parsed = parseTimelineItem('[milestone] v1.0 launch')
    expect(formatTimelineItem(parsed, '::')).toBe(':: [milestone] v1.0 launch')
    expect(formatTimelineItem(parseTimelineItem('plain title'), '::')).toBe(':: plain title')
  })

  it('keeps a node round-trippable through a status change', () => {
    const rewritten = formatTimelineItem({ ...parseTimelineItem('2024-01-15 launch'), status: 'doing' }, '::')
    expect(rewritten).toBe(':: [doing] 2024-01-15 launch')
    expect(parseTimelineItem(rewritten.slice(3)).status).toBe('doing')
  })
})
