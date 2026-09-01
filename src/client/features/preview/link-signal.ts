type LinkHoverTargetListener = (noteId: string | null) => void

const stack: string[] = []
const listeners = new Set<LinkHoverTargetListener>()
let current: string | null = null

function emit(): void {
  current = stack.length ? stack[stack.length - 1] ?? null : null
  for (const listener of listeners)
    listener(current)
}

export function pushLinkHoverTarget(noteId: string): () => void {
  stack.push(noteId)
  emit()
  return () => {
    const index = stack.lastIndexOf(noteId)
    if (index >= 0)
      stack.splice(index, 1)
    emit()
  }
}

export function subscribeLinkHoverTarget(listener: LinkHoverTargetListener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}

export function getLinkHoverTarget(): string | null {
  return current
}