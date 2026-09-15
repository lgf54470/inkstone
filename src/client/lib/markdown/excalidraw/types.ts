/**
 * The note-facing contract of a ```excalidraw block: the scene a fence holds, the
 * handle a mounted whiteboard exposes, and the results a write back into the note
 * can report.
 *
 * The scene is the standard `.excalidraw` file shape — the same JSON excalidraw.com
 * writes — so a scene can be pasted into a fence and a fence can be copied back out
 * without a conversion step. Only the camera is ours to drop: scroll and zoom are a
 * view, and keeping them would rewrite the note on every pan (see ./body).
 */
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import type { AppLocale } from '@shared/types'

/** App state fields a note keeps, as written. Unknown fields are dropped on read. */
export interface ExcalidrawSceneAppState {
  [key: string]: unknown
}

export interface ExcalidrawScene {
  type: 'excalidraw'
  version: number
  source: string
  elements: ExcalidrawElement[]
  appState: ExcalidrawSceneAppState
  files: BinaryFiles
}

/** The fence a block mirrors: the line its opening fence sits on, and the body it held. */
export interface ExcalidrawFenceRef {
  line: number
  body: string
}

export type ExcalidrawWriteResult = 'written' | 'conflict' | 'missing'

/** Writes a serialized scene back into the note, reporting what the note allowed. */
export type ExcalidrawWriter = (ref: ExcalidrawFenceRef, nextBody: string) => ExcalidrawWriteResult

/** Where a whiteboard is drawn: inside the prose, or moved into the full screen overlay. */
export type ExcalidrawVariant = 'inline' | 'fullscreen'

export interface ExcalidrawHandle {
  /** The scene as it stands right now, including files a pasted image brought. */
  getScene(): ExcalidrawScene
  /** Loads a scene the note now holds; a no-op camera-wise, so drawing is not interrupted. */
  updateScene(scene: ExcalidrawScene): void
  scrollToContent(): void
  zoomToFit(): void
  /** Re-measures the canvas after its box changed (a pane resize, a move to the overlay). */
  refresh(): void
  focus(): void
  setTheme(dark: boolean): void
  setVariant(variant: ExcalidrawVariant): void
  exportSvg(): Promise<Blob | null>
  exportPng(): Promise<Blob | null>
  destroy(): void
}

export interface ExcalidrawCreateOptions {
  el: HTMLElement
  scene: ExcalidrawScene
  dark: boolean
  locale: AppLocale
  editable: boolean
  variant: ExcalidrawVariant
  /** Fires when the scene changed in a way worth writing back (not on every pointer move). */
  onChange: () => void
}

export type ExcalidrawParseResult =
  | { ok: true; scene: ExcalidrawScene }
  | { ok: false; error: string }

export interface ExcalidrawVendor {
  create(options: ExcalidrawCreateOptions): ExcalidrawHandle
  parse(body: string): ExcalidrawParseResult
  serialize(scene: ExcalidrawScene): string
  /** The scene as an SVG document, for surfaces that print or export their markup. */
  renderStaticSvg(scene: ExcalidrawScene, dark: boolean): Promise<string | null>
}

export type ExcalidrawVendorLoader = () => Promise<ExcalidrawVendor>
