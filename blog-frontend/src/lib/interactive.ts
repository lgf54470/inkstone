// Client-side interactivity for Mermaid, Chart.js, code copy, tabs, and JS runner

export function initInteractiveContent() {
  if (typeof window === 'undefined') return
  initTabs()
  initCodeCopy()
  initJsRunners()
  initTaskCheckboxes()
  renderMermaid()
  renderCharts()
  initThemeObserver()
}

function initTaskCheckboxes() {
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    if (target instanceof HTMLInputElement && target.classList.contains('task-list-item-checkbox')) {
      const li = target.closest<HTMLLIElement>('li.task-list-item')
      if (li) {
        const isDone = target.checked
        li.classList.toggle('done', isDone)
        li.classList.toggle('task-status-done', isDone)
        li.classList.toggle('task-status-todo', !isDone)
        li.dataset.taskStatus = isDone ? 'done' : 'todo'
        target.dataset.taskStatus = isDone ? 'done' : 'todo'
      }
    }
  })
}

function initTabs() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLButtonElement>('.markdown-tabs [data-tab-button]')
    if (!btn) return
    const tabsContainer = btn.closest<HTMLElement>('.markdown-tabs')
    if (!tabsContainer) return
    const tabIndex = btn.dataset.tabButton
    tabsContainer.querySelectorAll<HTMLButtonElement>('[data-tab-button]').forEach((b) => {
      const isSelected = b.dataset.tabButton === tabIndex
      b.setAttribute('aria-selected', String(isSelected))
    })
    tabsContainer.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((p) => {
      const isSelected = p.dataset.tabPanel === tabIndex
      if (isSelected) p.removeAttribute('hidden')
      else p.setAttribute('hidden', '')
    })
  })
}

function initCodeCopy() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const copyBtn = target.closest<HTMLButtonElement>('.code-copy, [data-copy]')
    if (!copyBtn) return
    const codeBlock = copyBtn.closest<HTMLElement>('.code-block')
    if (!codeBlock) return
    const codeEl = codeBlock.querySelector('pre code')
    if (!codeEl) return
    const codeText = codeEl.textContent ?? ''
    navigator.clipboard.writeText(codeText).then(() => {
      const originalText = copyBtn.textContent || '复制'
      copyBtn.textContent = '已复制'
      setTimeout(() => {
        copyBtn.textContent = originalText
      }, 2000)
    }).catch((err) => console.warn('Clipboard write failed:', err))
  })
}

function initJsRunners() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const switchBtn = target.closest<HTMLButtonElement>('[data-js-switch="line-numbers"]')
    if (switchBtn) {
      const isChecked = switchBtn.classList.contains('is-checked')
      const nextChecked = !isChecked
      switchBtn.classList.toggle('is-checked', nextChecked)
      switchBtn.setAttribute('aria-checked', String(nextChecked))
      const block = switchBtn.closest<HTMLElement>('.js-example-block')
      const codeBlock = block?.querySelector<HTMLElement>('.code-block')
      if (codeBlock) {
        codeBlock.classList.toggle('has-line-numbers', nextChecked)
      }
      return
    }

    const runBtn = target.closest<HTMLButtonElement>('[data-js-run]')
    if (runBtn) {
      const block = runBtn.closest<HTMLElement>('.js-example-block')
      if (!block) return
      const codeEl = block.querySelector<HTMLElement>('.code-block pre code')
      const outputBody = block.querySelector<HTMLElement>('.js-example-output-body')
      const statusEl = block.querySelector<HTMLElement>('.js-example-output-status')
      if (!codeEl || !outputBody) return

      const code = codeEl.textContent ?? ''
      const logs: Array<{ type: string; text: string }> = []
      const fakeConsole = {
        log: (...args: any[]) => logs.push({ type: 'log', text: args.map(formatJsValue).join(' ') }),
        info: (...args: any[]) => logs.push({ type: 'info', text: args.map(formatJsValue).join(' ') }),
        warn: (...args: any[]) => logs.push({ type: 'warn', text: args.map(formatJsValue).join(' ') }),
        error: (...args: any[]) => logs.push({ type: 'error', text: args.map(formatJsValue).join(' ') }),
      }

      const start = performance.now()
      let result: any = undefined
      let err: any = undefined
      try {
        const fn = new Function('console', `"use strict";\n${code}`)
        result = fn(fakeConsole)
      } catch (e) {
        err = e
      }
      const durationMs = Math.round(performance.now() - start)

      if (statusEl) {
        if (err) {
          statusEl.className = 'js-example-output-status is-error'
          statusEl.textContent = `✕ ${durationMs}ms`
        } else {
          statusEl.className = 'js-example-output-status is-success'
          statusEl.textContent = `✓ ${durationMs}ms`
        }
      }

      outputBody.innerHTML = ''
      if (logs.length === 0 && result === undefined && !err) {
        const hint = document.createElement('div')
        hint.className = 'js-example-empty-hint'
        hint.textContent = '代码已执行，无输出内容'
        outputBody.appendChild(hint)
        return
      }

      logs.forEach((log) => {
        const row = document.createElement('div')
        row.className = `js-example-log-row is-${log.type}`
        const prefix = document.createElement('span')
        prefix.className = 'js-example-log-prefix'
        prefix.textContent = `[${log.type.toUpperCase()}]`
        const text = document.createElement('span')
        text.className = 'js-example-log-text'
        text.textContent = log.text
        row.appendChild(prefix)
        row.appendChild(text)
        outputBody.appendChild(row)
      })

      if (result !== undefined) {
        const row = document.createElement('div')
        row.className = 'js-example-log-row is-return'
        const prefix = document.createElement('span')
        prefix.className = 'js-example-log-prefix'
        prefix.textContent = '[RETURN]'
        const text = document.createElement('span')
        text.className = 'js-example-log-text'
        text.textContent = formatJsValue(result)
        row.appendChild(prefix)
        row.appendChild(text)
        outputBody.appendChild(row)
      }

      if (err) {
        const row = document.createElement('div')
        row.className = 'js-example-log-row is-error'
        const prefix = document.createElement('span')
        prefix.className = 'js-example-log-prefix'
        prefix.textContent = '[ERROR]'
        const text = document.createElement('span')
        text.className = 'js-example-log-text'
        text.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        row.appendChild(prefix)
        row.appendChild(text)
        outputBody.appendChild(row)
      }
    }
  })
}

