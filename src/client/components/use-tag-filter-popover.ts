import { useEffect } from 'react'

export function usePopoverFocus(open: boolean, inputRef: React.RefObject<HTMLInputElement | null>, setQuery: React.Dispatch<React.SetStateAction<string>>): void {
  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, inputRef, setQuery])
}

export function useHighlightScroll(query: string, highlightedRef: React.RefObject<HTMLButtonElement | null>): void {
  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [query, highlightedRef])
}