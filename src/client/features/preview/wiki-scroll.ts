import { type RefObject } from 'react'
import { slugifyHeading } from '@shared/markdown-utils'
import { parseWikiTarget } from '../../lib/markdown/renderer'
import { preferredScrollBehavior } from '../../lib/motion'

export function scrollToWikiTarget(
  hostRef: RefObject<HTMLDivElement | null>,
  target: ReturnType<typeof parseWikiTarget>,
  isCurrent: () => boolean,
): () => void {
  if (!target.heading && !target.blockId) return () => {}
  const id = target.blockId ? `^${target.blockId}` : slugifyHeading(target.heading!)
  let attempts = 0
  let timer = 0
  let isCancelled = false
  const find = () => {
    if (isCancelled || !isCurrent()) return
    const element = hostRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (element) scrollElementIntoView(element)
    else if (++attempts < 12) timer = window.setTimeout(find, 50)
  }
  find()
  return () => {
    isCancelled = true
    window.clearTimeout(timer)
  }
}

export function scrollElementIntoView(element: Element | null | undefined): void {
  element?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
}

