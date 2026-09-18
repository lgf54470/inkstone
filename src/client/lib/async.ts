/**
 * Resolves when the work does or when it has had long enough, so a slow artifact delays what
 * comes next instead of hanging it. The timeout is the contract: the caller cannot wait
 * forever, and it must not learn about a failure it can do nothing about.
 */
export function settleWithin(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs)
    const done = (): void => {
      window.clearTimeout(timer)
      resolve()
    }
    void work.then(done, done)
  })
}

/**
 * Runs `fn` over the items with at most `limit` in flight at once. Results stay in input
 * order no matter which work finishes first. The first rejected item fails the whole call;
 * callers that must survive individual failures catch inside `fn`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

const PROGRESS_THROTTLE_MS = 200

/**
 * Progress callbacks land far faster than anyone reads a bar, and each store write copies
 * the whole task list. The terminal update must be written outside this wrapper.
 */
export function throttledProgress(
  report: (percent: number) => void,
  intervalMs: number = PROGRESS_THROTTLE_MS,
): (percent: number) => void {
  let lastAt = 0
  return (percent) => {
    const now = Date.now()
    if (now - lastAt < intervalMs) return
    lastAt = now
    report(percent)
  }
}
