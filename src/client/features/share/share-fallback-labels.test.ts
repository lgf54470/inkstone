import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import {
  countryNameLocalized,
  localizeEnvName,
  localizeReferrerName,
} from './share-helpers'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(),
      cleanVisits: vi.fn(async () => ({ deleted: 0 })),
    },
  },
}))

function missingFieldVisit() {
  return {
    id: 1,
    noteId: 'note-gone',
    noteTitle: null,
    slug: 'abc123',
    visitedAt: 1_700_000_000_000,
    country: null,
    region: null,
    city: null,
    referrer: null,
    referrerHost: null,
    deviceType: null,
    os: null,
    browser: null,
    visitorFp: 'fp-1',
    isBot: true,
    isSelfReferrer: false,
    isOwner: false,
    botName: null,
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('countryNameLocalized is locale-explicit and cached', () => {
  it('resolves region names in the locale it is given', () => {
    expect(countryNameLocalized('US', 'en-US')).toBe('United States')
    expect(countryNameLocalized('US', 'fr-FR')).toBe('États-Unis')
  })

  it('localizes the unknown-country sentinel instead of echoing it', () => {
    expect(countryNameLocalized('UNKNOWN', 'en-US')).toBe(t('share.country_unknown'))
    expect(countryNameLocalized(null, 'en-US')).toBe(t('share.country_unknown'))
  })

  it('reuses one Intl.DisplayNames instance per locale', () => {
    const Original = Intl.DisplayNames
    let constructions: string[] = []
    class CountedDisplayNames extends Original {
      constructor(locales: Intl.LocalesArgument, options: Intl.DisplayNamesOptions) {
        super(locales, options)
        constructions.push(String(locales))
      }
    }
    Object.defineProperty(Intl, 'DisplayNames', { value: CountedDisplayNames, configurable: true })
    try {
      countryNameLocalized('JP', 'ja-JP')
      countryNameLocalized('KR', 'ja-JP')
      countryNameLocalized('CN', 'ko-KR')
    }
    finally {
      Object.defineProperty(Intl, 'DisplayNames', { value: Original, configurable: true })
    }
    expect(constructions).toEqual(['ja-JP', 'ko-KR'])
  })
})

describe('machine tokens localize through message ids', () => {
  it('maps the Direct referrer bucket to the direct-access label', () => {
    expect(localizeReferrerName('Direct')).toBe(t('share.direct_access'))
    expect(localizeReferrerName('news.ycombinator.com')).toBe('news.ycombinator.com')
  })

  it('maps missing or "other" environment names to the unknown label', () => {
    expect(localizeEnvName(null)).toBe(t('share.env_unknown'))
    expect(localizeEnvName('Other')).toBe(t('share.env_unknown'))
    expect(localizeEnvName('other')).toBe(t('share.env_unknown'))
    expect(localizeEnvName('Chrome')).toBe('Chrome')
  })
})

describe('visit logs table localizes every missing field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.share.visits).mockResolvedValue({
      visits: [missingFieldVisit()],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    })
  })

  it('labels a deleted note, unknown country, env and bot without English literals', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await settle()

    const text = document.body.textContent ?? ''
    expect(text).toContain(t('common.untitled_note'))
    expect(text).toContain(t('share.country_unknown'))
    expect(text).toContain(t('share.env_unknown'))
    expect(text).toContain(t('share.badge_bot'))
    expect(text).not.toContain('Untitled note')
    expect(text).not.toContain('UNKNOWN')
    expect(text).not.toContain(' / Unknown')
    rendered.unmount()
  })
})
