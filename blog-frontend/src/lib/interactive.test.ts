// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initInteractiveContent, selectMarkdownTab } from './interactive'
import { initDiagramLazyRender, showChartError, showMermaidError } from './diagram-reveal'
import { createConcurrencyQueue } from './concurrency-queue'
import { FakeWorker } from '../../tests/helpers/fake-worker'
import { COPY_FEEDBACK_MS, JS_RUN_TIMEOUT_MS } from './constants'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg class="mocked-mermaid"></svg>' })),
  },
}))

// mock 前缀：vi.mock 工厂被提升后仍能引用该变量（首次动态 import 时才求值）
const mockChartState = { constructed: 0 }

vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    destroy() {}
    constructor() {
      mockChartState.constructed++
    }
  },
}))

const INJECTED = '</div><img src=x onerror=alert(1)>'

beforeAll(() => {
  initInteractiveContent()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('showMermaidError', () => {
  it('renders error message and raw source as text without executing markup', () => {
    const block = document.createElement('div')
    showMermaidError(block, new Error(INJECTED), INJECTED)

    expect(block.querySelector('img')).toBeNull()
    expect(block.querySelector('.mermaid-error-message')?.textContent).toBe(INJECTED)
    expect(block.querySelector('code')?.textContent).toBe(INJECTED)
  })

  it('marks the block as has-error and removes loading', () => {
    const block = document.createElement('div')
    block.classList.add('loading')
    showMermaidError(block, new Error('boom'), 'graph TD')

    expect(block.classList.contains('has-error')).toBe(true)
    expect(block.classList.contains('loading')).toBe(false)
    expect(block.querySelector('.mermaid-error')).not.toBeNull()
  })
})

describe('showChartError', () => {
  it('renders error message and raw source as text without executing markup', () => {
    const block = document.createElement('div')
    showChartError(block, new Error(INJECTED), INJECTED)

    expect(block.querySelector('img')).toBeNull()
    expect(block.querySelector('.chart-error-text')?.textContent).toContain(INJECTED)
    expect(block.querySelector('code')?.textContent).toBe(INJECTED)
  })

  it('marks the block as has-error and removes loading', () => {
    const block = document.createElement('div')
    block.classList.add('loading')
    showChartError(block, new Error('boom'), '{"type":"line"}')

    expect(block.classList.contains('has-error')).toBe(true)
    expect(block.classList.contains('loading')).toBe(false)
    expect(block.querySelector('.chart-error-banner')).not.toBeNull()
    expect(block.querySelector('pre')).not.toBeNull()
  })
})

const blockMarkup = `
  <div class="js-example-block">
    <button type="button" class="js-example-run-btn" data-js-run>运行</button>
    <div class="code-block"><pre><code>console.log("hi"); return 7</code></pre></div>
    <div class="js-example-output-body"><div class="js-example-placeholder">点击运行</div></div>
    <div class="js-example-output-status"></div>
  </div>`

describe('js example run button success', () => {
  it('runs code via the worker and renders direct DOM log rows', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    document.body.innerHTML = blockMarkup
    document.querySelector<HTMLButtonElement>('[data-js-run]')!.click()

    await vi.waitFor(() => {
      const rows = document.querySelectorAll('.js-example-log-row')
      expect(rows.length).toBe(2)
    })
    const logRow = document.querySelector('.js-example-log-row.is-log')
    expect(logRow?.querySelector('.js-example-log-prefix')?.textContent).toBe('›')
    expect(logRow?.querySelector('.js-example-log-text')?.textContent).toBe('hi')

    const returnRow = document.querySelector('.js-example-log-row.is-return')
    expect(returnRow?.querySelector('.js-example-log-prefix')?.textContent).toBe('←')
    expect(returnRow?.querySelector('.js-example-log-text')?.textContent).toBe('7')

    const statusEl = document.querySelector<HTMLElement>('.js-example-output-status')!
    expect(statusEl.classList.contains('is-success')).toBe(true)
    expect(statusEl.textContent).toMatch(/^✓/)
    expect(document.querySelector('.js-example-placeholder')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('js example run button timeout', () => {
  it('marks the run as timed out when the worker hangs and shows error banner', async () => {
    vi.useFakeTimers()
    class HangingWorker extends FakeWorker {
      constructor() {
        super('hang')
      }
    }
    vi.stubGlobal('Worker', HangingWorker)
    document.body.innerHTML = blockMarkup
    document.querySelector<HTMLButtonElement>('[data-js-run]')!.click()

    await vi.advanceTimersByTimeAsync(JS_RUN_TIMEOUT_MS)
    const statusEl = document.querySelector<HTMLElement>('.js-example-output-status')!
    expect(statusEl.classList.contains('is-error')).toBe(true)
    expect(statusEl.textContent).toMatch(/^✕/)

    const errorRow = document.querySelector('.js-example-log-row.is-error-banner')
    expect(errorRow).not.toBeNull()
    expect(errorRow?.querySelector('.js-example-log-prefix')?.textContent).toBe('✖')
    expect(errorRow?.querySelector('.js-example-log-text')?.textContent).toContain('TimeoutError')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})

describe('task checkbox toggles', () => {
  it('updates li classes and data status on change', () => {
    document.body.innerHTML = `<ul><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox"></li></ul>`
    const input = document.querySelector<HTMLInputElement>('.task-list-item-checkbox')!
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))

    const li = document.querySelector('li')!
    expect(li.classList.contains('done')).toBe(true)
    expect(li.classList.contains('task-status-done')).toBe(true)
    expect(li.classList.contains('task-status-todo')).toBe(false)
    expect(li.dataset.taskStatus).toBe('done')
  })

  it('reverts to todo when unchecked', () => {
    document.body.innerHTML = `<ul><li class="task-list-item task-status-done"><input type="checkbox" class="task-list-item-checkbox" checked></li></ul>`
    const input = document.querySelector<HTMLInputElement>('.task-list-item-checkbox')!
    input.checked = false
    input.dispatchEvent(new Event('change', { bubbles: true }))

    const li = document.querySelector('li')!
    expect(li.classList.contains('done')).toBe(false)
    expect(li.dataset.taskStatus).toBe('todo')
  })
})

// 懒渲染用：jsdom 无原生 IntersectionObserver，用可手动触发回调的替身验证
// “进入视口才渲染”与“标签页激活才渲染”两条路径。
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly targets = new Set<Element>()
  private readonly callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void

  constructor(callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.add(target)
  }

  unobserve(target: Element): void {
    this.targets.delete(target)
  }

  disconnect(): void {
    this.targets.clear()
  }

  fire(entries: Array<{ target: Element; isIntersecting: boolean }>): void {
    this.callback(entries)
  }
}

const mermaidBlock = (raw: string): string =>
  `<div class="mermaid-block loading" data-mermaid="${encodeURIComponent(raw)}" aria-busy="true">加载中</div>`

describe('diagram lazy rendering', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances.length = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  it('keeps the mermaid block unrendered until it intersects the viewport', async () => {
    document.body.innerHTML = mermaidBlock('graph TD\nA-->B')
    initDiagramLazyRender()

    const io = FakeIntersectionObserver.instances.at(-1)!
    expect(io.targets.size).toBe(1)
    expect(document.querySelector('.mermaid-block svg')).toBeNull()

    io.fire([{ target: document.querySelector('.mermaid-block')!, isIntersecting: true }])
    await vi.waitFor(() => {
      expect(document.querySelector('.mermaid-block svg')).not.toBeNull()
    })
    expect(document.querySelector('.mermaid-block')!.classList.contains('loading')).toBe(false)
    expect(io.targets.size).toBe(0)
  })

  it('renders a hidden tab panel mermaid block on first tab activation', async () => {
    document.body.innerHTML = `
      <div class="markdown-tabs" data-tabs>
        <div class="tab-list" role="tablist">
          <button type="button" data-tab-button="0" aria-selected="true">一</button>
          <button type="button" data-tab-button="1" aria-selected="false">二</button>
        </div>
        <div data-tab-panel="0"></div>
        <div data-tab-panel="1" hidden>
          ${mermaidBlock('graph TD\nA-->B')}
        </div>
      </div>`
    initDiagramLazyRender()

    // 隐藏面板中的块不被提前渲染
    expect(document.querySelector('[data-tab-panel="1"] .mermaid-block svg')).toBeNull()

    selectMarkdownTab(document.querySelector('[data-tab-button="1"]') as HTMLButtonElement)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-tab-panel="1"] .mermaid-block svg')).not.toBeNull()
    })
  })

})

const chartBlock = (label: string): string =>
  `<div class="chartjs-block loading" data-chart="${encodeURIComponent('{"type":"line"}')}" aria-busy="true">${label}</div>`

// chartRevealObserver 是模块级单例，后续测试复用首个创建的实例（不再新建），
// 因此不能依赖 instances.at(-1)，而是按 observe 的 target 反查观察者。
function chartObserverFor(block: HTMLElement): FakeIntersectionObserver {
  const io = FakeIntersectionObserver.instances.find((observer) => observer.targets.has(block))
  if (!io) throw new Error('no IntersectionObserver instance observing the chart block')
  return io
}

describe('chart lazy rendering', () => {
  beforeEach(() => {
    mockChartState.constructed = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  it('renders a chart block only after it intersects', async () => {
    document.body.innerHTML = chartBlock('图A')
    initDiagramLazyRender()
    const block = document.querySelector<HTMLElement>('.chartjs-block')!

    const io = chartObserverFor(block)
    expect(document.querySelector('.chartjs-block canvas')).toBeNull()

    io.fire([{ target: block, isIntersecting: true }])
    await vi.waitFor(() => {
      expect(document.querySelector('.chartjs-block canvas')).not.toBeNull()
    })
    expect(document.querySelector('.chartjs-block')!.classList.contains('loading')).toBe(false)
  })

  it('renders each block exactly once when the observer fires repeatedly', async () => {
    document.body.innerHTML = chartBlock('图B')
    initDiagramLazyRender()
    const block = document.querySelector<HTMLElement>('.chartjs-block')!

    chartObserverFor(block).fire([{ target: block, isIntersecting: true }])
    chartObserverFor(block).fire([{ target: block, isIntersecting: true }])
    await vi.waitFor(() => {
      expect(block.querySelector('canvas')).not.toBeNull()
    })

    expect(mockChartState.constructed).toBe(1)
  })
})

describe('chart render queue drain', () => {
  beforeEach(() => {
    mockChartState.constructed = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  it('drains charts queued by a fast scroll until all are rendered', async () => {
    document.body.innerHTML = ['图1', '图2', '图3', '图4'].map(chartBlock).join('')
    initDiagramLazyRender()

    const blocks = [...document.querySelectorAll<HTMLElement>('.chartjs-block')]
    chartObserverFor(blocks[0]!).fire(blocks.map((block) => ({ target: block, isIntersecting: true })))

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.chartjs-block canvas').length).toBe(4)
    })
    expect(mockChartState.constructed).toBe(4)
  })
})

describe('chart scroll settle fallback', () => {
  beforeEach(() => {
    mockChartState.constructed = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  it('renders viewport-visible loading blocks after scrolling settles', async () => {
    document.body.innerHTML = chartBlock('图C')
    initDiagramLazyRender()
    const block = document.querySelector<HTMLElement>('.chartjs-block')!
    // jsdom 的 getBoundingClientRect 恒为全零，模拟块处于视口内
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 0, right: 100, width: 100, height: 200, x: 0, y: 100, toJSON: () => ({}) })

    // 观察者从未投递相交（快速滚动漏检），滚动停止后由兜底补渲染
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(
      () => {
        expect(block.querySelector('canvas')).not.toBeNull()
      },
      { timeout: 2000 },
    )
    expect(mockChartState.constructed).toBe(1)
  })
})

describe('createConcurrencyQueue concurrency bound', () => {
  it('starts at most maxConcurrent tasks and queues the rest', async () => {
    const queue = createConcurrencyQueue(2)
    const started: number[] = []
    const active = new Set<number>()
    const gates: Array<() => void> = []
    let maxActive = 0
    for (let i = 0; i < 4; i++) {
      queue.push(() => new Promise<void>((resolve) => {
        started.push(i)
        active.add(i)
        maxActive = Math.max(maxActive, active.size)
        gates.push(() => {
          active.delete(i)
          resolve()
        })
      }))
    }

    // 入队即泵起：前两个任务立即开始，其余排队等待空位
    expect(started).toEqual([0, 1])
    expect(active.size).toBe(2)
    expect(queue.size).toBe(2)

    // 逐批放行：放行会泵起新任务并注册新闸门，等闸门齐了再继续
    for (let released = 0; released < 4; released++) {
      await vi.waitFor(() => {
        const gate = gates.shift()
        if (!gate) throw new Error('task not started yet')
        gate()
      })
    }
    await vi.waitFor(() => {
      expect(queue.size).toBe(0)
      expect(active.size).toBe(0)
    })
    expect(maxActive).toBe(2)
  })
})

describe('createConcurrencyQueue FIFO drain', () => {
  it('starts queued tasks in FIFO order as in-flight ones finish', async () => {
    const queue = createConcurrencyQueue(2)
    const started: number[] = []
    const gates: Array<() => void> = []
    for (let i = 0; i < 4; i++) {
      queue.push(() => new Promise<void>((resolve) => {
        started.push(i)
        gates.push(resolve)
      }))
    }

    gates[0]!()
    await vi.waitFor(() => {
      expect(started).toEqual([0, 1, 2])
    })
    gates[1]!()
    gates[2]!()
    await vi.waitFor(() => {
      expect(started).toEqual([0, 1, 2, 3])
    })
    gates[3]!()
    await vi.waitFor(() => {
      expect(queue.size).toBe(0)
    })
  })
})

describe('tabs interaction', () => {
  const tabsMarkup = `
    <div class="markdown-tabs" data-tabs>
      <div class="tab-list" role="tablist">
        <button data-tab-button="0" aria-selected="true" tabindex="0">甲</button>
        <button data-tab-button="1" aria-selected="false" tabindex="-1">乙</button>
        <button data-tab-button="2" aria-selected="false" tabindex="-1">丙</button>
      </div>
      <section data-tab-panel="0">内容A</section>
      <section data-tab-panel="1" hidden>内容B</section>
      <section data-tab-panel="2" hidden>内容C</section>
    </div>`

  it('switches aria-selected, tabindex, and panel visibility on tab click', () => {
    document.body.innerHTML = tabsMarkup
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tab-button]')
    buttons[1]!.click()

    expect(buttons[0]!.getAttribute('aria-selected')).toBe('false')
    expect(buttons[0]!.tabIndex).toBe(-1)
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true')
    expect(buttons[1]!.tabIndex).toBe(0)
    expect(document.querySelector('[data-tab-panel="0"]')?.hasAttribute('hidden')).toBe(true)
    expect(document.querySelector('[data-tab-panel="1"]')?.hasAttribute('hidden')).toBe(false)
  })

  it('navigates tabs using ArrowRight, ArrowLeft, Home and End keys', () => {
    document.body.innerHTML = tabsMarkup
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tab-button]')
    buttons[0]!.focus()

    // ArrowRight: 0 -> 1
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true')
    expect(buttons[1]!.tabIndex).toBe(0)
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('false')

    // ArrowRight: 1 -> 2
    buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(buttons[2]!.getAttribute('aria-selected')).toBe('true')

    // End: 2 -> 2
    buttons[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('true')

    // ArrowLeft wraps: 0 -> 2
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(buttons[2]!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('js example line-number switch', () => {
  it('toggles the is-checked state and code-block line numbers', () => {
    document.body.innerHTML = `
      <div class="js-example-block">
        <button type="button" class="js-example-switch is-checked" data-js-switch="line-numbers" aria-checked="true">行号</button>
        <div class="code-block has-line-numbers"></div>
      </div>`
    const switchBtn = document.querySelector<HTMLButtonElement>('[data-js-switch]')!
    switchBtn.click()

    expect(switchBtn.classList.contains('is-checked')).toBe(false)
    expect(switchBtn.getAttribute('aria-checked')).toBe('false')
    expect(document.querySelector('.code-block')?.classList.contains('has-line-numbers')).toBe(false)
  })
})

describe('code copy button', () => {
  it('copies code text and shows temporary feedback', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    document.body.innerHTML = `
      <div class="code-block">
        <button type="button" class="code-copy" data-copy>复制</button>
        <pre><code>const a = 1;</code></pre>
      </div>`

    document.querySelector<HTMLButtonElement>('.code-copy')!.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenCalledWith('const a = 1;')
    expect(document.querySelector('.code-copy')?.textContent).toBe('已复制')

    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS)
    expect(document.querySelector('.code-copy')?.textContent).toBe('复制')
  })
})