import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlideLayout } from '../slides'
import type { SlidePlan } from '../slide-pagination'

export const PRESENTER_CHANNEL_NAME = 'inkstone-presenter-sync'

export type PresenterInboundCommand = 'next' | 'prev' | 'first' | 'last'

export interface PresenterSlideState {
  noteTitle: string
  slideIndex: number
  subPage: number
  slideCount: number
  pageCount: number
  currentSlideSource: string
  currentLayout?: SlideLayout
  nextSlideSource: string | null
  nextLayout?: SlideLayout
  currentPlan?: SlidePlan
  notes: string
  startedAt: number
}

export type PresenterSyncMessage =
  | { type: 'ready' }
  | { type: 'command'; command: PresenterInboundCommand }
  | { type: 'sync'; state: PresenterSlideState }
  | { type: 'close' }

export function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safeSeconds / 3600)
  const m = Math.floor((safeSeconds % 3600) / 60)
  const s = safeSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) {
    return `${h}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export function formatClock(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function openPresenterWindow(): Window | null {
  if (typeof window === 'undefined') return null
  const url = `${window.location.origin}${window.location.pathname}?presenter=1`
  const win = window.open(url, 'inkstone-presenter', 'width=1100,height=700,menubar=no,toolbar=no,location=no,status=no')
  win?.focus()
  return win
}

export interface PresenterBroadcasterOptions {
  open: boolean
  noteTitle: string
  slideIndex: number
  subPage: number
  slideCount: number
  pageCount: number
  deck: string[]
  notes: string[]
  plans: Record<number, SlidePlan>
  startedAt: number
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
}

function buildPresenterSlideState(options: PresenterBroadcasterOptions): PresenterSlideState {
  const { noteTitle, slideIndex, subPage, slideCount, pageCount, deck, notes, plans, startedAt } = options
  const currentPlan = plans[slideIndex]
  return {
    noteTitle,
    slideIndex,
    subPage,
    slideCount,
    pageCount,
    currentSlideSource: deck[slideIndex] ?? '',
    currentLayout: currentPlan?.layout,
    nextSlideSource: slideIndex + 1 < deck.length ? (deck[slideIndex + 1] ?? null) : null,
    nextLayout: plans[slideIndex + 1]?.layout,
    currentPlan,
    notes: notes[slideIndex] ?? '',
    startedAt,
  }
}

export function usePresenterBroadcaster(options: PresenterBroadcasterOptions): void {
  const { open, slideCount, goNext, goPrev, jumpTo } = options
  const channelRef = useRef<BroadcastChannel | null>(null)
  const navRef = useRef({ goNext, goPrev, jumpTo, slideCount })
  navRef.current = { goNext, goPrev, jumpTo, slideCount }

  const statePayload = buildPresenterSlideState(options)

  const broadcastState = useCallback((channel: BroadcastChannel) => {
    try {
      channel.postMessage({ type: 'sync', state: statePayload })
    } catch {
      // Best-effort channel post
    }
  }, [statePayload])

  useEffect(() => {
    if (!open || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PRESENTER_CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<PresenterSyncMessage>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'ready') {
        broadcastState(channel)
      } else if (msg.type === 'command') {
        handleInboundCommand(msg.command, navRef.current)
      }
    }

    broadcastState(channel)

    return () => {
      try {
        channel.postMessage({ type: 'close' })
      } catch {
        // Channel already closed
      }
      channel.close()
      channelRef.current = null
    }
  }, [open, broadcastState])
}

function handleInboundCommand(command: PresenterInboundCommand, nav: { goNext: () => void; goPrev: () => void; jumpTo: (i: number) => void; slideCount: number }) {
  switch (command) {
    case 'next':
      return nav.goNext()
    case 'prev':
      return nav.goPrev()
    case 'first':
      return nav.jumpTo(0)
    case 'last':
      return nav.jumpTo(nav.slideCount - 1)
  }
}

export function usePresenterReceiver(): {
  state: PresenterSlideState | null
  connected: boolean
  sendCommand: (command: PresenterInboundCommand) => void
} {
  const [state, setState] = useState<PresenterSlideState | null>(null)
  const [connected, setConnected] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const sendCommand = useCallback((command: PresenterInboundCommand) => {
    try {
      channelRef.current?.postMessage({ type: 'command', command })
    } catch {
      // Best-effort broadcast
    }
  }, [])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PRESENTER_CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<PresenterSyncMessage>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'sync') {
        setState(msg.state)
        setConnected(true)
      } else if (msg.type === 'close') {
        setConnected(false)
      }
    }

    try {
      channel.postMessage({ type: 'ready' })
    } catch {
      // Channel initialization
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [])

  return { state, connected, sendCommand }
}
