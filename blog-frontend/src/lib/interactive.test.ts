// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initInteractiveContent, runUserCode, showChartError, showMermaidError } from './interactive'
import { COPY_FEEDBACK_MS } from './constants'

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

describe('runUserCode', () => {
  it('captures console output and the return value', () => {
    const { logs, result, err } = runUserCode('const n = 21; console.log("sum", n * 2); return n * 2')
    expect(logs).toEqual([{ type: 'log', text: 'sum 42' }])
    expect(result).toBe(42)
    expect(err).toBeUndefined()
  })

  it('captures thrown errors and formatting of non-serializable values', () => {
    const { err } = runUserCode('throw new Error("boom")')
    expect(err).toBeInstanceOf(Error)
    const { result } = runUserCode('(() => {})()')
    expect(result).toBeUndefined()
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

describe('tabs interaction', () => {
  it('switches aria-selected and panel visibility on tab click', () => {
    document.body.innerHTML = `
      <div class="markdown-tabs">
        <div class="tab-list">
          <button data-tab-button="0" aria-selected="true">甲</button>
          <button data-tab-button="1" aria-selected="false">乙</button>
        </div>
        <section data-tab-panel="0">内容A</section>
        <section data-tab-panel="1" hidden>内容B</section>
      </div>`
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tab-button]')
    buttons[1]!.click()

    expect(buttons[0]!.getAttribute('aria-selected')).toBe('false')
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[data-tab-panel="0"]')?.hasAttribute('hidden')).toBe(true)
    expect(document.querySelector('[data-tab-panel="1"]')?.hasAttribute('hidden')).toBe(false)
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