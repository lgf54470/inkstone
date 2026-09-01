import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATE_CATEGORIES,
  BUILTIN_TEMPLATE_DEFS,
  BUILTIN_TEMPLATE_TAG_LABELS,
  TEMPLATE_SEED_VERSION,
  buildTemplateLibraryExport,
  parseTemplateLibraryExport,
  type TemplateLibraryExport,
} from './note-templates'
import type { NoteTemplate, NoteTemplateCategory } from './types'
import { EN_US_MESSAGES } from './locales/en-US'
import { ZH_CN_MESSAGES } from './locales/zh-CN'

function placeholders(value: string): string {
  return [...value.matchAll(/\{[A-Za-z0-9_]+\}/g)].map((match) => match[0]).sort().join('|')
}

describe('built-in template catalog', () => {
  it('bumps the seed version when the catalog grows', () => {
    expect(TEMPLATE_SEED_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('uses unique ids for categories and templates', () => {
    const categoryIds = BUILTIN_TEMPLATE_CATEGORIES.map((category) => category.id)
    expect(new Set(categoryIds).size).toBe(categoryIds.length)
    const templateIds = BUILTIN_TEMPLATE_DEFS.map((template) => template.id)
    expect(new Set(templateIds).size).toBe(templateIds.length)
  })

  it('references only existing categories', () => {
    const categoryIds = new Set(BUILTIN_TEMPLATE_CATEGORIES.map((category) => category.id))
    for (const template of BUILTIN_TEMPLATE_DEFS)
      expect(categoryIds.has(template.categoryId), template.id).toBe(true)
  })

  it('ships at least one template per category', () => {
    const counts = new Map<string, number>()
    for (const template of BUILTIN_TEMPLATE_DEFS)
      counts.set(template.categoryId, (counts.get(template.categoryId) ?? 0) + 1)
    for (const category of BUILTIN_TEMPLATE_CATEGORIES)
      expect(counts.get(category.id) ?? 0, category.id).toBeGreaterThan(0)
  })

  it('resolves every name, description and content in both locales', () => {
    for (const template of BUILTIN_TEMPLATE_DEFS) {
      for (const key of [template.nameKey, template.descriptionKey, template.contentKey]) {
        const english = EN_US_MESSAGES[key]
        const chinese = ZH_CN_MESSAGES[key]
        expect(english, `${key} missing en-US`).toBeTruthy()
        expect(chinese, `${key} missing zh-CN`).toBeTruthy()
        expect(typeof english, `${key} en-US`).toBe('string')
        expect(typeof chinese, `${key} zh-CN`).toBe('string')
      }
    }
    for (const category of BUILTIN_TEMPLATE_CATEGORIES) {
      expect(EN_US_MESSAGES[category.nameKey], category.nameKey).toBeTruthy()
      expect(ZH_CN_MESSAGES[category.nameKey], category.nameKey).toBeTruthy()
    }
  })

  it('resolves every template tag label in both locales', () => {
    const usedKeys = new Set(BUILTIN_TEMPLATE_DEFS.flatMap((template) => template.tags))
    for (const key of usedKeys) {
      const labelKey = BUILTIN_TEMPLATE_TAG_LABELS[key]
      expect(EN_US_MESSAGES[labelKey], `${key} label missing en-US`).toBeTruthy()
      expect(ZH_CN_MESSAGES[labelKey], `${key} label missing zh-CN`).toBeTruthy()
    }
  })

  it('keeps tag label placeholders identical between locales', () => {
    for (const labelKey of Object.values(BUILTIN_TEMPLATE_TAG_LABELS)) {
      const english = EN_US_MESSAGES[labelKey] ?? ''
      const chinese = ZH_CN_MESSAGES[labelKey] ?? ''
      expect(placeholders(english), `${labelKey} placeholder mismatch`).toBe(placeholders(chinese))
    }
  })

  it('keeps template placeholders identical between locales', () => {
    for (const template of BUILTIN_TEMPLATE_DEFS) {
      for (const key of [template.nameKey, template.descriptionKey, template.contentKey]) {
        const english = EN_US_MESSAGES[key] ?? ''
        const chinese = ZH_CN_MESSAGES[key] ?? ''
        expect(placeholders(english), `${key} placeholder mismatch`).toBe(placeholders(chinese))
      }
    }
  })

  it('starts every template body with a front matter block', () => {
    for (const template of BUILTIN_TEMPLATE_DEFS) {
      const english = EN_US_MESSAGES[template.contentKey] ?? ''
      expect(english.startsWith('---\n'), `${template.contentKey} en-US`).toBe(true)
      const chinese = ZH_CN_MESSAGES[template.contentKey] ?? ''
      expect(chinese.startsWith('---\n'), `${template.contentKey} zh-CN`).toBe(true)
    }
  })
})

describe('template library export', () => {
  const category: NoteTemplateCategory = {
    id: 'cat-1',
    name: 'My Category',
    builtin: false,
    position: 0,
    createdAt: 1000,
  }
  const builtinCategory: NoteTemplateCategory = {
    id: 'productivity',
    name: 'Productivity',
    builtin: true,
    position: 0,
    createdAt: 1000,
  }
  const template: NoteTemplate = {
    id: 'tpl-1',
    categoryId: 'cat-1',
    name: 'My Template',
    description: 'A template',
    content: '# Hello',
    builtin: false,
    isPinned: false,
    isStarred: true,
    tags: ['tag-a', 'tag-b'],
    createdAt: 1000,
    updatedAt: 2000,
  }
  const builtinTemplate: NoteTemplate = {
    ...template,
    id: 'bullet-journal',
    builtin: true,
    tags: [],
  }

  it('exports only user-created templates and categories', () => {
    const data = buildTemplateLibraryExport(
      [category, builtinCategory],
      [template, builtinTemplate],
    )
    expect(data.categories.map((item) => item.id)).toEqual(['cat-1'])
    expect(data.templates.map((item) => item.id)).toEqual(['tpl-1'])
  })

  it('round-trips an export through the parser', () => {
    const data = buildTemplateLibraryExport([category], [template])
    const text = JSON.stringify(data)
    const parsed = parseTemplateLibraryExport(text)
    expect(parsed).not.toBeNull()
    expect(parsed!.categories).toEqual(data.categories)
    expect(parsed!.templates).toEqual(data.templates)
  })

  it('rejects malformed exports', () => {
    expect(parseTemplateLibraryExport('not json')).toBeNull()
    expect(parseTemplateLibraryExport('{}')).toBeNull()
    expect(parseTemplateLibraryExport(JSON.stringify({ app: 'other', kind: 'template-library', version: 1 }))).toBeNull()
    expect(parseTemplateLibraryExport(JSON.stringify({ ...buildTemplateLibraryExport([category], [template]), version: 2 }))).toBeNull()
  })

  it('drops malformed entries but keeps valid ones', () => {
    const payload: TemplateLibraryExport = {
      ...buildTemplateLibraryExport([category], [template]),
      templates: [template, { ...template, id: 42 } as unknown as NoteTemplate, { ...template, name: '' }],
    }
    const parsed = parseTemplateLibraryExport(JSON.stringify(payload))
    expect(parsed).not.toBeNull()
    expect(parsed!.templates.length).toBe(2)
  })
})
