import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { MusicSeekBar } from './music-seek-bar'

function seekBar(): HTMLInputElement {
  const input = document.querySelector('input[type="range"]')
  if (!input) throw new Error('no seek bar on screen')
  return input as HTMLInputElement
}

// Four surfaces draw this bar — the hub footer, the floating card, the status bar and the
// immersive player — so one suppressed outline here is one invisible caret in all of them.
describe('the seek bar', () => {
  it('keeps the focus ring the base layer draws for range inputs', () => {
    const view = renderElement(createElement(MusicSeekBar, {
      valueMs: 30_000,
      durationMs: 120_000,
      onSeek: () => {},
      label: t('music.seek'),
    }))
    expect(seekBar().classList.contains('outline-none')).toBe(false)
    view.unmount()
  })

  it('names itself and announces a readable position', () => {
    const view = renderElement(createElement(MusicSeekBar, {
      valueMs: 30_000,
      durationMs: 120_000,
      onSeek: () => {},
      label: t('music.seek'),
    }))
    expect(seekBar().getAttribute('aria-label')).toBe(t('music.seek'))
    expect(seekBar().getAttribute('aria-valuetext')).toBe('00:30')
    view.unmount()
  })
})
