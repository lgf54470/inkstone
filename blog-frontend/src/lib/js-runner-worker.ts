/**
 * javascript-example 执行 Worker 入口：由页面 glue（js-runner-runner.ts）按
 * `new Worker(new URL(this, import.meta.url))` 从同源打包产物加载，
 * 符合现有 CSP（script-src 'self'），无需放宽任何策略。
 */
import { executeUserCode } from './js-runner-core'

interface WorkerScope {
  onmessage: ((event: MessageEvent<string>) => void) | null
  postMessage: (data: unknown) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<string>) => {
  scope.postMessage(executeUserCode(event.data))
}