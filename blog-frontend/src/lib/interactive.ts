import type { Chart, ChartConfiguration } from 'chart.js/auto'
import { asRecord } from './normalize'
import { COPY_FEEDBACK_MS } from './constants'
import { renderJsOutcome, runUserCode } from './js-runner-runner'
import { t, DEFAULT_LOCALE, isSupportedLocale, type BlogLocale } from './i18n'

function getCurrentLocale(): BlogLocale {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.getAttribute('lang')
    if (isSupportedLocale(lang)) return lang
  }
  return DEFAULT_LOCALE
}

let interactiveInitialized = false

// document 级监听器只能注册一次：页面脚本与测试都可能重复调用本函数，
// 重复注册会让同一事件触发多次处理（切换开关/复制反馈会被连续执行两次）。
export function initInteractiveContent() {
  if (typeof window === 'undefined' || interactiveInitialized) return
  interactiveInitialized = true
  initTabs()
  initCodeCopy()
  initLinkCopy()
  initJsRunners()
  initTaskCheckboxes()
  initDiagramLazyRender()
  initThemeObserver()
}

/** 文章页分享按钮：复制成功后在按钮内显示“已复制”，代替 alert 弹窗 */
function initLinkCopy() {
  const copyBtn = document.getElementById('btn-copy-link')
  if (!copyBtn) return
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch (err) {
      console.warn('Clipboard write failed:', err)
      return
    }
    const label = copyBtn.querySelector<HTMLElement>('[data-copy-label]')
    if (!label) return
    const original = label.textContent || ''
    const copied = copyBtn.getAttribute('data-copied-text') || ''
    label.textContent = copied
    setTimeout(() => {
      if (label.textContent === copied) label.textContent = original
    }, COPY_FEEDBACK_MS)
  })
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

export function selectMarkdownTab(button: HTMLButtonElement): void {
  const tabs = button.closest<HTMLElement>('.markdown-tabs, [data-tabs]')
  if (!tabs) return
  const index = button.dataset.tabButton
  tabs.querySelectorAll<HTMLButtonElement>('[data-tab-button]').forEach((candidate) => {
    const selected = candidate === button
    candidate.setAttribute('aria-selected', String(selected))
    candidate.tabIndex = selected ? 0 : -1
  })
  tabs.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== index
  })
  // 首次激活的标签页可能携带尚未渲染的图表，立即触发渲染（见 initDiagramLazyRender）
  const active = tabs.querySelector<HTMLElement>(`[data-tab-panel="${index}"]`)
  if (active) revealPanelBlocks(active)
}

export function moveMarkdownTabFocus(button: HTMLButtonElement, key: string): void {
  const tablist = button.closest<HTMLElement>('[role="tablist"], .tab-list')
  const buttons = Array.from(tablist?.querySelectorAll<HTMLButtonElement>('[data-tab-button]') ?? [])
  if (!buttons.length) return
  const current = Math.max(0, buttons.indexOf(button))
  const offset = key === 'ArrowRight' ? 1 : -1
  const index =
    key === 'Home'
      ? 0
      : key === 'End'
        ? buttons.length - 1
        : (current + offset + buttons.length) % buttons.length
  const next = buttons[index]!
  selectMarkdownTab(next)
  next.focus()
}

function initTabs() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLButtonElement>('.markdown-tabs [data-tab-button]')
    if (!btn) return
    selectMarkdownTab(btn)
  })

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLButtonElement>('.markdown-tabs [data-tab-button]')
    if (btn && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      moveMarkdownTabFocus(btn, e.key)
    }
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
      const locale = getCurrentLocale()
      const originalText = copyBtn.textContent || t('interactive.copy', {}, locale)
      copyBtn.textContent = t('interactive.copied', {}, locale)
      setTimeout(() => {
        copyBtn.textContent = originalText
      }, COPY_FEEDBACK_MS)
    }).catch((err) => console.warn('Clipboard write failed:', err))
  })
}

