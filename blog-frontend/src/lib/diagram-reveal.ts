import type { Chart, ChartConfiguration } from 'chart.js/auto'
import { asRecord } from './normalize'
import { t, getCurrentLocale } from './i18n'
import { createConcurrencyQueue } from './concurrency-queue'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// 图表字体固定 13px，与代码字号量级一致，避免图内文字过大撑高容器
const MERMAID_FONT_SIZE = '13px'

// —— 图表懒渲染 ——
// 文章页可能含大量图表（展示文 14 图 + 7 表），一次性全部渲染会长时间占满主线程。
// 改为块进入视口时渲染；藏在未激活标签页里的块在标签页首次激活时渲染。
const DIAGRAM_REVEAL_MARGIN_PX = '240px 0px'

const renderedMermaidBlocks = new WeakSet<HTMLElement>()
const renderedChartBlocks = new WeakSet<HTMLElement>()
const mermaidRevealObserver: { current: IntersectionObserver | null } = { current: null }
const chartRevealObserver: { current: IntersectionObserver | null } = { current: null }
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

// 视口进入才渲染：mermaid 与 chart 共用本调度，差异只在“进入视口后做什么”。
// 观察者按类单例复用；无 IntersectionObserver 的环境（测试/老浏览器）直接渲染。
function scheduleReveal(
  block: HTMLElement,
  rendered: WeakSet<HTMLElement>,
  observerRef: { current: IntersectionObserver | null },
  render: (block: HTMLElement) => void,
): void {
  if (rendered.has(block) || isBlockHidden(block)) return
  if (typeof IntersectionObserver === 'undefined') {
    render(block)
    return
  }
  observerRef.current ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) render(entry.target as HTMLElement)
    }
  }, { rootMargin: DIAGRAM_REVEAL_MARGIN_PX })
  observerRef.current.observe(block)
}

function scheduleMermaidReveal(block: HTMLElement): void {
  scheduleReveal(block, renderedMermaidBlocks, mermaidRevealObserver, queueMermaidRender)
}

// 图表渲染串入并发队列（同时最多 2 个在途）。chartQueuedBlocks 覆盖“已排队 + 渲染中”
// 的块直到渲染完成：滚动时观察者可能重复触发同一块，入队即摘除标记会致双渲染。
const CHART_RENDER_CONCURRENCY = 2
const chartRenderQueue = createConcurrencyQueue(CHART_RENDER_CONCURRENCY)
const chartQueuedBlocks = new Set<HTMLElement>()

function enqueueChartRender(block: HTMLElement): void {
  if (renderedChartBlocks.has(block) || chartQueuedBlocks.has(block)) return
  chartQueuedBlocks.add(block)
  chartRenderQueue.push(() => renderChartBlock(block).finally(() => chartQueuedBlocks.delete(block)))
}

function scheduleChartReveal(block: HTMLElement): void {
  scheduleReveal(block, renderedChartBlocks, chartRevealObserver, enqueueChartRender)
}

// 兜底：IntersectionObserver 的投递是采样式的，主线程繁忙（mermaid 串行渲染）时
// 快速滚动可能让某些块从未被报告相交，一直停留在 loading。滚动停止后把仍在
// 视口内的未渲染块补入队列，保证用户停下来看到的图表最终都会渲染。
const SCROLL_SETTLE_MS = 200
let settleTimer: ReturnType<typeof setTimeout> | null = null
let viewportFallbackBound = false

function scheduleViewportFallback(): void {
  if (settleTimer !== null) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settleTimer = null
    for (const block of document.querySelectorAll<HTMLElement>('.mermaid-block.loading, .chartjs-block.loading')) {
      const rect = block.getBoundingClientRect()
      // 隐藏块 rect 全零（display:none），视口重叠判断天然跳过
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue
      if (block.classList.contains('mermaid-block')) queueMermaidRender(block)
      else enqueueChartRender(block)
    }
  }, SCROLL_SETTLE_MS)
}

// 标签页首次激活时把面板内未渲染的图表直接渲染（用户主动要看，不等滚动）
export function revealPanelBlocks(panel: HTMLElement): void {
  for (const block of panel.querySelectorAll<HTMLElement>('.mermaid-block')) {
    if (!renderedMermaidBlocks.has(block)) queueMermaidRender(block)
  }
  for (const block of panel.querySelectorAll<HTMLElement>('.chartjs-block')) {
    if (!renderedChartBlocks.has(block)) enqueueChartRender(block)
  }
}

export function initDiagramLazyRender(): void {
  const mermaidBlocks = [...document.querySelectorAll<HTMLElement>('.mermaid-block')]
  const chartBlocks = [...document.querySelectorAll<HTMLElement>('.chartjs-block')]
  if (mermaidBlocks.length === 0 && chartBlocks.length === 0) return
  for (const block of mermaidBlocks) scheduleMermaidReveal(block)
  for (const block of chartBlocks) scheduleChartReveal(block)
  // 滚动兜底只绑一次：initDiagramLazyRender 幂等，重复调用不重复监听
  if (!viewportFallbackBound) {
    viewportFallbackBound = true
    window.addEventListener('scroll', scheduleViewportFallback, { passive: true })
  }
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
  block.classList.replace('loading', 'has-error')
}

export function showChartError(block: HTMLElement, err: unknown, raw: string): void {
  const banner = document.createElement('div')
  banner.className = 'chart-error-banner'
  const text = document.createElement('span')
  text.className = 'chart-error-text'
  text.textContent = t('interactive.chart_error', { error: errorMessage(err) }, getCurrentLocale())
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
    mermaidRevealObserver.current?.unobserve(block)
  } catch (err: unknown) {
    console.warn('Mermaid diagram render error:', err)
    showMermaidError(block, err, raw)
    // 失败也记账：错误态已是终态，滚动重入不再重试
    renderedMermaidBlocks.add(block)
    mermaidRevealObserver.current?.unobserve(block)
  }
}

const chartInstances = new Map<HTMLElement, Chart>()

export function isDarkMode(): boolean {
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

// Chart.js 模块只加载一次，并发渲染共享同一个 import 承诺（模块是单例，重复加载无收益）
let chartModulePromise: Promise<typeof import('chart.js/auto')> | null = null

function loadChartModule(): Promise<typeof import('chart.js/auto')> {
  chartModulePromise ??= import('chart.js/auto').catch((err) => {
    chartModulePromise = null // 加载失败（如网络瞬断）时清除缓存，允许下一次渲染重试
    throw err
  })
  return chartModulePromise
}

async function renderChartBlock(block: HTMLElement): Promise<void> {
  if (renderedChartBlocks.has(block)) return
  chartInstances.get(block)?.destroy()
  chartInstances.delete(block)

  const raw = decodeURIComponent(block.dataset.chart || '')
  if (!raw) return
  try {
    const textColor = cssVarValue('--text-tertiary', CHART_TEXT_FALLBACK)
    const gridColor = cssVarValue('--border-default', CHART_GRID_FALLBACK)
    const { default: Chart } = await loadChartModule()
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
    chartRevealObserver.current?.unobserve(block)
  } catch (err: unknown) {
    console.warn('Chart.js render error:', err)
    showChartError(block, err, raw)
    renderedChartBlocks.add(block)
    chartRevealObserver.current?.unobserve(block)
  }
}

// 主题切换只重渲染当前可见的图；隐藏块标记为待渲染，展示时按新主题渲染。
// 未渲染过的块不受影响（渲染时按当时主题初始化）。
export function rerenderDiagramsForTheme(): void {
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
      enqueueChartRender(block)
    }
  }
}