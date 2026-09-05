import type { CachedNoteContent, OutboxItem } from './db'

export interface NotePersistTarget {
  enqueueOutbox(item: OutboxItem): Promise<void>
  setContent(id: string, value: CachedNoteContent): Promise<void>
}

interface PendingNotePersist {
  outbox: OutboxItem
  content: CachedNoteContent
  waiters: Array<(isOk: boolean) => void>
}

/**
 * Coalesces per-keystroke IndexedDB writes (outbox + cached content) behind
 * one short timer: only the latest payload per note is ever persisted, so a
 * burst of typing collapses into a single outbox rewrite per note instead of
 * serializing every pending note body on every keystroke.
 */
export class NotePersistCoalescer {
  private readonly pending = new Map<string, PendingNotePersist>()
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly target: NotePersistTarget,
    private readonly delayMs = 200,
  ) {}

  schedule(id: string, outbox: OutboxItem, content: CachedNoteContent): Promise<boolean> {
    const existing = this.pending.get(id)
    const entry: PendingNotePersist = existing ?? { outbox, content, waiters: [] }
    entry.outbox = outbox
    entry.content = content
    if (!existing) this.pending.set(id, entry)
    const result = new Promise<boolean>((resolve) => entry.waiters.push(resolve))
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.delayMs)
    }
    return result
  }

  async flush(): Promise<void> {
    this.timer = undefined
    if (!this.pending.size) return
    const batch = [...this.pending]
    this.pending.clear()
    for (const [id, entry] of batch) {
      let isOk = true
      try {
        await this.target.enqueueOutbox(entry.outbox)
        await this.target.setContent(id, entry.content)
      } catch {
        isOk = false
      }
      for (const waiter of entry.waiters) waiter(isOk)
    }
  }
}