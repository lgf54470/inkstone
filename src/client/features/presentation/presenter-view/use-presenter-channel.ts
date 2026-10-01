import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProseFont } from '@shared/types'
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
  nextPlan?: SlidePlan
  nextSubPage?: number
  notes: string
  startedAt: number
  proseFont?: ProseFont
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
  proseFont?: ProseFont
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
}

export function buildPresenterSlideState(options: PresenterBroadcasterOptions): PresenterSlideState {
  const { noteTitle, slideIndex, subPage, slideCount, pageCount, deck, notes, plans, startedAt, proseFont } = options
  const currentPlan = plans[slideIndex]

  let nextSlideSource: string | null = null
  let nextLayout: SlideLayout | undefined
  let nextPlan: SlidePlan | undefined
  let nextSubPage = 0

  if (subPage + 1 < pageCount) {
    nextSlideSource = deck[slideIndex] ?? null
    nextLayout = currentPlan?.layout
    nextPlan = currentPlan
    nextSubPage = subPage + 1
  } else if (slideIndex + 1 < deck.length) {
    nextSlideSource = deck[slideIndex + 1] ?? null
    nextLayout = plans[slideIndex + 1]?.layout
    nextPlan = plans[slideIndex + 1]
    nextSubPage = 0
  }

  return {
    noteTitle,
    slideIndex,
    subPage,
    slideCount,
    pageCount,
    currentSlideSource: deck[slideIndex] ?? '',
    currentLayout: currentPlan?.layout,
    nextSlideSource,
    nextLayout,
    nextPlan,
    nextSubPage,
    currentPlan,
    notes: notes[slideIndex] ?? '',
    startedAt,
    proseFont,
  }
}

function useBroadcasterChannel(
  open: boolean,
  stateRef: React.RefObject<PresenterSlideState>,
  navRef: React.RefObject<{ goNext: () => void; goPrev: () => void; jumpTo: (i: number) => void; slideCount: number }>,
) {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (!open || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PRESENTER_CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<PresenterSyncMessage>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'ready') {
        try {
          channel.postMessage({ type: 'sync', state: stateRef.current })
        } catch {
          // Best-effort channel post
        }
      } else if (msg.type === 'command') {
        handleInboundCommand(msg.command, navRef.current)
      }
    }

    try {
      channel.postMessage({ type: 'sync', state: stateRef.current })
    } catch {
      // Best-effort channel post
    }

    return () => {
      try {
        channel.postMessage({ type: 'close' })
      } catch {
        // Channel already closed
      }
      channel.close()
      channelRef.current = null
    }
  }, [open, stateRef, navRef])

  return channelRef
}

export function usePresenterBroadcaster(options: PresenterBroadcasterOptions): void {
  const { open, slideCount, goNext, goPrev, jumpTo } = options
  const navRef = useRef({ goNext, goPrev, jumpTo, slideCount })
  navRef.current = { goNext, goPrev, jumpTo, slideCount }

  const statePayload = buildPresenterSlideState(options)
  const stateRef = useRef(statePayload)
  stateRef.current = statePayload

  const channelRef = useBroadcasterChannel(open, stateRef, navRef)

  useEffect(() => {
    if (!open || !channelRef.current) return
    try {
      channelRef.current.postMessage({ type: 'sync', state: statePayload })
    } catch {
      // Best-effort channel post
    }
  }, [open, statePayload, channelRef])
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
