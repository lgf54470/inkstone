/**
 * The calendar view drew its own week twice over: seven message keys listed Sunday→Saturday, and the
 * cells under them were generated assuming Sunday as well — self-consistent, so nothing looked wrong,
 * but neither half could follow the reader. Both now come off one locale-derived number, and these
 * probes read the pair the reader actually sees: the label sitting over the column, and the date that
 * column's first cell creates an item for. Asserting one against the other is what catches a header
 * that moved while the grid stayed put, which neither half alone would notice.
 */
import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { KanbanData } from '../types'
import { KanbanCalendarView } from './kanban-calendar-view'
import {
  installBilingualLabelHooks,
  LOCALES,
  type LocaleCode,
  messageIn,
  mountIn,
} from './kanban-bilingual-labels.test-helpers'

installBilingualLabelHooks()

const emptyData: KanbanData = { columns: [], items: [], views: [] }

function localDay(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function narrowWeekday(code: LocaleCode, dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(code, { weekday: 'narrow' }).format(new Date(year, month - 1, day))
}

async function firstWeekOfBoard(code: LocaleCode): Promise<{ header: (string | null)[], dateStr: string }> {
  const onAddItem = vi.fn()
  const container = await mountIn(code, createElement(KanbanCalendarView, {
    data: emptyData,
    onOpenDetail: vi.fn(),
    onAddItem,
  }))
  const header = [...container.querySelectorAll<HTMLElement>('[class*="grid-cols-7"] > span')].map((el) => el.textContent)
  const addButton = [...container.querySelectorAll<HTMLElement>('button[aria-label]')]
    .find((el) => el.getAttribute('aria-label') === messageIn(code, 'preview.kanban_new_item'))
  expect(addButton, 'no day cell offers to create an item').toBeDefined()
  act(() => {
    addButton!.click()
  })
  const created = onAddItem.mock.calls[0]?.[0] as Record<string, string> | undefined
  expect(created?.startDate, 'creating from a day cell handed no date').toBeTruthy()
  return { header, dateStr: created!.startDate }
}

describe('the calendar view week', () => {
  it.each(LOCALES)('puts the reader\'s weekday first in %s', async (code) => {
    const { header, dateStr } = await firstWeekOfBoard(code)
    expect(header).toHaveLength(7)
    // CLDR: the week opens Sunday in the US, Monday in China.
    expect(localDay(dateStr)).toBe(code === 'zh-CN' ? 1 : 0)
    header.forEach((label, index) => {
      expect(label, `column ${index}`).toBe(narrowWeekday(code, shiftDays(dateStr, index)))
    })
  })
})

function shiftDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const moved = new Date(year, month - 1, day + days)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`
}