function formatJsValue(val: any): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') return String(val)
  if (typeof val === 'function') return val.toString()
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

async function renderMermaid() {
  const blocks = document.querySelectorAll<HTMLElement>('.mermaid-block')
  if (!blocks.length) return
  const isDark = isDarkMode()
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    themeVariables: {
      fontSize: '13px',
      background: 'transparent',
    },
  })

  let idx = 0
  for (const block of blocks) {
    const raw = decodeURIComponent(block.dataset.mermaid || '')
    if (!raw) continue
    try {
      const id = `blog-mermaid-${Date.now()}-${++idx}`
      const { svg } = await mermaid.render(id, raw)
      block.innerHTML = svg
      block.classList.remove('loading')
      block.removeAttribute('aria-busy')
    } catch (err: any) {
      console.warn('Mermaid diagram render error:', err)
      block.classList.remove('loading')
      block.classList.add('has-error')
      block.innerHTML = `<div class="mermaid-error"><span class="mermaid-error-message">${err?.message || err}</span><code>${raw}</code></div>`
    }
  }
}

const chartInstances = new Map<HTMLElement, any>()

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'dark') return true
  if (theme === 'light') return false
  if (document.documentElement.classList.contains('dark')) return true
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

async function renderCharts() {
  const blocks = document.querySelectorAll<HTMLElement>('.chartjs-block')
  if (!blocks.length) return
  const isDark = isDarkMode()
  const textColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'

  const { default: Chart } = await import('chart.js/auto')

  blocks.forEach((block) => {
    const existing = chartInstances.get(block)
    if (existing) {
      existing.destroy()
      chartInstances.delete(block)
    }

    const raw = decodeURIComponent(block.dataset.chart || '')
    if (!raw) return
    try {
      const config = JSON.parse(raw)
      block.innerHTML = ''
      block.classList.remove('loading', 'has-error')
      block.removeAttribute('aria-busy')

      const container = document.createElement('div')
      container.className = 'chartjs-container'
      const canvas = document.createElement('canvas')
      canvas.className = 'chartjs-canvas'
      container.appendChild(canvas)
      block.appendChild(container)

      const userOptions = config.options || {}
      const userScales = userOptions.scales || {}
      const scales: Record<string, any> = {}
      for (const [key, val] of Object.entries(userScales)) {
        if (val && typeof val === 'object') {
          scales[key] = {
            ...(val as object),
            ticks: { color: textColor, ...((val as any).ticks || {}) },
            grid: { color: gridColor, ...((val as any).grid || {}) },
          }
        }
      }

      const chartConfig = {
        ...config,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          color: textColor,
          ...userOptions,
          scales: Object.keys(scales).length > 0 ? scales : undefined,
          plugins: {
            legend: {
              labels: { color: textColor },
            },
            ...(userOptions.plugins || {}),
          },
        },
      }

      const instance = new Chart(canvas, chartConfig)
      chartInstances.set(block, instance)
    } catch (err: any) {
      console.warn('Chart.js render error:', err)
      block.classList.remove('loading')
      block.classList.add('has-error')
      block.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">图表渲染失败: ${err?.message || err}</span></div><pre><code>${raw}</code></pre>`
    }
  })
}

function initThemeObserver() {
  let isDark = isDarkMode()
  const onChange = () => {
    const nextDark = isDarkMode()
    if (nextDark !== isDark) {
      isDark = nextDark
      renderMermaid()
      renderCharts()
    }
  }

  window.addEventListener('inkstone-appearance-change', onChange)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onChange)
  }
}
