import { describe, expect, it } from 'vitest'
import { applyPanelColumnTracks } from './enhance'
import { renderMarkdown } from './renderer'

function render(source: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(source).html
  applyPanelColumnTracks(host)
  return host
}

describe('column track handoff', () => {
  it('gives the stylesheet the tracks a header stated, as a custom property rather than a style', () => {
    const grid = render('::: cols 1fr 2fr\none\n::\ntwo\n:::').querySelector<HTMLElement>('.markdown-cols')
    expect(grid?.style.getPropertyValue('--panel-cols-tracks')).toBe('1fr 2fr')
  })

  it('leaves a block without tracks alone, so the counted columns still apply', () => {
    const grid = render('::: cols\none\n::\ntwo\n:::').querySelector<HTMLElement>('.markdown-cols')
    expect(grid?.hasAttribute('data-cols-tracks')).toBe(false)
    expect(grid?.style.getPropertyValue('--panel-cols-tracks')).toBe('')
  })

  it('refuses a track list that does not look like tracks', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="markdown-cols" data-cols-tracks="1fr url(http://x)"></div>'
    applyPanelColumnTracks(host)
    expect(host.querySelector<HTMLElement>('.markdown-cols')?.style.getPropertyValue('--panel-cols-tracks')).toBe('')
  })

  it('refuses a track list longer than the renderer would have written', () => {
    const host = document.createElement('div')
    host.innerHTML = `<div class="markdown-cols" data-cols-tracks="${'1fr '.repeat(7).trim()}"></div>`
    applyPanelColumnTracks(host)
    expect(host.querySelector<HTMLElement>('.markdown-cols')?.style.getPropertyValue('--panel-cols-tracks')).toBe('')
  })
})
