// 并发任务队列：按提交顺序执行，同时在途不超过 maxConcurrent 个。
// 图表渲染较重，快速滚动会让大量块同时进入视口，若全部立即并发渲染会
// 瞬间占满主线程；排队 + 限量让队列有序排空，滚动越界后任务自然完成。
export function createConcurrencyQueue(maxConcurrent: number) {
  const queue: Array<() => Promise<void>> = []
  let inFlight = 0

  const pump = () => {
    while (inFlight < maxConcurrent) {
      const task = queue.shift()
      if (!task) return
      inFlight++
      void task().finally(() => {
        inFlight--
        pump()
      })
    }
  }

  return {
    push(task: () => Promise<void>): void {
      queue.push(task)
      pump()
    },
    get size(): number {
      return queue.length
    },
    get inFlightCount(): number {
      return inFlight
    },
  }
}