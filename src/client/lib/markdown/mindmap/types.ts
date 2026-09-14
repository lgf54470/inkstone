import type { AppLocale } from '@shared/types'
import type { MindmapMode } from './body'

/**
 * The narrow surface the rest of the app talks to. mind-elixir is wrapped
 * behind these interfaces (`./vendor`) so the registry, the full screen view
 * and the static snapshot path never import the library directly — and so unit
 * tests can drive them with a stub vendor instead of a real instance.
 */
export interface MindmapHandle {
  getData(): unknown
  refresh(data: unknown): void
  /**
   * Switches the drawing's own palette. The library bakes a theme into the
   * element it draws in (the colour variables are written as inline styles, and
   * the branch palette is painted into the connectors when they are drawn), so a
   * live instance has to be told about a theme change; the app's theme is not
   * something the map picks up on its own.
   */
  applyTheme(dark: boolean): void
  toCenter(): void
  layout(): void
  scaleFit(): void
  /** Puts DOM focus on the map's own keyboard surface, so its shortcuts fire. */
  focus(): void
  undo(): void
  redo(): void
  clearHistory(): void
  destroy(): void
  /** SVG snapshot used by the share page, slides, HTML/PDF export and the export menu. */
  exportSvg(): Promise<Blob>
  exportPng(): Promise<Blob | null>
}

export interface MindmapCreateOptions {
  el: HTMLElement
  data: unknown
  editable: boolean
  dark: boolean
  locale: AppLocale
  newTopicName: string
  /**
   * Inline blocks sit in the scrolling preview, so plain wheel keeps scrolling
   * the note and only Ctrl/⌘ + wheel zooms; the full screen map owns its viewport
   * and gets the library's default pan/zoom wheel handling.
   */
  modifierWheelZoom: boolean
  onOperation: () => void
  onEditingChange: (editing: boolean) => void
}

export type MindmapParseResult =
  | { ok: true; data: unknown; extra: Record<string, unknown> }
  | { ok: false; error: string }

export interface MindmapVendor {
  create(options: MindmapCreateOptions): MindmapHandle
  parse(body: string, mode: MindmapMode, fallbackTitle: string): MindmapParseResult
  serialize(data: unknown, mode: MindmapMode, extra: Record<string, unknown>): string
}

export type MindmapVendorLoader = () => Promise<MindmapVendor>

/** Where a block's body lives in the note, as reported by the renderer. */
export interface MindmapFenceRef {
  line: number
  body: string
}

export type MindmapWriteResult = 'written' | 'moved' | 'conflict' | 'missing'

/** Writes a new fence body back into the note; see features/preview/mindmap-sync.ts. */
export type MindmapWriter = (ref: MindmapFenceRef, nextBody: string) => MindmapWriteResult