function initJsRunners() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const switchBtn = target.closest<HTMLButtonElement>('[data-js-switch="line-numbers"]')
    if (switchBtn) {
      handleJsLineSwitch(switchBtn)
      return
    }

    const runBtn = target.closest<HTMLButtonElement>('[data-js-run]')
    if (runBtn) handleJsRun(runBtn)
  })
}

function handleJsLineSwitch(switchBtn: HTMLButtonElement): void {
  const isChecked = switchBtn.classList.contains('is-checked')
  const nextChecked = !isChecked
  switchBtn.classList.toggle('is-checked', nextChecked)
  switchBtn.setAttribute('aria-checked', String(nextChecked))
  const block = switchBtn.closest<HTMLElement>('.js-example-block')
  const codeBlock = block?.querySelector<HTMLElement>('.code-block')
  if (codeBlock) {
    codeBlock.classList.toggle('has-line-numbers', nextChecked)
  }
}

async function handleJsRun(runBtn: HTMLButtonElement): Promise<void> {
  const block = runBtn.closest<HTMLElement>('.js-example-block')
  if (!block) return
  const codeEl = block.querySelector<HTMLElement>('.code-block pre code')
  const outputBody = block.querySelector<HTMLElement>('.js-example-output-body')
  const statusEl = block.querySelector<HTMLElement>('.js-example-output-status')
  if (!codeEl || !outputBody) return

  const locale = getCurrentLocale()
  setRunStatus(statusEl, 'is-running', t('interactive.running', {}, locale))
  outputBody.replaceChildren()

  const outcome = await runUserCode(codeEl.textContent ?? '')

  const isError = outcome.timedOut || outcome.errorText !== ''
  setRunStatus(
    statusEl,
    isError ? 'is-error' : 'is-success',
    `${isError ? '✕' : '✓'} ${outcome.durationMs}ms`
  )

  renderJsOutcome(outputBody, outcome, locale)
}

function setRunStatus(statusEl: HTMLElement | null, className: string, text: string): void {
  if (!statusEl) return
  statusEl.className = `js-example-output-status ${className}`
  statusEl.textContent = text
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// 图表字体固定 13px，与代码字号量级一致，避免图内文字过大撑高容器
const MERMAID_FONT_SIZE = '13px'

// —— 图表懒渲染 ——
// 文章页可能含大量图表（展示文 14 图 + 7 表），一次性全部渲染会长时间占满主线程，
// 弱网/低端设备上页面交互（标签页切换、滚动）会整体卡顿。改为：块进入视口时渲染；
// 藏在未激活标签页里的块，在标签页首次激活时渲染。无 IntersectionObserver 的环境
// （测试/老浏览器）回退为一次性全部渲染。
const DIAGRAM_REVEAL_MARGIN_PX = '240px 0px'

const renderedMermaidBlocks = new WeakSet<HTMLElement>()
const renderedChartBlocks = new WeakSet<HTMLElement>()
let mermaidRevealObserver: IntersectionObserver | null = null
let chartRevealObserver: IntersectionObserver | null = null
let mermaidRenderChain: Promise<void> = Promise.resolve()
let mermaidSeq = 0

async function getMermaid() {
  const { default: mermaid } = await import('mermaid')
  // 每次渲染前按当前主题初始化：主题切换后旧图重渲染时能拿到新主题
  mermaid.initialize({
    startOnLoad: false,
    theme: isDarkMode() ? 'dark' : 'default',
    // strict 关闭图表内 HTML/点击注入；博客只渲染作者本人内容，不需要 loose 的能力
    securityLevel: 'strict',
    themeVariables: {
      fontSize: MERMAID_FONT_SIZE,
      background: 'transparent',
    },
  })
  return mermaid
}

// mermaid.render 内部状态非并发安全，串行化避免多块同时渲染互相干扰
function queueMermaidRender(block: HTMLElement): void {
  mermaidRenderChain = mermaidRenderChain
    .then(() => renderMermaidBlock(block))
    .catch(() => undefined)
}

function isBlockHidden(block: HTMLElement): boolean {
  const panel = block.closest<HTMLElement>('[data-tab-panel]')
  return Boolean(panel && panel.hidden)
}

function scheduleMermaidReveal(block: HTMLElement): void {
  if (renderedMermaidBlocks.has(block)) return
  if (isBlockHidden(block)) return
  if (typeof IntersectionObserver === 'undefined') {
    queueMermaidRender(block)
    return
  }
  mermaidRevealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        queueMermaidRender(entry.target as HTMLElement)
      }
    }
  }, { rootMargin: DIAGRAM_REVEAL_MARGIN_PX })
  mermaidRevealObserver.observe(block)
}

