import { describe, expect, it } from 'vitest'
import { warmSections } from './section-warmup'

function loader(log: number[], id: number): () => Promise<unknown> {
  return () => {
    log.push(id)
    return Promise.resolve(id)
  }
}

describe('warmSections', () => {
  it('loads every section once, in order', () => {
    const log: number[] = []
    warmSections([loader(log, 0), loader(log, 1), loader(log, 2)], (task) => task())
    expect(log).toEqual([0, 1, 2])
  })

  it('loads one section per scheduled slice', () => {
    const log: number[] = []
    const tasks: Array<() => void> = []
    warmSections([loader(log, 0), loader(log, 1)], (task) => tasks.push(task))
    expect(log).toEqual([])
    tasks.shift()!()
    expect(log).toEqual([0])
    tasks.shift()!()
    expect(log).toEqual([0, 1])
  })

  it('stops warming after cancel', () => {
    const log: number[] = []
    const tasks: Array<() => void> = []
    const stop = warmSections([loader(log, 0), loader(log, 1)], (task) => tasks.push(task))
    tasks.shift()!()
    stop()
    tasks.shift()!()
    expect(log).toEqual([0])
  })

  it('does nothing without loaders', () => {
    const tasks: Array<() => void> = []
    warmSections([], (task) => tasks.push(task))
    tasks.shift()!()
    expect(tasks).toEqual([])
  })
})
