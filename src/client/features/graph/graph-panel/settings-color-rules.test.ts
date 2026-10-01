import { act, createElement, type ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import { GRAPH_COLOR_GROUP_LIMIT, type GraphColorGroup, type GraphPreferences } from '../../../lib/graph-settings'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { COLOR_GROUP_QUERY_MAX, DEFAULT_PREFERENCES } from './constants'
import { GraphSettingsPanel } from './settings'

/**
 * The colour rules live in the persisted preferences, so a panel that renders them without writing
 * them back would be decoration. These cases press the controls a reader would press and read the
 * preference key and value each press writes, including the rule id the panel generated.
 */
beforeAll(async () => {
  await initI18n()
})

const rule: GraphColorGroup = { id: 'rule-1', query: 'tag:work', color: '#dc2626' }

function prefs(colorGroups: GraphColorGroup[]): GraphPreferences {
  return { ...DEFAULT_PREFERENCES, colorGroups }
}

function panel(colorGroups: GraphColorGroup[], onChange: (key: string, value: unknown) => void): ReactNode {
  return createElement(GraphSettingsPanel, {
    prefs: prefs(colorGroups),
    onChange,
    folders: [],
    tags: [],
    selectedTags: [],
    isLimitOpen: false,
    onToggleLimit: vi.fn(),
    onClose: vi.fn(),
    onResetTagFilters: vi.fn(),
    onRestoreDefaults: vi.fn(),
  })
}

function colorGroupWrites(onChange: ReturnType<typeof vi.fn>): Array<GraphColorGroup[]> {
  return onChange.mock.calls
    .filter((call) => call[0] === 'colorGroups')
    .map((call) => call[1] as GraphColorGroup[])
}

function press(element: HTMLElement): void {
  act(() => { element.click(); })
}

function typeQuery(container: HTMLElement, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${t('graph.color_rule_query')}"]`)!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const mounted: RenderedElement[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

function open(colorGroups: GraphColorGroup[], onChange: (key: string, value: unknown) => void): HTMLElement {
  const rendered = renderElement(panel(colorGroups, onChange))
  mounted.push(rendered)
  return rendered.container
}

function addButton(container: HTMLElement): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes(t('graph.add_color_rule'))) as HTMLButtonElement
}

describe('graph color rule settings', () => {
  it('adds a rule to the preferences with a fresh id and a palette colour', () => {
    const onChange = vi.fn()
    const container = open([], onChange)
    press(addButton(container))
    const writes = colorGroupWrites(onChange)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toHaveLength(1)
    expect(writes[0]![0]!.query).toBe('')
    expect(writes[0]![0]!.color).toBe(ORGANIZER_COLORS[0])
    expect(writes[0]![0]!.id).toBeTruthy()
  })

  it('writes the filter line a reader types back into the same rule', () => {
    const onChange = vi.fn()
    const container = open([rule], onChange)
    typeQuery(container, 'tag:work -path:archive')
    const writes = colorGroupWrites(onChange)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toEqual([{ ...rule, query: 'tag:work -path:archive' }])
  })

  it('marks the selected swatch and writes the palette colour it pressed', () => {
    const onChange = vi.fn()
    const container = open([rule], onChange)
    const pressed = container.querySelector<HTMLButtonElement>('button[aria-label="#059669"]')!
    expect(pressed.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="#dc2626"]')!.getAttribute('aria-pressed')).toBe('true')
    press(pressed)
    expect(colorGroupWrites(onChange)[0]).toEqual([{ ...rule, color: '#059669' }])
  })
})

describe('graph color rule list controls', () => {

  it('removes a rule by id instead of by position', () => {
    const onChange = vi.fn()
    const second = { id: 'rule-2', query: 'urgent', color: '#0891b2' }
    const container = open([rule, second], onChange)
    const removeButtons = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.getAttribute('aria-label') === t('graph.color_rule_remove'))
    expect(removeButtons).toHaveLength(2)
    press(removeButtons[0]!)
    expect(colorGroupWrites(onChange)[0]).toEqual([second])
  })

  it('stops offering rules once the preference limit is reached', () => {
    const onChange = vi.fn()
    const atLimit = Array.from({ length: GRAPH_COLOR_GROUP_LIMIT }, (_, index) => ({ ...rule, id: `rule-${index}` }))
    const container = open(atLimit, onChange)
    expect(addButton(container).disabled).toBe(true)
  })

  it('names the rule list as a group and explains first-match-wins', () => {
    const container = open([rule], vi.fn())
    expect(container.querySelector('[role="group"][aria-label="' + t('graph.color_groups') + '"]')).toBeTruthy()
    expect(container.textContent).toContain(t('graph.color_rule_hint'))
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${t('graph.color_rule_query')}"]`)!
    expect(input.maxLength).toBe(COLOR_GROUP_QUERY_MAX)
  })
})
