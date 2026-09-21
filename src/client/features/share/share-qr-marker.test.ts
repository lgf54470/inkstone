import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The QR code is the one artifact whose contents nothing else in the DOM reveals, so the vendor
 * component is stubbed with something that prints the string it was asked to encode. Everything
 * else — the displayed URL, the copied link, the open-in-new-tab href — is asserted against the
 * real rendering.
 */
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => createElement('div', { 'data-qr-value': value }),
}))

import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { ShareQrModal } from './share-qr-modal'

const SHARE_URL = 'https://inkstone.test/s/abc123'

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function markerInput(): HTMLInputElement {
  const found = document.body.querySelector<HTMLInputElement>('input')
  expect(found, 'the marker field').toBeTruthy()
  return found!
}

function encodedQrUrl(): string {
  return document.body.querySelector('[data-qr-value]')?.getAttribute('data-qr-value') ?? ''
}

function openLinkHref(): string {
  return document.body.querySelector('a[target="_blank"]')?.getAttribute('href') ?? ''
}

/** The URL the panel displays next to the code. */
function displayedUrl(): string {
  return [...document.body.querySelectorAll('p')].map((p) => p.textContent ?? '').find((text) => text.includes('/s/')) ?? ''
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await initI18n()
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

/**
 * ADR-0004: a marker is only worth typing if it reaches every way out of the panel. The code, the
 * copied link and the open link all read one URL, so they cannot disagree — and a marker the
 * visitor's page would refuse is shown as invalid instead of being silently dropped from them.
 */
describe('share QR panel distribution marker (ADR-0004)', () => {
  it('is an optional named field with the marker rules as its hint', () => {
    const rendered = renderElement(createElement(ShareQrModal, { open: true, onClose: () => {}, url: SHARE_URL, title: 'Note', slug: 'abc123' }))

    const input = markerInput()
    expect(document.body.textContent).toContain(t('share.channel_input_label'))
    expect(document.body.textContent).toContain(t('share.channel_input_hint'))
    expect(input.value).toBe('')
    // Absent rather than "false": the field only declares invalid once it is.
    expect(input.getAttribute('aria-invalid')).toBeNull()
    rendered.unmount()
  })

  it('carries the marker into the code, the displayed URL, the copied link and the open link', async () => {
    const rendered = renderElement(createElement(ShareQrModal, { open: true, onClose: () => {}, url: SHARE_URL, title: 'Note', slug: 'abc123' }))

    typeInto(markerInput(), 'newsletter')

    const marked = `${SHARE_URL}?ref=newsletter`
    expect(encodedQrUrl()).toBe(marked)
    expect(displayedUrl()).toBe(marked)
    expect(openLinkHref()).toBe(marked)
    const copyButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes(t('share.copy_link')))
    expect(copyButton, 'the copy-link button').toBeTruthy()
    await act(async () => {
      copyButton!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(writeText).toHaveBeenCalledWith(marked)
    rendered.unmount()
  })

  it('leaves both the code and the link unmarked and says so when the marker is unusable', () => {
    const rendered = renderElement(createElement(ShareQrModal, { open: true, onClose: () => {}, url: SHARE_URL, title: 'Note', slug: 'abc123' }))

    typeInto(markerInput(), 'News Letter')

    // The storing end would refuse it, so handing out a link that claims the marker would be a lie.
    expect(encodedQrUrl()).toBe(SHARE_URL)
    expect(displayedUrl()).toBe(SHARE_URL)
    expect(openLinkHref()).toBe(SHARE_URL)
    expect(markerInput().getAttribute('aria-invalid')).toBe('true')
    expect(document.body.textContent).toContain(t('share.channel_input_invalid'))
    rendered.unmount()
  })
})
