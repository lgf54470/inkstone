import { useRef, useState } from 'react'

export interface SaveAction {
  saving: boolean
  run: (action: () => Promise<boolean>) => Promise<void>
}

// Both edit dialogs save the same way: run the write, keep the dialog (and the
// draft the user typed) on screen when it is rejected, and close only once it
// has landed. The in-flight guard lives in a ref so a second click cannot start
// a duplicate write before React has re-rendered the disabled button.
export function useSaveAction(onClose: () => void): SaveAction {
  const [saving, setSaving] = useState(false)
  const running = useRef(false)

  const run = async (action: () => Promise<boolean>): Promise<void> => {
    if (running.current) return
    running.current = true
    setSaving(true)
    try {
      if (await action()) onClose()
    } finally {
      running.current = false
      setSaving(false)
    }
  }

  return { saving, run }
}
