import { describe, expect, it } from 'vitest'
import { BENTO_SLIDES_TEMPLATES } from './slides-templates'

describe('slides-templates', () => {
  it('defines both json showcase and outline templates', () => {
    expect(BENTO_SLIDES_TEMPLATES.length).toBe(2)
    const jsonTmpl = BENTO_SLIDES_TEMPLATES.find((t) => t.id === 'json')
    const outlineTmpl = BENTO_SLIDES_TEMPLATES.find((t) => t.id === 'outline')
    expect(jsonTmpl).toBeDefined()
    expect(outlineTmpl).toBeDefined()
  })

  it('provides valid parseable json in json template', () => {
    const jsonTmpl = BENTO_SLIDES_TEMPLATES.find((t) => t.id === 'json')
    expect(jsonTmpl).toBeDefined()
    if (!jsonTmpl) return
    const parsed = JSON.parse(jsonTmpl.code)
    expect(parsed.format).toBe('bento/slides')
    expect(parsed.version).toBe(1)
    expect(parsed.title).toBe('Bento Slides Showcase')
    expect(parsed.slides.length).toBeGreaterThanOrEqual(3)
    expect(parsed.slides[0]?.title).toBe('The file is the software.')
  })

  it('provides valid outline template separated by hr rules', () => {
    const outlineTmpl = BENTO_SLIDES_TEMPLATES.find((t) => t.id === 'outline')
    expect(outlineTmpl).toBeDefined()
    if (!outlineTmpl) return
    const sections = outlineTmpl.code.split(/---/)
    expect(sections.length).toBe(3)
    expect(sections[0]).toContain('# Bento Slides Showcase')
  })
})
