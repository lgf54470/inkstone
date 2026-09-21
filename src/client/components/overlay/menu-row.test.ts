import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { MenuRow } from './menu-row'
import type { MenuItem } from './use-menu'

installTestGlobals()

// The row both menu surfaces draw (SH-93, where the two hand-rolled copies became one). What has to
// stay true is what the row states about itself and what it draws from the item — not its classes,
// which the two callers still spell differently on purpose.

function render(item: MenuItem, props: Record<string, unknown> = {}) {
  return renderElement(h(MenuRow, { item, check: h('span', { 'data-check': 'yes' }), ...props }))
}

describe('the shared menu row', () => {
  it('names itself after the item and states whether it is a checkbox', () => {
    const plain = render({ id: 'a', label: 'Rename' })
    const row = plain.container.querySelector('button')!
    expect(row.textContent).toBe('Rename')
    expect(row.getAttribute('role')).toBe('menuitem')
    expect(row.getAttribute('aria-checked')).toBeNull()
    plain.unmount()

    const checked = render({ id: 'b', label: 'Bold', checked: true })
    const box = checked.container.querySelector('button')!
    expect(box.getAttribute('role')).toBe('menuitemcheckbox')
    expect(box.getAttribute('aria-checked')).toBe('true')
    checked.unmount()
  })

  it('draws the caller’s check mark only on a checked row', () => {
    const checked = render({ id: 'b', label: 'Bold', checked: true })
    expect(checked.container.querySelector('[data-check]')).not.toBeNull()
    checked.unmount()

    const plain = render({ id: 'a', label: 'Rename' })
    expect(plain.container.querySelector('[data-check]')).toBeNull()
    plain.unmount()
  })

  it('draws the panel arrow for a submenu row and the shortcut for a combo row', () => {
    const nested = render({ id: 'c', label: 'Move to', submenu: () => null })
    expect(nested.container.querySelector('svg.lucide-chevron-right')).not.toBeNull()
    expect(nested.container.querySelector('kbd')).toBeNull()
    nested.unmount()

    const combo = render({ id: 'd', label: 'Save', combo: 'mod+s' })
    expect(combo.container.querySelector('kbd')).not.toBeNull()
    expect(combo.container.querySelector('svg.lucide-chevron-right')).toBeNull()
    combo.unmount()
  })

})

describe('what each menu surface adds to the row', () => {
  it('keeps a disabled row out of reach and runs the caller’s click', () => {
    const onSelect = vi.fn()
    const disabled = render({ id: 'e', label: 'Delete', disabled: true }, { onClick: onSelect })
    const row = disabled.container.querySelector('button')!
    expect((row as HTMLButtonElement).disabled).toBe(true)
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).not.toHaveBeenCalled()
    disabled.unmount()

    const enabled = render({ id: 'f', label: 'Delete' }, { onClick: onSelect })
    enabled.container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    enabled.unmount()
  })

  it('lets each surface add its own tone and say how tight the row sits', () => {
    const menu = render({ id: 'g', label: 'Plain' }, { className: 'bg-[var(--bg-hover)]' })
    const classes = menu.container.querySelector('button')!.className.split(/\s+/)
    expect(classes).toContain('bg-[var(--bg-hover)]')
    expect(classes).toContain('gap-2.5')
    menu.unmount()

    const submenu = render({ id: 'h', label: 'Plain', tone: 'danger' }, { tight: true, className: 'text-[var(--danger)]' })
    const tight = submenu.container.querySelector('button')!.className.split(/\s+/)
    expect(tight).toContain('text-[var(--danger)]')
    expect(tight).toContain('gap-2')
    expect(tight).not.toContain('gap-2.5')
    submenu.unmount()
  })
})
