import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../lib/i18n'
import { installTestGlobals, renderElement } from '../lib/test-render'
import { FolderRow } from './hub-folder-row'
import { HubTagItem } from './hub-tag-item'
import type { FolderRowProps } from './use-hub-folder-item'

installTestGlobals()

// The two hub rows (share and blog sidebars) used to be `div[role=button]` rows carrying focusable
// children and unnamed icon buttons inside — the shape axe rejects as `nested-interactive` and
// `button-name`, and the reason the share center's axe pass only held on an account with no tags
// (SH-93). What has to stay true is the shape, not the styling: selecting the row is a real button
// named after the tag or folder, and every control beside it is a sibling with a name.

const TAG_LABELS = {
  rename: 'Rename',
  color: 'Color',
  enable: 'Enable in bulk',
  disable: 'Disable in bulk',
  toggleLabel: 'Toggle every share of this tag',
  emptyHint: 'Nothing to toggle yet',
}

const FOLDER_LABELS = {
  enable: 'Enable in bulk',
  disable: 'Disable in bulk',
  toggleLabel: 'Toggle every share in this folder',
  emptyHint: 'Nothing to toggle yet',
}

function accessibleName(element: Element): string {
  return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim()
}

/** The controls that carry no name at all — what `button-name` reports, read off the DOM instead. */
function unnamedControls(container: HTMLElement): string[] {
  return [...container.querySelectorAll('button, input, select, textarea')]
    .filter((element) => accessibleName(element) === '')
    .map((element) => element.outerHTML.slice(0, 80))
}

function rowButtons(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('button')]
}

/** The row's own control, found by the name it stands for rather than by being the first button. */
function labelButton(container: HTMLElement, label: string): Element | undefined {
  return rowButtons(container).find((button) => button.textContent?.trim() === label)
}

function renderTagRow(onSelect = vi.fn()) {
  const rendered = renderElement(createElement(HubTagItem, {
    tag: { id: 'share-tag-1', name: 'Launch' },
    displayName: 'Launch',
    // One child, so the expand affordance is drawn too — it is the other unnamed icon button this
    // shape used to carry.
    hasChildren: true,
    isSelected: false,
    counts: { total: 3, enabled: 3 },
    isRenaming: false,
    batchBusy: false,
    labels: TAG_LABELS,
    onSelect,
    onBatchToggle: vi.fn(),
    onStartRename: vi.fn(),
    onFinishRename: vi.fn(),
    onColorChange: vi.fn(),
    onDelete: vi.fn(),
  }))
  return { ...rendered, onSelect }
}

function renderFolderRow(onSelect = vi.fn()) {
  const noop = vi.fn()
  const props: FolderRowProps = {
    // One child, so the expand affordance is drawn too — it is the other unnamed icon button this
    // shape used to carry.
    node: { folder: { id: 'folder-1', name: 'Archive', color: null }, depth: 0, children: [{ id: 'child-1' }] },
    isExpanded: false,
    isSelected: false,
    isRenaming: false,
    isDragOver: false,
    batchBusy: false,
    labels: FOLDER_LABELS,
    counts: { safeTotal: 2, safeEnabled: 2, isChecked: true },
    nameInput: 'Archive',
    refs: { inputRef: { current: null }, moreButtonRef: { current: null } },
    handlers: {
      onToggleExpand: noop,
      onSelect,
      onContextMenu: noop,
      onDragOver: noop,
      onDragLeave: noop,
      onDrop: noop,
      onNameChange: noop,
      onFinishRename: noop,
      onBatchToggle: noop,
      onToggleMenu: noop,
      onEmptyToast: noop,
    },
  }
  const rendered = renderElement(createElement(FolderRow, props))
  return { ...rendered, onSelect }
}

const ROWS: Array<{ name: string; label: string; render: typeof renderTagRow }> = [
  { name: 'tag row', label: 'Launch', render: renderTagRow },
  { name: 'folder row', label: 'Archive', render: renderFolderRow },
]

describe('hub rows are real controls (SH-93)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it.each(ROWS)('$name selects through a button rather than a div that pretends to be one', ({ label, render }) => {
    const { container, unmount, onSelect } = render()
    expect(container.querySelector('[role="button"]')).toBeNull()
    expect(container.querySelector('[tabindex]')).toBeNull()
    // The label is the row's own control, so its accessible name is the tag or folder it stands for.
    const control = labelButton(container, label)
    expect(control).toBeDefined()
    control?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    unmount()
  })

  it.each(ROWS)('$name gives every control beside the label a name', ({ render }) => {
    const { container, unmount } = render()
    expect(unnamedControls(container)).toEqual([])
    // The names are the shared vocabulary, not icons read as nothing: the menu button and the expand
    // affordance are the two this shape used to hide.
    const names = rowButtons(container).map(accessibleName)
    expect(names).toContain(t('common.more_actions'))
    expect(names.some((name) => name === t('sidebar.expand') || name === t('sidebar.collapse'))).toBe(true)
    unmount()
  })

  it.each(ROWS)('$name keeps its controls out of the label button', ({ label, render }) => {
    const { container, unmount } = render()
    const control = labelButton(container, label)
    // `nested-interactive` in one line: nothing focusable may live inside the control the row is.
    expect(control).toBeDefined()
    expect(control?.querySelectorAll('button, input, select, textarea, [tabindex]').length).toBe(0)
    unmount()
  })
})
