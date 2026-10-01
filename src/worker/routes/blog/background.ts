/**
 * Best-effort work a route starts but must not wait for. The runtime's `waitUntil` keeps the isolate
 * alive until the task lands; in Hono's test transport there is no execution context, and the task
 * still starts, nothing waits for it.
 */
export function waitUntilOf(c: { executionCtx: { waitUntil(task: Promise<unknown>): void } }): ((task: Promise<void>) => void) | undefined {
  try {
    return (task) => c.executionCtx.waitUntil(task)
  } catch {
    // No execution context (the test transport): the work still starts, nothing keeps the isolate.
    return undefined
  }
}
