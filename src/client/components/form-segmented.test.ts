import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../lib/test-render'
import { Field, Segmented } from './form'

/**
 * SH-46: the client-wide radiogroup guard (tests/radiogroup-names.test.ts) lets a
 * `Segmented` stay attribute-free when `Field` wraps it alone, because `Field`
 * clones `aria-labelledby` onto its control. That exemption is only legitimate if
 * the wiring really reaches the `role='radiogroup'`, which is what these two cases
 * pin down.
 */
const OPTIONS = [
  { value: 's3', label: 'S3' },
  { value: 'webdav', label: 'WebDAV' },
]

function underField(children: ReactNode): ReactElement {
  return createElement(Field, { label: 'Backup type', children })
}

function radiogroup(): HTMLElement {
  const group = document.querySelector('[role="radiogroup"]')
  if (!group) throw new Error('the radiogroup did not render')
  return group as HTMLElement
}

function accessibleName(group: HTMLElement): string | null {
  const id = group.getAttribute('aria-labelledby')
  return id === null ? null : (document.getElementById(id)?.textContent ?? null)
}

describe('Field names the Segmented it wraps (SH-46)', () => {
  it('points the radiogroup at the visible Field label', () => {
    const { unmount } = renderElement(underField(
      createElement(Segmented, { value: 's3', options: OPTIONS, onChange: vi.fn() }),
    ))

    const group = radiogroup()
    expect(group.getAttribute('aria-label')).toBeNull()
    expect(accessibleName(group)).toBe('Backup type')
    unmount()
  })

  it('does not reach a control that sits behind a wrapper, so the guard must not excuse it', () => {
    const { unmount } = renderElement(underField(
      createElement('div', null, createElement(Segmented, { value: 's3', options: OPTIONS, onChange: vi.fn() })),
    ))

    const group = radiogroup()
    expect(group.getAttribute('aria-label')).toBeNull()
    expect(group.getAttribute('aria-labelledby')).toBeNull()
    unmount()
  })
})
