import { useCallback, useEffect, useReducer } from 'react'
import type { BentoDoc } from './types'

const MAX_HISTORY_STEPS = 30

export interface HistoryState {
  data: BentoDoc
  past: BentoDoc[]
  future: BentoDoc[]
}

export type HistoryAction =
  | { type: 'commit'; next: BentoDoc }
  | { type: 'undo' }
  | { type: 'redo' }

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
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

export function useSlidesHistory(
  initialData: BentoDoc,
  onUpdateData: (next: BentoDoc) => void,
) {
  const [state, dispatch] = useReducer(historyReducer, {
    data: initialData,
    past: [],
    future: [],
  })

  const commitData = useCallback(
    (nextOrUpdater: BentoDoc | ((prev: BentoDoc) => BentoDoc)) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(state.data) : nextOrUpdater
      dispatch({ type: 'commit', next })
      onUpdateData(next)
    },
    [state.data, onUpdateData],
  )

  const undo = useCallback(() => {
    if (state.past.length === 0) return
    const prev = state.past[state.past.length - 1]
    dispatch({ type: 'undo' })
    onUpdateData(prev)
  }, [state.past, onUpdateData])

  const redo = useCallback(() => {
    if (state.future.length === 0) return
    const next = state.future[0]
    dispatch({ type: 'redo' })
    onUpdateData(next)
  }, [state.future, onUpdateData])

  useEffect(() => {
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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return {
    data: state.data,
    commitData,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
