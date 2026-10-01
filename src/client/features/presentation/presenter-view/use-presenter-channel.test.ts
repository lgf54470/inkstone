import { act, createElement, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../lib/test-render'
import {
  buildPresenterSlideState,
  formatClock,
  formatElapsed,
  openPresenterWindow,
  usePresenterBroadcaster,
  usePresenterReceiver,
  type PresenterBroadcasterOptions,
  type PresenterInboundCommand,
  type PresenterSlideState,
} from './use-presenter-channel'

let mockChannels = new Set<MockBroadcastChannel>()

class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false

  constructor(name: string) {
    this.name = name
    mockChannels.add(this)
  }

  postMessage(data: unknown) {
    if (this.closed) return
    for (const ch of mockChannels) {
      if (ch !== this && ch.name === this.name && !ch.closed && ch.onmessage) {
        queueMicrotask(() => {
          if (!ch.closed && ch.onmessage) ch.onmessage({ data } as MessageEvent)
        })
      }
    }
  }

  close() {
    this.closed = true
    mockChannels.delete(this)
  }
}

describe('use-presenter-channel — formatElapsed and formatClock', () => {
  it('formats elapsed time correctly for seconds, minutes and hours', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(45)).toBe('00:45')
    expect(formatElapsed(60)).toBe('01:00')
    expect(formatElapsed(125)).toBe('02:05')
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3665)).toBe('1:01:05')
    expect(formatElapsed(-10)).toBe('00:00')
  })

  it('formats clock time to HH:mm:ss', () => {
    const fixedDate = new Date(2026, 8, 30, 9, 5, 7)
    expect(formatClock(fixedDate)).toBe('09:05:07')
  })
})

