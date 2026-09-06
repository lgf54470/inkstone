// Stream cancellation is a best-effort resource release: the read side is
// already done or errored, so a failed cancel has nothing left to retry and
// no user-visible state to update. The single wrapper replaces the repeated
// inline `.catch(() => {})` at every upload/download/rollback site.
export async function cancelStreamBestEffort(
  stream: { cancel: () => Promise<void> } | null | undefined,
): Promise<void> {
  if (!stream) return
  try {
    await stream.cancel()
  } catch {
    // Best-effort release; a failed cancel leaks only until the runtime
    // reclaims the stream, with no correctness impact on the operation.
  }
}