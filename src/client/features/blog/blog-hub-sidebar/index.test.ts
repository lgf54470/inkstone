import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../lib/test-render'
import { BlogHubSidebar } from './index'

// UI-07: the folder and tag sections' create buttons were `opacity-0 group-hover/head:opacity-100`,
// so a desktop keyboard user could tab to a control that was never drawn. The `focus-visible` arm is
// what makes the control appear when it takes focus.

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

function namedButton(container: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

describe('blog hub sidebar section actions', () => {
  it('draws the create buttons when they take focus', () => {
    const rendered = renderElement(createElement(BlogHubSidebar, {
      onOpenCategoriesModal: vi.fn(),
      onOpenSettingsModal: vi.fn(),
    }))
    try {
      for (const label of [t('folders.create_new'), t('tags.new')]) {
        const button = namedButton(rendered.container, label)
        expect(button, `${label} is missing`).toBeDefined()
        expect(button!.className, `${label} stays invisible while focused`).toContain('focus-visible:opacity-100')
        expect(button!.className, `${label} hides on a phone, where there is no hover to reveal it`).toContain(
          'md:opacity-0',
        )
      }
    } finally {
      rendered.unmount()
    }
  })
})
