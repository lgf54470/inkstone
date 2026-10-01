import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { api } from '../../../lib/api'
import { ApiError } from '../../../lib/api/transport'
import { initI18n, t, translateApiError } from '../../../lib/i18n'
import { renderElement } from '../../../lib/test-render'
import { GraphPanel } from './index'
import { settleGraphPanel } from './graph-panel-mount.test-helpers'

vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

/**
 * A throttled graph read is a state the reader has to be able to leave: the server's 429 has to reach
 * the panel as the localized message it will be shown, and the retry it offers has to be the thing
 * that asks again. A panel that swallowed the status would draw an empty graph over a library that
 * has one, which reads as "your notes are gone" rather than "you asked too often".
 */
describe('graph panel read budget (G-03)', () => {
  beforeAll(async () => { await initI18n() })

  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('shows the throttled message and asks again when its retry is pressed', async () => {
    vi.mocked(api.graph)
      .mockRejectedValueOnce(new ApiError(429, 'too_many_attempts', translateApiError('too_many_attempts', '')))
      // The retry's own answer never lands: this case is about the first state and the second call.
      .mockReturnValue(new Promise(() => {}))
    const rendered = renderElement(createElement(GraphPanel, { onClose: vi.fn() }))
    await settleGraphPanel()

    expect(document.body.textContent).toContain(t('graph.could_not_load_graph'))
    expect(document.body.textContent).toContain(t('api.error.too_many_attempts'))
    const retry = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === t('common.retry'))
    expect(retry).toBeTruthy()

    retry!.click()
    await settleGraphPanel()
    expect(vi.mocked(api.graph)).toHaveBeenCalledTimes(2)
    rendered.unmount()
  })
})
