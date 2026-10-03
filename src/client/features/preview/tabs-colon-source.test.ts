import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { addTabToSource, deleteTabInSource, getTabsTabCount, renameTabInSource, updateTabsSourceHeader } from './tabs-source'

beforeAll(async () => {
  await initI18n()
})

const COLON_TABS = '::: tabs\n:: first\npanel one\n:: second\npanel two\n:::\n'

describe('the :: tab spelling, edited from the preview', () => {
  it('counts the panels the marks open', () => {
    expect(getTabsTabCount(COLON_TABS, 0)).toBe(2)
  })

  it('renames a panel by its marker line and leaves the body alone', () => {
    expect(renameTabInSource(COLON_TABS, 0, 1, 'Renamed')).toBe(
      '::: tabs\n:: first\npanel one\n:: Renamed\npanel two\n:::\n',
    )
  })

  it('gives a nameless marker a name instead of dropping it', () => {
    expect(renameTabInSource('::: tabs\n::\nbody\n:::\n', 0, 0, 'Named')).toBe('::: tabs\n:: Named\nbody\n:::\n')
  })

  it('adds a panel before the closing fence, in the spelling the block already uses', () => {
    const next = addTabToSource(COLON_TABS, 0, 'third')!
    expect(getTabsTabCount(next, 0)).toBe(3)
    expect(next).toContain(':: third')
    expect(next.indexOf(':: third')).toBeLessThan(next.lastIndexOf(':::'))
  })

  it('deletes a panel and the lines that belonged to it', () => {
    const next = deleteTabInSource(COLON_TABS, 0, 0)!
    expect(getTabsTabCount(next, 0)).toBe(1)
    expect(next).not.toContain('panel one')
    expect(next).toContain('panel two')
  })

  it('refuses to delete the only panel, which would leave a tab strip with nothing in it', () => {
    expect(deleteTabInSource('::: tabs\n:: only\nbody\n:::\n', 0, 0)).toBeNull()
  })

  it('keeps reading the @tab spelling first when a note uses both', () => {
    const mixed = '::: tabs\n@tab A\none\n:: stray\nmore\n@tab B\ntwo\n:::\n'
    expect(getTabsTabCount(mixed, 0)).toBe(2)
    expect(renameTabInSource(mixed, 0, 0, 'Renamed')).toContain('@tab Renamed')
  })

  it('rewrites the header of a block written with the t abbreviation, and keeps that spelling', () => {
    const next = updateTabsSourceHeader('::: t\n:: one\nA\n:::\n', 0, () => ({ variant: 'pills' }))
    expect(next).toBe('::: t variant=pills\n:: one\nA\n:::\n')
  })

  it('leaves a tabs block written with directives in the directive form', () => {
    const source = ':::: {tab-set}\n::: tab-item A\nx\n:::\n::::\n'
    expect(updateTabsSourceHeader(source, 0, () => ({ style: 'vertical' }))).toBe(
      ':::: {tab-set} style=vertical\n::: tab-item A\nx\n:::\n::::\n',
    )
  })
})
