/**
 * Which weekday opens a calendar is a fact about the reader's calendar, not about the two languages
 * this app happens to ship: `locale === 'zh-CN' ? 1 : 0` gets today's locales right only because
 * they are the two it names, and would quietly open a German or Arabic board on Sunday the day a
 * third locale lands. These cases pin the derivation to locale data plus one explicit fallback for
 * a runtime without `Intl.Locale#getWeekInfo`, then check the rendered picker — its weekday labels
 * and the cells that spill in front of the 1st — both follow that number.
 */
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, setLocale } from '../../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../test-render'
import { kanbanWeekStartFor } from '../calendar-helpers'
import { KanbanDatePicker } from './kanban-date-picker'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

afterEach(async () => {
  await setLocale('en-US', false)
})

describe('kanban calendar week start', () => {
  it('reads the first column off the locale, not off the languages the app ships', () => {
    // Sunday for the US, Monday for China and Germany, Saturday for Egypt — all CLDR, none of them
    // a language the board's own locale switch can even select today.
    expect(kanbanWeekStartFor('en-US')).toBe(0)
    expect(kanbanWeekStartFor('zh-CN')).toBe(1)
    expect(kanbanWeekStartFor('de-DE')).toBe(1)
    expect(kanbanWeekStartFor('ar-EG')).toBe(6)
  })

  it('keeps a documented answer when the runtime has no week data', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, 'getWeekInfo')
    Object.defineProperty(Intl.Locale.prototype, 'getWeekInfo', { value: undefined, configurable: true })
    try {
      expect(kanbanWeekStartFor('en-US')).toBe(0)
      expect(kanbanWeekStartFor('zh-CN')).toBe(1)
    } finally {
      if (descriptor)
        Object.defineProperty(Intl.Locale.prototype, 'getWeekInfo', descriptor)
      else
        delete Intl.Locale.prototype.getWeekInfo
    }
  })
})

async function openCalendar(localeCode: 'en-US' | 'zh-CN') {
  await setLocale(localeCode, false)
  const rendered = renderElement(
    createElement(KanbanDatePicker, {
      propertyName: 'Due date',
      value: '2026-09-15',
      onChange: vi.fn(),
    }),
  )
  try {
    act(() => {
      rendered.container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click()
    })
    const panel = rendered.container.querySelector<HTMLElement>('[role="dialog"]')
    expect(panel, 'the picker never opened').not.toBeNull()
    const textOf = (node: Element | undefined) => node?.textContent ?? ''
    const labels = [...panel!.querySelectorAll<Element>('div.grid > span')]
    const dayCells = [...panel!.querySelectorAll<Element>('div.grid button')]
    return {
      firstLabel: textOf(labels[0]),
      leadingCells: dayCells.slice(0, 3).map(textOf),
    }
  } finally {
    rendered.unmount()
  }
}

// 2024-01-07 is a Sunday, the same reference date the picker's own week row walks from.
function narrowWeekday(localeCode: string, jsDay: number): string {
  return new Intl.DateTimeFormat(localeCode, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + jsDay))
}

describe('KanbanDatePicker calendar', () => {
  it('opens the Chinese calendar on the Monday column', async () => {
    // 2026-09-01 is a Tuesday, so a Monday-start month leads with one spilled day.
    const calendar = await openCalendar('zh-CN')
    expect(calendar.firstLabel).toBe(narrowWeekday('zh-CN', 1))
    expect(calendar.leadingCells).toEqual(['31', '1', '2'])
  })

  it('opens the English calendar on the Sunday column', async () => {
    const calendar = await openCalendar('en-US')
    expect(calendar.firstLabel).toBe(narrowWeekday('en-US', 0))
    expect(calendar.leadingCells).toEqual(['30', '31', '1'])
  })
})
