/**
 * What the registry keeps per block: the mounted board, the element it draws in and
 * everything the mount pass, the write-back and the full screen overlay need to act on
 * it later. It lives in its own module so those layers can share it without importing
 * each other.
 */
import type { AppLocale } from '@shared/types'
import type { ExcalidrawFenceRef, ExcalidrawHandle, ExcalidrawScene, ExcalidrawVendor, ExcalidrawVendorLoader, ExcalidrawWriter } from './types'

export interface ExcalidrawBlockEntry {
  key: string
  scope: string
  /** The note the block belongs to, so an action can rewrite it around the fence. */
  noteId: string | null
  index: number
  host: HTMLElement
  /** The body the board was last told about, so a re-render of the same scene is a no-op. */
  source: string
  scene: ExcalidrawScene | null
  editable: boolean
  owner: 'inline' | 'overlay'
  dark: boolean
  locale: AppLocale
  load: ExcalidrawVendorLoader
  vendor: ExcalidrawVendor | null
  handle: ExcalidrawHandle | null
  container: HTMLElement | null
  /** Watches the inline container so a pane resize re-measures the canvas. */
  observer: ResizeObserver | null
  ref: ExcalidrawFenceRef | null
  write: ExcalidrawWriter | null
  dirty: boolean
  timer: number | null
  /** The mount currently building this block, shared by concurrent passes. */
  pending: Promise<void> | null
}
