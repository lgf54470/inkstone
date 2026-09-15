import { describe, expect, it } from 'vitest'
import { decodeDataValue } from '../data-attr'
import { MINDMAP_NODE_LINK_ATTR, MINDMAP_NODE_LINK_CLASS, decorateMindmapLinks } from './node-links'

function map(...topics: string[]): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = topics.map((topic) => `<me-tpc>${topic}</me-tpc>`).join('')
  return container
}

describe('decorateMindmapLinks — whole-topic links', () => {
  it('turns only the linked topics into anchors the wiki navigation reads', () => {
    const container = map('[[Other note]]', 'plain topic')
    decorateMindmapLinks(container)
    const topics = [...container.querySelectorAll('me-tpc')]
    const link = topics[0]!.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.className).toBe(MINDMAP_NODE_LINK_CLASS)
    expect(link!.hasAttribute(MINDMAP_NODE_LINK_ATTR)).toBe(true)
    expect(decodeDataValue(link!.dataset.wikilink ?? '')).toBe('Other note')
    expect(link!.textContent).toBe('Other note')
    expect(topics[1]!.querySelector('a')).toBeNull()
    expect(topics[1]!.textContent).toBe('plain topic')
  })

  it('shows the alias but links the note', () => {
    const container = map('[[Other note|Short]]')
    decorateMindmapLinks(container)
    const link = container.querySelector('a')!
    expect(link.textContent).toBe('Short')
    expect(decodeDataValue(link.dataset.wikilink ?? '')).toBe('Other note')
  })

  it('is idempotent, so it can run after every rebuild', () => {
    const container = map('[[Other note]]')
    decorateMindmapLinks(container)
    decorateMindmapLinks(container)
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })

  it('does nothing without a map', () => {
    expect(() => decorateMindmapLinks(null)).not.toThrow()
  })
})

describe('decorateMindmapLinks — links embedded in a topic', () => {
  it('keeps the text around the link and links the note', () => {
    const container = map('Community [[AGENTS.md]] rocks')
    decorateMindmapLinks(container)
    const topic = container.querySelector('me-tpc')!
    const link = topic.querySelector('a')!
    expect(link.className).toBe(MINDMAP_NODE_LINK_CLASS)
    expect(decodeDataValue(link.dataset.wikilink ?? '')).toBe('AGENTS.md')
    expect(link.textContent).toBe('AGENTS.md')
    expect(topic.textContent).toBe('Community AGENTS.md rocks')
    expect(topic.firstChild?.nodeType).toBe(Node.TEXT_NODE)
  })

  it('keeps an empty link as literal text', () => {
    const container = map('a [[]] b')
    decorateMindmapLinks(container)
    const topic = container.querySelector('me-tpc')!
    expect(topic.querySelector('a')).toBeNull()
    expect(topic.textContent).toBe('a [[]] b')
  })

  it('is idempotent for embedded links too', () => {
    const container = map('Community [[AGENTS.md]]')
    decorateMindmapLinks(container)
    decorateMindmapLinks(container)
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })
})
