import { t, getCurrentLocale } from './i18n'

/**
 * Folding for code blocks that wrote `collapse=n` (or exceed the reading default),
 * mirroring the root app's enhance/code.ts: the block states its own threshold, the
 * folded height is measured from the block's actual line box, and the control lives
 * in the head next to copy. SSR renders the full block — this enhancement only runs
 * on clients that execute JS, so nothing is hidden without a way to open it.
 */
const DEFAULT_COLLAPSE_LINES = 24

function blockThreshold(block: HTMLElement): number {
  const own = block.dataset.codeCollapseAt
  if (own === undefined || own === '') return DEFAULT_COLLAPSE_LINES
  const value = Number(own)
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_COLLAPSE_LINES
}

/**
 * Folded height measured from the last visible line's actual box rather than
 * lineHeight × n, so a `wrap` block whose first lines break several visual rows
 * folds at the right place. Geometry is read regardless of a current max-height.
 */
function foldedMaxHeight(block: HTMLElement, pre: HTMLElement, threshold: number): string {
  const lines = Array.from(block.querySelectorAll<HTMLElement>(':scope pre code > .line'))
  const preRect = pre.getBoundingClientRect()
  const preStyle = getComputedStyle(pre)
  const paddingBottom = parseFloat(preStyle.paddingBottom) || 0
  const lastVisible = lines[Math.min(threshold, lines.length) - 1]
  if (lastVisible) {
    const bottom = lastVisible.getBoundingClientRect().bottom
    return `${Math.ceil(bottom - preRect.top + paddingBottom)}px`
  }
  const fontSize = parseFloat(getComputedStyle(pre).fontSize) || 15
  const lineHeight = parseFloat(getComputedStyle(pre).lineHeight) || fontSize * 1.56
  const paddingTop = parseFloat(preStyle.paddingTop) || 0
  return `${Math.ceil(threshold * lineHeight + paddingTop + paddingBottom)}px`
}

export function configureCodeBlockCollapsing(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.code-block:not(.markdown-example-code)').forEach((block) => {
    const threshold = blockThreshold(block)
    const pre = block.querySelector<HTMLElement>(':scope > pre')
    const lineCount = block.querySelectorAll(':scope pre code > .line').length
    // Hidden (e.g. an inactive tab) gives zero geometry: leave it unfolded; a reader
    // opening the panel sees the full block rather than a zero-height one.
    if (!pre || !pre.offsetParent || !threshold || lineCount <= threshold) return
    const head = block.querySelector<HTMLElement>(':scope > .code-block-head')
    if (!head || head.querySelector('[data-code-collapse]')) return
    const maxHeight = foldedMaxHeight(block, pre, threshold)
    block.dataset.codeCollapseLines = String(threshold)
    block.dataset.codeLineCount = String(lineCount)
    block.dataset.codeCollapseMaxHeight = maxHeight
    block.classList.add('is-code-collapsed')
    pre.style.maxHeight = maxHeight
    pre.style.overflowY = 'hidden'

    const toggle = document.createElement('button')
    toggle.className = 'code-collapse'
    toggle.type = 'button'
    toggle.dataset.codeCollapse = '1'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.textContent = t('interactive.code_show_more', { count: lineCount - threshold }, getCurrentLocale())
    head.insertBefore(toggle, head.querySelector('[data-copy]'))
  })
}

export function toggleCodeBlockCollapse(button: HTMLButtonElement): void {
  const block = button.closest<HTMLElement>('.code-block')
  if (!block) return
  const pre = block.querySelector<HTMLElement>(':scope > pre')
  const expanded = block.classList.toggle('is-code-expanded')
  block.classList.toggle('is-code-collapsed', !expanded)
  if (pre) {
    pre.style.maxHeight = expanded ? '' : block.dataset.codeCollapseMaxHeight ?? ''
    pre.style.overflowY = expanded ? '' : 'hidden'
  }
  button.setAttribute('aria-expanded', String(expanded))
  const count = Math.max(0, Number(block.dataset.codeLineCount) - Number(block.dataset.codeCollapseLines))
  button.textContent = expanded
    ? t('interactive.code_collapse', {}, getCurrentLocale())
    : t('interactive.code_show_more', { count }, getCurrentLocale())
}
