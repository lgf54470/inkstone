/**
 * Warms the lazily imported settings sections in the background: one chunk per
 * idle slice, so opening the panel never pays for a section the visitor has not
 * asked for yet, and the one they ask for is already in memory.
 *
 * The scheduled work is cancelled when the panel closes, and a loader that
 * rejects is left to the section's own error boundary rather than retried here
 * — a failed chunk import is reported to the person who tried to open it.
 */
export function warmSections(
  loaders: ReadonlyArray<() => Promise<unknown>>,
  schedule: (task: () => void) => void,
): () => void {
  let cancelled = false
  let index = 0
  const step = (): void => {
    if (cancelled || index >= loaders.length) return
    const load = loaders[index]!
    index++
    void load()
    schedule(step)
  }
  schedule(step)
  return () => {
    cancelled = true
  }
}

export function scheduleWhenIdle(task: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task())
  else window.setTimeout(task, 200)
}
