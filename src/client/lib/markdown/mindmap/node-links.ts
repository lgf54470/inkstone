/**
 * Turning a node whose topic is a wiki link into something clickable.
 *
 * The library draws a topic as text, so the link is added afterwards: the node's
 * own markup is left alone and only its text is replaced by an anchor that
 * carries the same `data-wikilink` a prose link does — which is what lets the
 * preview's existing wiki navigation take the click without a second
 * implementation. Re-applied whenever the library rebuilds its nodes, because a
 * rebuild throws the anchor away.
 */

import { t } from '../../i18n'
import { encodeDataValue } from '../data-attr'
import { parseWikiTarget } from '../renderer'
import { parseMindmapNodeLink } from './links'

/** Marks an anchor this module added, so a click can be told from a prose link. */
export const MINDMAP_NODE_LINK_ATTR = 'data-mindmap-node-link'

export const MINDMAP_NODE_LINK_CLASS = 'mindmap-node-link'

const TOPIC_SELECTOR = 'me-tpc'

/**
 * Re-decorates every node in the map. Idempotent: a node already carrying an
 * anchor is left as it is, which is what makes this cheap to call from every
 * place the library rebuilds its tree.
 */
export function decorateMindmapLinks(container: HTMLElement | null): void {
  if (!container) return
  for (const topic of container.querySelectorAll<HTMLElement>(TOPIC_SELECTOR)) {
    if (topic.querySelector(`[${MINDMAP_NODE_LINK_ATTR}]`)) continue
    const target = parseMindmapNodeLink(topic.textContent ?? '')
    if (!target) continue
    const parsed = parseWikiTarget(target)
    const label = parsed.alias || parsed.raw
    const link = document.createElement('a')
    link.className = MINDMAP_NODE_LINK_CLASS
    link.setAttribute(MINDMAP_NODE_LINK_ATTR, '1')
    link.setAttribute('data-wikilink', encodeDataValue(parsed.raw))
    link.href = '#'
    link.textContent = label
    link.title = t('preview.mindmap_node_link_hint', { title: label })
    topic.replaceChildren(link)
  }
}
