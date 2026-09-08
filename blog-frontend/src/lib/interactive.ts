import { COPY_FEEDBACK_MS } from './constants'
import { renderJsOutcome, runUserCode } from './js-runner-runner'
import { t, getCurrentLocale } from './i18n'
import { initDiagramLazyRender, isDarkMode, rerenderDiagramsForTheme, revealPanelBlocks } from './diagram-reveal'

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
      const originalText = copyBtn.textContent || t('interactive.copy', {}, getCurrentLocale())
      copyBtn.textContent = t('interactive.copied', {}, getCurrentLocale())
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

  setRunStatus(statusEl, 'is-running', t('interactive.running', {}, getCurrentLocale()))
  outputBody.replaceChildren()

  const outcome = await runUserCode(codeEl.textContent ?? '')

  const isError = outcome.timedOut || outcome.errorText !== ''
  setRunStatus(
    statusEl,
    isError ? 'is-error' : 'is-success',
    `${isError ? '✕' : '✓'} ${outcome.durationMs}ms`
  )

  renderJsOutcome(outputBody, outcome, getCurrentLocale())
}

function setRunStatus(statusEl: HTMLElement | null, className: string, text: string): void {
  if (!statusEl) return
  statusEl.className = `js-example-output-status ${className}`
  statusEl.textContent = text
}

// 主题切换只重渲染当前可见的图；未渲染的块不受影响（渲染时按当时主题初始化）
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