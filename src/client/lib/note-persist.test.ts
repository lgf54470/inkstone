import { describe, expect, it } from 'vitest'
import { NotePersistCoalescer, type NotePersistTarget } from './note-persist'
import type { CachedNoteContent, OutboxItem } from './db'

function mockTarget() {
  const calls: Array<'outbox' | 'content'> = []
  const outbox = new Map<string, OutboxItem>()
  const contents = new Map<string, CachedNoteContent>()
  const target: NotePersistTarget = {
    async enqueueOutbox(item) {
      calls.push('outbox')
      outbox.set(item.id, item)
    },
    async setContent(id, value) {
      calls.push('content')
      contents.set(id, value)
    },
  }
  return { target, calls, outbox, contents }
}

function item(id: string, content: string, writeId: string): OutboxItem {
  return {
    id,
    clientId: 'bench',
    writeId,
    noteId: id,
    payload: { content, contentDirty: true, rev: 1 },
    attempts: 0,
    createdAt: Date.now(),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('NotePersistCoalescer', () => {
  it('collapses a burst of writes for one note into a single batch', async () => {
    const { target, calls, outbox, contents } = mockTarget()
    const coalescer = new NotePersistCoalescer(target, 1)
    for (let index = 1; index <= 10; index++) {
      void coalescer.schedule('n1', item('n1', `v${index}`, `w${index}`), {
        content: `v${index}`,
        rev: 1,
        updatedAt: index,
        writeId: `w${index}`,
      })
    }
    await coalescer.flush()
    expect(calls.filter((call) => call === 'outbox')).toHaveLength(1)
    expect(calls.filter((call) => call === 'content')).toHaveLength(1)
    expect(outbox.get('n1')?.payload.content).toBe('v10')
    expect(contents.get('n1')?.content).toBe('v10')
    expect(outbox.get('n1')?.writeId).toBe('w10')
  })

  it('keeps notes isolated within one batch', async () => {
    const { target, calls } = mockTarget()
    const coalescer = new NotePersistCoalescer(target, 1)
    void coalescer.schedule('n1', item('n1', 'a', 'w1'), { content: 'a', rev: 1, updatedAt: 1, writeId: 'w1' })
    void coalescer.schedule('n2', item('n2', 'b', 'w2'), { content: 'b', rev: 1, updatedAt: 2, writeId: 'w2' })
    await coalescer.flush()
    expect(calls).toHaveLength(4)
  })

  it('resolves each scheduled promise once its data is persisted', async () => {
    const { target } = mockTarget()
    const coalescer = new NotePersistCoalescer(target, 1)
    const first = coalescer.schedule('n1', item('n1', 'v1', 'w1'), {
      content: 'v1',
      rev: 1,
      updatedAt: 1,
      writeId: 'w1',
    })
    const second = coalescer.schedule('n1', item('n1', 'v2', 'w2'), {
      content: 'v2',
      rev: 1,
      updatedAt: 2,
      writeId: 'w2',
    })
    await coalescer.flush()
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
  })

  it('flushes on its own after the delay when not called explicitly', async () => {
    const { target, calls, outbox } = mockTarget()
    const coalescer = new NotePersistCoalescer(target, 5)
    void coalescer.schedule('n1', item('n1', 'v1', 'w1'), {
      content: 'v1',
      rev: 1,
      updatedAt: 1,
      writeId: 'w1',
    })
    await sleep(30)
    expect(calls).toHaveLength(2)
    expect(outbox.get('n1')?.payload.content).toBe('v1')
  })
})

describe('typing benchmark', () => {
  it('reports outbox persistence frequency and serialized bytes for direct vs coalesced writes', async () => {
    const noteId = 'note-large'
    const keystrokes = 50
    const baseNote = '# Large note\n\n' + 'lorem ipsum dolor sit amet '.repeat(4000)

    const serialized = (value: unknown) => JSON.stringify(value).length

    const directTarget = mockTarget()
    const directOutbox = new Map<string, OutboxItem>()
    const directContent = new Map<string, CachedNoteContent>()
    const directCalls = { outbox: 0, content: 0, bytes: 0 }
    for (let index = 1; index <= keystrokes; index++) {
      const content = baseNote + '\n'.repeat(index)
      const current = item(noteId, content, `w${index}`)
      directOutbox.set(noteId, current)
      directCalls.bytes += serialized([...directOutbox.values()]) + serialized(directContent)
      directCalls.outbox++
      directCalls.content++
      directContent.set(noteId, { content, rev: 1, updatedAt: index, writeId: `w${index}` })
      void directTarget.target.enqueueOutbox(current)
      void directTarget.target.setContent(noteId, { content, rev: 1, updatedAt: index, writeId: `w${index}` })
    }

    const coalescedTarget = mockTarget()
    const coalescer = new NotePersistCoalescer(coalescedTarget.target, 1)
    for (let index = 1; index <= keystrokes; index++) {
      const content = baseNote + '\n'.repeat(index)
      void coalescer.schedule(noteId, item(noteId, content, `w${index}`), {
        content,
        rev: 1,
        updatedAt: index,
        writeId: `w${index}`,
      })
    }
    await coalescer.flush()

    const writeCount = (calls: string[]) =>
      calls.filter((call) => call === 'outbox').length +
      calls.filter((call) => call === 'content').length

    const coalescedOutboxBytes = serialized([...coalescedTarget.outbox.values()])
    const coalescedContentBytes = serialized(coalescedTarget.contents)
    const directBytes = directCalls.bytes
    const coalescedBytes = coalescedOutboxBytes + coalescedContentBytes
    const directWrites = keystrokes * 2
    const coalescedWrites = writeCount(coalescedTarget.calls)
    const reduction = Math.max(0, Math.round((1 - coalescedBytes / directBytes) * 100))

    console.log('')
    console.log(`[typing benchmark] note base size ~${(baseNote.length / 1024).toFixed(1)} KiB, ${keystrokes} keystrokes`)
    console.log(`  direct writes:    ${directWrites} (${(directBytes / 1024 / 1024).toFixed(2)} MiB serialized)`)
    console.log(`  coalesced writes: ${coalescedWrites} (${(coalescedBytes / 1024 / 1024).toFixed(2)} MiB serialized)`)
    console.log(`  serialized-bytes reduction: ${reduction}%`)

    expect(coalescedWrites).toBeLessThan(directWrites)
    expect(coalescedBytes).toBeLessThan(directBytes)
  }, 20_000)
})