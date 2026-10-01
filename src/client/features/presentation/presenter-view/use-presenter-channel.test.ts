import { act, createElement, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../lib/test-render'
import {
  formatClock,
  formatElapsed,
  openPresenterWindow,
  usePresenterBroadcaster,
  usePresenterReceiver,
  type PresenterBroadcasterOptions,
  type PresenterInboundCommand,
  type PresenterSlideState,
} from './use-presenter-channel'

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

describe('usePresenterBroadcaster and usePresenterReceiver sync protocol', () => {
  let mockChannels: Set<MockBroadcastChannel>

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
      // Broadcast to other channels with the same name
      for (const ch of mockChannels) {
        if (ch !== this && ch.name === this.name && !ch.closed && ch.onmessage) {
          queueMicrotask(() => {
            if (!ch.closed && ch.onmessage) {
              ch.onmessage({ data } as MessageEvent)
            }
          })
        }
      }
    }

    close() {
      this.closed = true
      mockChannels.delete(this)
    }
  }

  beforeEach(() => {
    mockChannels = new Set()
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('broadcasts state to receiver and handles bidirectional commands', async () => {
    const goNext = vi.fn()
    const goPrev = vi.fn()
    const jumpTo = vi.fn()

    const broadcasterProps: PresenterBroadcasterOptions = {
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
      goNext,
      goPrev,
      jumpTo,
    }

    function BroadcasterHarness(props: PresenterBroadcasterOptions) {
      usePresenterBroadcaster(props)
      return null
    }

    let receivedState: PresenterSlideState | null = null
    let isConnected = false
    let triggerCommand: ((cmd: PresenterInboundCommand) => void) | null = null

    function ReceiverHarness() {
      const { state, connected, sendCommand } = usePresenterReceiver()
      useEffect(() => {
        receivedState = state
        isConnected = connected
        triggerCommand = sendCommand
      }, [state, connected, sendCommand])
      return null
    }

    // Mount Broadcaster
    const broadcaster = renderElement(createElement(BroadcasterHarness, broadcasterProps))

    // Mount Receiver
    const receiver = renderElement(createElement(ReceiverHarness))

    // Wait for microtask broadcast
    await vi.waitFor(() => {
      expect(isConnected).toBe(true)
      expect(receivedState).toEqual(
        expect.objectContaining({
          noteTitle: 'Keynote Demo',
          slideIndex: 1,
          slideCount: 3,
          currentSlideSource: '# Slide 2',
          notes: 'note 2',
          startedAt: 1000000,
        }),
      )
    })

    // Receiver sends commands back to broadcaster
    act(() => {
      triggerCommand!('next')
    })
    await vi.waitFor(() => expect(goNext).toHaveBeenCalledTimes(1))

    act(() => {
      triggerCommand!('prev')
    })
    await vi.waitFor(() => expect(goPrev).toHaveBeenCalledTimes(1))

    act(() => {
      triggerCommand!('first')
    })
    await vi.waitFor(() => expect(jumpTo).toHaveBeenCalledWith(0))

    act(() => {
      triggerCommand!('last')
    })
    await vi.waitFor(() => expect(jumpTo).toHaveBeenCalledWith(2))

    // Unmount broadcaster should send close signal
    act(() => {
      broadcaster.unmount()
    })
    await vi.waitFor(() => {
      expect(isConnected).toBe(false)
    })

    act(() => {
      receiver.unmount()
    })
  })
})
