import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY } from './runtime'

/**
 * Two boot-path properties of the locale layer, neither of which anything else in the suite holds:
 *
 * 1. A Chinese reader needs *both* bundles — `en-US` is the fallback `t()` reads through and the
 *    source of the reverse key map — but needing both is not the same as fetching one after the
 *    other. Serialized, the second request starts a full round trip late.
 * 2. Writing the translated `<title>` must not happen before the messages exist. The module used to
 *    call `applyLocaleToDom()` at evaluation time, which replaced the value the inline script in
 *    `index.html` had just written with the literal string `app.document_title`.
 */
const boot = vi.hoisted(() => {
  const started: string[] = []
  return {
    started,
    gate: Promise.resolve() as Promise<void>,
    release: () => {},
    block() {
      let resolve: () => void = () => {}
      boot.gate = new Promise<void>((r) => { resolve = r })
      boot.release = () => resolve()
    },
  }
})

vi.mock('@shared/locales/en-US', async () => {
  boot.started.push('en-US')
  await boot.gate
  return { EN_US_MESSAGES: { 'app.document_title': 'Title EN' } }
})

vi.mock('@shared/locales/zh-CN', async () => {
  boot.started.push('zh-CN')
  await boot.gate
  return { ZH_CN_MESSAGES: { 'app.document_title': 'Title ZH' } }
})

beforeEach(() => {
  vi.resetModules()
  boot.started.length = 0
  boot.block()
  localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN')
  document.title = 'Inkstone'
})

describe('locale bootstrap', () => {
  it('asks for both locale bundles at once instead of one after the other', async () => {
    const i18n = await import('./i18n')
    const pending = i18n.initI18n()

    await vi.waitFor(() => expect([...boot.started].sort()).toEqual(['en-US', 'zh-CN']), { timeout: 2000 })
    boot.release()
    await pending
  }, 15000)

  it('leaves the document title alone until the messages are loaded', async () => {
    const i18n = await import('./i18n')
    expect(document.title).toBe('Inkstone')

    boot.release()
    await i18n.initI18n()
    expect(document.title).toBe('Title ZH')
  }, 15000)
})
