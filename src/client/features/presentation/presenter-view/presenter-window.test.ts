import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement } from '../../../lib/test-render'
import { PresenterWindow, type PresenterWindowProps } from './presenter-window'
import type { PresenterSlideState } from './use-presenter-channel'

beforeAll(async () => {
  await initI18n()
})

let cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  document.body.innerHTML = ''
})

function renderPresenter(props: PresenterWindowProps = {}) {
  const rendered = renderElement(createElement(PresenterWindow, props))
  cleanups.push(rendered.unmount)
  return rendered
}

const mockSlideState: PresenterSlideState = {
  noteTitle: 'Project Architecture',
  slideIndex: 1,
  subPage: 0,
  slideCount: 4,
  pageCount: 1,
  currentSlideSource: '# Core Pillars\n\n- Security\n- Performance',
  nextSlideSource: '# Roadmap\n\nQ4 Deliverables',
  notes: 'Emphasize zero overhead and deterministic fallbacks.',
  startedAt: Date.now() - 65000, // 1m 05s ago
}

describe('PresenterWindow — layout and rendering', () => {
  it('renders disconnected placeholder when state is empty', () => {
    const { container } = renderPresenter()
    expect(container.textContent).toContain(t('workspace.presentation_disconnected'))
  })

  it('renders title, connection badge, progress counter, and timer when connected', () => {
    const { container } = renderPresenter({ initialState: mockSlideState })
    expect(container.textContent).toContain('Project Architecture')
    expect(container.textContent).toContain(t('workspace.presentation_connected'))
    expect(container.textContent).toContain('2 / 4')
    expect(container.textContent).toContain(t('workspace.presentation_current_slide'))
    expect(container.textContent).toContain(t('workspace.presentation_next_slide'))
    expect(container.textContent).toContain(t('workspace.presentation_speaker_notes'))
    expect(container.textContent).toContain('Emphasize zero overhead and deterministic fallbacks.')
  })

  it('renders fallback when current slide has no speaker notes', () => {
    const emptyNotesState: PresenterSlideState = {
      ...mockSlideState,
      notes: '',
    }
    const { container } = renderPresenter({ initialState: emptyNotesState })
    expect(container.textContent).toContain(t('workspace.presentation_no_notes'))
  })

  it('renders end-of-deck notice when on the final slide', () => {
    const finalSlideState: PresenterSlideState = {
      ...mockSlideState,
      slideIndex: 3,
      nextSlideSource: null,
    }
    const { container } = renderPresenter({ initialState: finalSlideState })
    expect(container.textContent).toContain(t('workspace.presentation_end_of_deck'))
  })
})

describe('PresenterWindow — navigation controls and shortcuts', () => {
  it('triggers onCommand on Prev and Next button clicks', () => {
    const onCommand = vi.fn()
    const { container } = renderPresenter({ initialState: mockSlideState, onCommand })

    const prevBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_prev')}"]`)
    const nextBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_next')}"]`)
    expect(prevBtn).toBeTruthy()
    expect(nextBtn).toBeTruthy()

    prevBtn?.click()
    expect(onCommand).toHaveBeenCalledWith('prev')

    nextBtn?.click()
    expect(onCommand).toHaveBeenCalledWith('next')
  })

  it('disables prev button at the start of presentation', () => {
    const startState: PresenterSlideState = {
      ...mockSlideState,
      slideIndex: 0,
      subPage: 0,
    }
    const { container } = renderPresenter({ initialState: startState })
    const prevBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_prev')}"]`)
    expect(prevBtn?.disabled).toBe(true)
  })

  it('disables next button at the end of presentation', () => {
    const endState: PresenterSlideState = {
      ...mockSlideState,
      slideIndex: 3,
      slideCount: 4,
      subPage: 0,
      pageCount: 1,
    }
    const { container } = renderPresenter({ initialState: endState })
    const nextBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_next')}"]`)
    expect(nextBtn?.disabled).toBe(true)
  })

  it('responds to keyboard navigation shortcuts', () => {
    const onCommand = vi.fn()
    renderPresenter({ initialState: mockSlideState, onCommand })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(onCommand).toHaveBeenCalledWith('next')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(onCommand).toHaveBeenCalledWith('prev')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    expect(onCommand).toHaveBeenCalledWith('next')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }))
    expect(onCommand).toHaveBeenCalledWith('next')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }))
    expect(onCommand).toHaveBeenCalledWith('prev')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(onCommand).toHaveBeenCalledWith('first')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
    expect(onCommand).toHaveBeenCalledWith('last')
  })

  it('leaves arrow keys to speaker notes pane when focused so presenter can scroll', () => {
    const onCommand = vi.fn()
    const { container } = renderPresenter({ initialState: mockSlideState, onCommand })

    const notesPane = container.querySelector('[data-speaker-notes]')
    expect(notesPane).toBeTruthy()

    notesPane?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onCommand).not.toHaveBeenCalledWith('next')

    notesPane?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(onCommand).not.toHaveBeenCalledWith('prev')
  })

  it('closes window on Escape', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    renderPresenter({ initialState: mockSlideState })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closeSpy).toHaveBeenCalledTimes(1)

    closeSpy.mockRestore()
  })
})

describe('PresenterWindow — timer interactions', () => {
  it('toggles pause and resume on timer button click', () => {
    const { container } = renderPresenter({ initialState: mockSlideState })
    const pauseBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_timer_pause')}"]`)
    expect(pauseBtn).toBeTruthy()

    act(() => {
      pauseBtn?.click()
    })

    const resumeBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_timer_resume')}"]`)
    expect(resumeBtn).toBeTruthy()

    act(() => {
      resumeBtn?.click()
    })

    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_timer_pause')}"]`)).toBeTruthy()
  })

  it('resets timer when reset button is clicked', () => {
    const { container } = renderPresenter({ initialState: mockSlideState })
    const resetBtn = container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_timer_reset')}"]`)
    expect(resetBtn).toBeTruthy()

    act(() => {
      resetBtn?.click()
    })

    expect(container.textContent).toContain('00:00')
  })
})