describe('openPresenterWindow', () => {
  it('opens a popup window with presenter query param and focuses it', () => {
    const focusSpy = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ focus: focusSpy } as unknown as Window)

    const win = openPresenterWindow()
    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}?presenter=1`,
      'inkstone-presenter',
      'width=1100,height=700,menubar=no,toolbar=no,location=no,status=no',
    )
    expect(focusSpy).toHaveBeenCalled()
    expect(win).toBeTruthy()

    openSpy.mockRestore()
  })
})

function setupPresenterHarness(broadcasterProps: PresenterBroadcasterOptions) {
  let receivedState: PresenterSlideState | null = null
  let isConnected = false
  let triggerCommand: ((cmd: PresenterInboundCommand) => void) | null = null

  function BroadcasterHarness(props: PresenterBroadcasterOptions) {
    usePresenterBroadcaster(props)
    return null
  }

  function ReceiverHarness() {
    const { state, connected, sendCommand } = usePresenterReceiver()
    useEffect(() => {
      receivedState = state
      isConnected = connected
      triggerCommand = sendCommand
    }, [state, connected, sendCommand])
    return null
  }

  const broadcaster = renderElement(createElement(BroadcasterHarness, broadcasterProps))
  const receiver = renderElement(createElement(ReceiverHarness))

  return {
    broadcaster,
    receiver,
    getState: () => receivedState,
    getConnected: () => isConnected,
    sendCommand: (cmd: PresenterInboundCommand) => triggerCommand!(cmd),
  }
}

function TestBroadcaster({ slide }: { slide: number }) {
  usePresenterBroadcaster({
    open: true,
    noteTitle: 'Channel Test',
    slideIndex: slide,
    subPage: 0,
    slideCount: 3,
    pageCount: 1,
    deck: ['# A', '# B', '# C'],
    notes: ['', '', ''],
    plans: {},
    startedAt: 1000,
    goNext: vi.fn(),
    goPrev: vi.fn(),
    jumpTo: vi.fn(),
  })
  return null
}

beforeEach(() => {
  mockChannels = new Set()
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('usePresenterBroadcaster — sync and unmount', () => {
  it('broadcasts slide state and unmount close signal', async () => {
    const h = setupPresenterHarness({
      open: true,
      noteTitle: 'Keynote Demo',
      slideIndex: 1,
      subPage: 0,
      slideCount: 3,
      pageCount: 1,
      deck: ['# Slide 1', '# Slide 2', '# Slide 3'],
      notes: ['note 1', 'note 2', 'note 3'],
      plans: {},
      startedAt: 1000000,
      goNext: vi.fn(),
      goPrev: vi.fn(),
      jumpTo: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(h.getConnected()).toBe(true)
      expect(h.getState()).toEqual(expect.objectContaining({ noteTitle: 'Keynote Demo', slideIndex: 1 }))
    })

    act(() => h.broadcaster.unmount())
    await vi.waitFor(() => expect(h.getConnected()).toBe(false))
    act(() => h.receiver.unmount())
  })
})

describe('usePresenterReceiver — inbound commands', () => {
  it('relays remote inbound navigation commands to host session', async () => {
    const goNext = vi.fn()
    const goPrev = vi.fn()
    const jumpTo = vi.fn()

    const h = setupPresenterHarness({
      open: true,
      noteTitle: 'Demo',
      slideIndex: 1,
      subPage: 0,
      slideCount: 3,
      pageCount: 1,
      deck: ['# 1', '# 2', '# 3'],
      notes: ['', '', ''],
      plans: {},
      startedAt: 1000,
      goNext,
      goPrev,
      jumpTo,
    })

    await vi.waitFor(() => expect(h.getConnected()).toBe(true))

    act(() => h.sendCommand('next'))
    await vi.waitFor(() => expect(goNext).toHaveBeenCalledTimes(1))

    act(() => h.sendCommand('prev'))
    await vi.waitFor(() => expect(goPrev).toHaveBeenCalledTimes(1))

    act(() => h.sendCommand('first'))
    await vi.waitFor(() => expect(jumpTo).toHaveBeenCalledWith(0))

    act(() => h.sendCommand('last'))
    await vi.waitFor(() => expect(jumpTo).toHaveBeenCalledWith(2))

    act(() => {
      h.broadcaster.unmount()
      h.receiver.unmount()
    })
  })
})

describe('usePresenterReceiver — channel stability', () => {

  it('keeps BroadcastChannel open and avoids close flicker on state updates', async () => {
    let isConnected = false
    let receivedSlide = -1

    function ReceiverHarness() {
      const { state, connected } = usePresenterReceiver()
      useEffect(() => {
        if (state) receivedSlide = state.slideIndex
        isConnected = connected
      }, [state, connected])
      return null
    }

    const broadcaster = renderElement(createElement(TestBroadcaster, { slide: 0 }))
    const receiver = renderElement(createElement(ReceiverHarness))

    await vi.waitFor(() => expect(isConnected).toBe(true))
    expect(receivedSlide).toBe(0)
    const initialChannelsCount = mockChannels.size

    act(() => {
      broadcaster.rerender(createElement(TestBroadcaster, { slide: 1 }))
    })

    await vi.waitFor(() => expect(receivedSlide).toBe(1))
    expect(isConnected).toBe(true)
    expect(mockChannels.size).toBe(initialChannelsCount)

    act(() => {
      broadcaster.unmount()
      receiver.unmount()
    })
  })
})

const subpageTestPlans = {
  0: {
    pages: [{ from: 0, to: 2, top: 0 }, { from: 2, to: 4, top: 300 }],
    scales: [1, 1, 1, 1],
  },
}

describe('buildPresenterSlideState — subpage calculation', () => {

  it('previews next subpage when current slide has remaining subpages', () => {
    const state = buildPresenterSlideState({
      open: true,
      noteTitle: 'Multi-page Deck',
      slideIndex: 0,
      subPage: 0,
      slideCount: 2,
      pageCount: 2,
      deck: ['# Page 1\n\nPart 1\n\nPart 2', '# Page 2'],
      notes: ['note 1', 'note 2'],
      plans: subpageTestPlans,
      startedAt: 5000,
      goNext: vi.fn(),
      goPrev: vi.fn(),
      jumpTo: vi.fn(),
    })

    expect(state.nextSlideSource).toBe('# Page 1\n\nPart 1\n\nPart 2')
    expect(state.nextSubPage).toBe(1)
    expect(state.nextPlan).toBe(subpageTestPlans[0])
  })

  it('previews next slide when on the last subpage of current slide', () => {
    const state = buildPresenterSlideState({
      open: true,
      noteTitle: 'Multi-page Deck',
      slideIndex: 0,
      subPage: 1,
      slideCount: 2,
      pageCount: 2,
      deck: ['# Page 1\n\nPart 1\n\nPart 2', '# Page 2'],
      notes: ['note 1', 'note 2'],
      plans: subpageTestPlans,
      startedAt: 5000,
      goNext: vi.fn(),
      goPrev: vi.fn(),
      jumpTo: vi.fn(),
    })

    expect(state.nextSlideSource).toBe('# Page 2')
    expect(state.nextSubPage).toBe(0)
  })
})

describe('buildPresenterSlideState — end of deck', () => {
  it('sets nextSlideSource to null on the final slide and subpage', () => {
    const state = buildPresenterSlideState({
      open: true,
      noteTitle: 'End Deck',
      slideIndex: 1,
      subPage: 0,
      slideCount: 2,
      pageCount: 1,
      deck: ['# First', '# Final'],
      notes: ['', ''],
      plans: {},
      startedAt: 5000,
      goNext: vi.fn(),
      goPrev: vi.fn(),
      jumpTo: vi.fn(),
    })

    expect(state.nextSlideSource).toBeNull()
  })
})
