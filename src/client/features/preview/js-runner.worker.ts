import { executeUserCode, type JsRunOutcome } from './js-runner-core'

interface WorkerScope {
  onmessage: ((event: MessageEvent<string>) => void) | null
  postMessage: (data: JsRunOutcome) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  scope.postMessage(executeUserCode(event.data))
}
