import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DropZone } from './music-transfer-dialog'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountDropZone(onFiles = vi.fn(), onChoose = vi.fn()): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(DropZone, { onFiles, onChoose }))
  })
  return container.querySelector('div') as HTMLElement
}

function dragEvent(type: string, target: EventTarget): void {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

function isOver(node: HTMLElement): boolean {
  return node.className.includes('border-[var(--accent)]')
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('DropZone drag highlight', () => {
  it('stays highlighted while the pointer crosses a child, and clears only on real leave', async () => {
    const node = await mountDropZone()
    const child = node.querySelector('p') as HTMLElement
    await act(async () => {
      dragEvent('dragenter', node)
    })
    expect(isOver(node)).toBe(true)
    await act(async () => {
      dragEvent('dragenter', child)
      dragEvent('dragleave', child)
    })
    expect(isOver(node)).toBe(true)
    await act(async () => {
      dragEvent('dragleave', node)
    })
    expect(isOver(node)).toBe(false)
  })

  it('resets the counter and hands the files over on drop', async () => {
    const onFiles = vi.fn()
    const node = await mountDropZone(onFiles)
    const child = node.querySelector('p') as HTMLElement
    await act(async () => {
      dragEvent('dragenter', node)
      dragEvent('dragenter', child)
    })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [] } })
    await act(async () => {
      node.dispatchEvent(event)
    })
    expect(onFiles).toHaveBeenCalledWith([])
    expect(isOver(node)).toBe(false)
    await act(async () => {
      dragEvent('dragleave', node)
    })
    expect(isOver(node)).toBe(false)
  })
})
