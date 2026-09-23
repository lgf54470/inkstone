import { secureRandomId } from '../../id'
import { t } from '../../i18n'
import { createFenceBodies, type FenceBodies } from '../fence-bodies'
import type { RenderEnvironment } from './types'
export 
function emptyEnvironment(fences: FenceBodies = createFenceBodies()): RenderEnvironment {
  const nonce = createNonce()
  return {
    headings: [],
    hasMath: false,
    hasMermaid: false,
    hasChart: false,
    hasMindmap: false,
    hasKanban: false,
    hasBentoSlides: false,
    hasEmbeds: false,
    frontMatter: {},
    frontMatterErrors: [],
    taskNonce: nonce,
    tabSequence: 0,
    exampleSequence: 0,
    fences,
    docId: `ink-${nonce}`,
    externalImages: false,
  }
}
export 
function renderEnv(value: unknown): RenderEnvironment {
  return value as RenderEnvironment
}

function createNonce(): string {
  return secureRandomId()
}
export 
function materializeTrustedTasks(html: string, nonce: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('[data-task-placeholder]').forEach((placeholder) => {
    if (placeholder.dataset.taskPlaceholder !== nonce)
      return
    const line = placeholder.dataset.taskLine
    if (!line || !/^\d+$/.test(line))
      return
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'task-list-item-checkbox'
    input.checked = placeholder.dataset.taskChecked === '1'
    const status = placeholder.dataset.taskStatus || (input.checked ? 'done' : 'todo')
    input.dataset.taskStatus = status
    if (input.checked)
      input.setAttribute('checked', '')
    if (status === 'in-progress')
      input.indeterminate = true
    if (placeholder.closest('.markdown-example-preview')) {
      input.disabled = true
      input.setAttribute('aria-label', t('markdown.the_tasks_in_the_example_are_read_only'))
    }
    else {
      input.dataset.taskLine = line
      input.setAttribute('aria-label', input.checked ? t('markdown.mark_incomplete') : t('markdown.mark_complete'))
    }
    placeholder.replaceWith(input)
  })
  return template.innerHTML
}