function scheduleChartReveal(block: HTMLElement): void {
  if (renderedChartBlocks.has(block)) return
  if (isBlockHidden(block)) return
  if (typeof IntersectionObserver === 'undefined') {
    void renderChartBlock(block)
    return
  }
  chartRevealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        void renderChartBlock(entry.target as HTMLElement)
      }
    }
  }, { rootMargin: DIAGRAM_REVEAL_MARGIN_PX })
  chartRevealObserver.observe(block)
}

// 标签页首次激活时把面板内未渲染的图表直接渲染（用户主动要看，不等滚动）
function revealPanelBlocks(panel: HTMLElement): void {
  for (const block of panel.querySelectorAll<HTMLElement>('.mermaid-block')) {
    if (!renderedMermaidBlocks.has(block)) queueMermaidRender(block)
  }
  for (const block of panel.querySelectorAll<HTMLElement>('.chartjs-block')) {
    if (!renderedChartBlocks.has(block)) void renderChartBlock(block)
  }
}

export function initDiagramLazyRender(): void {
  const mermaidBlocks = [...document.querySelectorAll<HTMLElement>('.mermaid-block')]
  const chartBlocks = [...document.querySelectorAll<HTMLElement>('.chartjs-block')]
  if (mermaidBlocks.length === 0 && chartBlocks.length === 0) return
  for (const block of mermaidBlocks) scheduleMermaidReveal(block)
  for (const block of chartBlocks) scheduleChartReveal(block)
}

// 错误分支用 textContent 而非 innerHTML 拼接：图表源码/报错信息可能含任意 HTML，
// 与根仓库 showMermaidError 的防御式 DOM 构建保持一致
export function showMermaidError(block: HTMLElement, err: unknown, raw: string): void {
  const wrap = document.createElement('div')
  wrap.className = 'mermaid-error'
  const message = document.createElement('span')
  message.className = 'mermaid-error-message'
  message.textContent = errorMessage(err)
  const code = document.createElement('code')
  code.textContent = raw
  wrap.appendChild(message)
  wrap.appendChild(code)
  block.replaceChildren(wrap)
  block.classList.remove('loading')
  block.classList.add('has-error')
}

export function showChartError(block: HTMLElement, err: unknown, raw: string): void {
  const banner = document.createElement('div')
  banner.className = 'chart-error-banner'
  const text = document.createElement('span')
  text.className = 'chart-error-text'
  const locale = getCurrentLocale()
  text.textContent = t('interactive.chart_error', { error: errorMessage(err) }, locale)
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  banner.appendChild(text)
  block.replaceChildren(banner, pre)
  block.classList.remove('loading')
  block.classList.add('has-error')
}

async function renderMermaidBlock(block: HTMLElement): Promise<void> {
  if (renderedMermaidBlocks.has(block)) return
  const raw = decodeURIComponent(block.dataset.mermaid || '')
  if (!raw) return
  try {
    const mermaid = await getMermaid()
    const id = `blog-mermaid-${Date.now()}-${++mermaidSeq}`
    const { svg } = await mermaid.render(id, raw)
    block.innerHTML = svg
    block.classList.remove('loading')
    block.removeAttribute('aria-busy')
    renderedMermaidBlocks.add(block)
    mermaidRevealObserver?.unobserve(block)
  } catch (err: unknown) {
    console.warn('Mermaid diagram render error:', err)
    showMermaidError(block, err, raw)
    // 失败也记账：错误态已是终态，滚动重入不再重试
    renderedMermaidBlocks.add(block)
    mermaidRevealObserver?.unobserve(block)
  }
}

