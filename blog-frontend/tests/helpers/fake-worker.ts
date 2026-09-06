import { executeUserCode } from '../../src/lib/js-runner-core'
import type { JsRunOutcome } from '../../src/lib/js-runner-core'

export type FakeWorkerBehavior = 'respond' | 'hang' | 'fail'

/** 测试替身：在进程内同步执行 js-runner-core，模拟 Worker 的三种结局 */
export class FakeWorker {
  onmessage: ((event: MessageEvent<JsRunOutcome>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false

  constructor(private behavior: FakeWorkerBehavior = 'respond') {}

  postMessage(code: string): void {
    if (this.behavior === 'hang') return
    if (this.behavior === 'fail') {
      queueMicrotask(() => this.onerror?.({} as ErrorEvent))
      return
    }
    queueMicrotask(() => {
      if (this.terminated) return
      this.onmessage?.({ data: executeUserCode(code) } as MessageEvent<JsRunOutcome>)
    })
  }

  terminate(): void {
    this.terminated = true
  }
}