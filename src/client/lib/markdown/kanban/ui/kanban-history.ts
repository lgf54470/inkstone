import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react'
import type { KanbanData } from '../types'

export type CommitKanbanData = (next: KanbanData | ((prev: KanbanData) => KanbanData)) => void

const MAX_HISTORY_STEPS = 30

interface HistoryState {
  data: KanbanData
  past: KanbanData[]
  future: KanbanData[]
}

type HistoryAction =
  | { type: 'commit'; next: KanbanData }
  | { type: 'undo' }
  | { type: 'redo' }

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'commit') {
    if (action.next === state.data) return state
    return {
      data: action.next,
      past: [...state.past.slice(-(MAX_HISTORY_STEPS - 1)), state.data],
      future: [],
    }
  }
  if (action.type === 'undo') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]
    return {
      data: previous,
      past: state.past.slice(0, -1),
      future: [state.data, ...state.future.slice(0, MAX_HISTORY_STEPS - 1)],
    }
  }
  if (action.type === 'redo') {
    if (state.future.length === 0) return state
    const next = state.future[0]
    return {
      data: next,
      past: [...state.past.slice(-(MAX_HISTORY_STEPS - 1)), state.data],
      future: state.future.slice(1),
    }
  }
  return state
}

// Listening on the instance container (not window) keeps Ctrl+Z with the board
// that actually owns the focused element: focus on the surrounding note or on a
// second board must not undo this instance's history.
function useHistoryKeyboardShortcuts(
  undo: () => void,
  redo: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const modKey = isMac ? e.metaKey : e.ctrlKey
      if (!modKey) return

      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y' && !isMac) {
        e.preventDefault()
        redo()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, containerRef])
}

export function useKanbanHistory(
  initialData: KanbanData,
  onUpdateData: (next: KanbanData) => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [state, dispatch] = useReducer(historyReducer, {
    data: initialData,
    past: [],
    future: [],
  })

  const dataRef = useRef(state.data)
  dataRef.current = state.data
  const onUpdateRef = useRef(onUpdateData)
  onUpdateRef.current = onUpdateData

  const commitData = useCallback<CommitKanbanData>(
    (nextOrUpdater) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(dataRef.current) : nextOrUpdater
      dispatch({ type: 'commit', next })
      onUpdateRef.current(next)
    },
    [],
  )

  const undo = useCallback(() => {
    if (state.past.length === 0) return
    const prev = state.past[state.past.length - 1]
    dispatch({ type: 'undo' })
    onUpdateRef.current(prev)
  }, [state.past])

  const redo = useCallback(() => {
    if (state.future.length === 0) return
    const next = state.future[0]
    dispatch({ type: 'redo' })
    onUpdateRef.current(next)
  }, [state.future])

  useHistoryKeyboardShortcuts(undo, redo, containerRef)

  return {
    data: state.data,
    commitData,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
