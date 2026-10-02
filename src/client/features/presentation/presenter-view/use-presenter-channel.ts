import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProseFont } from '@shared/types'
import type { SlideLayout } from '../slides'
import type { SlidePlan } from '../slide-pagination'

const PRESENTER_CHANNEL_PREFIX = 'inkstone-presenter-sync'

/** The channel of one presenter session. A `BroadcastChannel` reaches every same-origin document that
 * knows its name, and the payload carries the author's private speaker notes and the note's source, so
 * the name has to be the capability: a document that was never handed the token cannot name this
 * channel, ask for that state, or move the projector. */
export function presenterChannelName(token: string): string {
  return `${PRESENTER_CHANNEL_PREFIX}:${token}`
}

/** The token this window was opened with. The presenter route is `?presenter=<token>`, so the query that
 * selects the route is the token — a hand-typed `?presenter=1` in a fresh tab is not a session. */
export function presenterTokenFromLocation(search: string): string | null {
  return new URLSearchParams(search).get('presenter') || null
}

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

export function openPresenterWindow(token: string): Window | null {
  if (typeof window === 'undefined') return null
  const url = `${window.location.origin}${window.location.pathname}?presenter=${encodeURIComponent(token)}`
  const win = window.open(url, 'inkstone-presenter', 'width=1100,height=700,menubar=no,toolbar=no,location=no,status=no')
  win?.focus()
  return win
}

/** What the projector is showing: enough to draw the current and next page and the speaker notes. */
export interface PresenterStateSource {
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
}

export interface PresenterBroadcasterOptions extends PresenterStateSource {
  open: boolean
  /** The session the presenter window was handed, or null until one has been asked for. */
  token: string | null
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
}

export function buildPresenterSlideState(options: PresenterStateSource): PresenterSlideState {
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

/** The console payload, rebuilt only when something a presenter surface reads has actually moved. Both
 * consumers go through here — the window's broadcaster and the in-show fallback panel — so the dependency
 * list exists once. The session hands fresh navigation callbacks on every render, and a payload recomputed
 * per render would turn every chrome redraw, and every auto-hide tick, into another broadcast of the same
 * page. A field added to `PresenterStateSource` has to join this list, or the payload starts freezing
 * while the show moves on. */
export function usePresenterSlideState(source: PresenterStateSource): PresenterSlideState {
  const { noteTitle, slideIndex, subPage, slideCount, pageCount, deck, notes, plans, startedAt, proseFont } = source
  return useMemo(
    () => buildPresenterSlideState({ noteTitle, slideIndex, subPage, slideCount, pageCount, deck, notes, plans, startedAt, proseFont }),
    [noteTitle, slideIndex, subPage, slideCount, pageCount, deck, notes, plans, startedAt, proseFont],
  )
}

function useBroadcasterChannel(
  open: boolean,
  token: string | null,
  stateRef: React.RefObject<PresenterSlideState>,
  navRef: React.RefObject<{ goNext: () => void; goPrev: () => void; jumpTo: (i: number) => void; slideCount: number }>,
  readyRef: React.RefObject<boolean>,
) {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (!open || !token || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(presenterChannelName(token))
    channelRef.current = channel
    readyRef.current = false

    channel.onmessage = (event: MessageEvent<PresenterSyncMessage>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'ready') {
        // The window that announces itself is the audience: the state is handed over here rather than on
        // mount, so a token whose window never arrived — a blocked popup, now served by the fallback
        // panel — keeps the show from reciting the author's notes at an empty channel.
        readyRef.current = true
        try {
          channel.postMessage({ type: 'sync', state: stateRef.current })
        } catch {
          // Best-effort channel post
        }
      } else if (msg.type === 'command') {
        handleInboundCommand(msg.command, navRef.current)
      } else if (msg.type === 'close') {
        readyRef.current = false
      }
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
  }, [open, token, stateRef, navRef, readyRef])

  return channelRef
}

export function usePresenterBroadcaster(options: PresenterBroadcasterOptions): void {
  const { open, token, slideCount, goNext, goPrev, jumpTo } = options
  const navRef = useRef({ goNext, goPrev, jumpTo, slideCount })
  navRef.current = { goNext, goPrev, jumpTo, slideCount }

  const statePayload = usePresenterSlideState(options)
  const stateRef = useRef(statePayload)
  stateRef.current = statePayload
  const readyRef = useRef(false)

  const channelRef = useBroadcasterChannel(open, token, stateRef, navRef, readyRef)

  useEffect(() => {
    // `readyRef` is deliberately not a dependency: a newly arrived window is served by the handshake in
    // the channel, and what this effect owes is only the changes that happen while one is listening.
    if (!open || !readyRef.current || !channelRef.current) return
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

export function usePresenterReceiver(token: string | null): {
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
    if (!token || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(presenterChannelName(token))
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
      // Say the same word the show says on its own way out: without it the projector keeps a listener it
      // no longer has and goes on reciting the deck to a closed window.
      try {
        channel.postMessage({ type: 'close' })
      } catch {
        // Channel already closed
      }
      channel.close()
      channelRef.current = null
    }
  }, [token])

  return { state, connected, sendCommand }
}