const chartInstances = new Map<HTMLElement, Chart>()

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

function cssVarValue(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function buildChartConfig(config: Record<string, unknown>, textColor: string, gridColor: string): ChartConfiguration {
  const userOptions = asRecord(config.options)
  const userScales = asRecord(userOptions.scales)
  const scales: Record<string, Record<string, unknown>> = {}
  for (const [key, val] of Object.entries(userScales)) {
    if (val && typeof val === 'object') {
      const scale = val as Record<string, unknown>
      scales[key] = {
        ...scale,
        ticks: { color: textColor, ...asRecord(scale.ticks) },
        grid: { color: gridColor, ...asRecord(scale.grid) },
      }
    }
  }

  return {
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
        ...asRecord(userOptions.plugins),
      },
    },
  } as ChartConfiguration
}

// Chart canvas colors follow the theme tokens with fixed light-theme
// fallbacks for when the tokens are not resolvable (headless render).
const CHART_TEXT_FALLBACK = '#64748b'
const CHART_GRID_FALLBACK = 'rgba(0, 0, 0, 0.08)'

async function renderChartBlock(block: HTMLElement): Promise<void> {
  if (renderedChartBlocks.has(block)) return
  const existing = chartInstances.get(block)
  if (existing) {
    existing.destroy()
    chartInstances.delete(block)
  }

  const raw = decodeURIComponent(block.dataset.chart || '')
  if (!raw) return
  try {
    const textColor = cssVarValue('--text-tertiary', CHART_TEXT_FALLBACK)
    const gridColor = cssVarValue('--border-default', CHART_GRID_FALLBACK)
    const { default: Chart } = await import('chart.js/auto')
    const config = asRecord(JSON.parse(raw))
    block.innerHTML = ''
    block.classList.remove('loading', 'has-error')
    block.removeAttribute('aria-busy')

    const container = document.createElement('div')
    container.className = 'chartjs-container'
    const canvas = document.createElement('canvas')
    canvas.className = 'chartjs-canvas'
    container.appendChild(canvas)
    block.appendChild(container)

    const instance = new Chart(canvas, buildChartConfig(config, textColor, gridColor))
    chartInstances.set(block, instance)
    renderedChartBlocks.add(block)
    chartRevealObserver?.unobserve(block)
  } catch (err: unknown) {
    console.warn('Chart.js render error:', err)
    showChartError(block, err, raw)
    renderedChartBlocks.add(block)
    chartRevealObserver?.unobserve(block)
  }
}

// 主题切换只重渲染当前可见的图；隐藏块标记为待渲染，展示时按新主题渲染。
// 未渲染过的块不受影响（渲染时按当时主题初始化）。
function rerenderDiagramsForTheme(): void {
  for (const block of document.querySelectorAll<HTMLElement>('.mermaid-block')) {
    if (!renderedMermaidBlocks.has(block)) continue
    renderedMermaidBlocks.delete(block)
    if (block.getClientRects().length > 0) {
      queueMermaidRender(block)
    }
  }
  for (const block of document.querySelectorAll<HTMLElement>('.chartjs-block')) {
    if (!renderedChartBlocks.has(block)) continue
    renderedChartBlocks.delete(block)
    if (block.getClientRects().length > 0) {
      void renderChartBlock(block)
    }
  }
}

function initThemeObserver() {
  let isDark = isDarkMode()
  const onChange = () => {
    const nextDark = isDarkMode()
    if (nextDark !== isDark) {
      isDark = nextDark
      rerenderDiagramsForTheme()
    }
  }

  window.addEventListener('inkstone-appearance-change', onChange)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onChange)
  }
}