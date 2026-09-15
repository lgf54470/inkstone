/**
 * The note-facing half of a ```excalidraw fence: the scene a body holds, and the
 * rewrite that puts a changed scene back.
 *
 * DOM-free and vendor-free on purpose — the whole file is pure text work, so it is
 * unit-testable and usable from the renderer, the preview, the full screen view and
 * the editor without pulling Excalidraw into any of their chunks.
 */
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import { applyBodyAtFence } from '../fence-edit'
import type {
  ExcalidrawFenceRef,
  ExcalidrawParseResult,
  ExcalidrawScene,
  ExcalidrawSceneAppState,
} from './types'

/** Fence languages that render as a whiteboard block. */
export const EXCALIDRAW_LANGUAGES = ['excalidraw'] as const

/** The version the standard scene format is at; written as-is so a file round-trips. */
const SCENE_VERSION = 2

/** Written into every scene a note produces, so a file copied out says where it came from. */
const SCENE_SOURCE = 'inkstone'

/**
 * The app state a note keeps: the canvas background and the palette the next shape is
 * drawn with. Deliberately not the camera (scroll, zoom) — those change on every pan
 * and would turn a look around the board into a note edit.
 */
const APP_STATE_KEYS = [
  'viewBackgroundColor',
  'gridSize',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
] as const

export function emptyScene(): ExcalidrawScene {
  return { type: 'excalidraw', version: SCENE_VERSION, source: SCENE_SOURCE, elements: [], appState: {}, files: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isElement(value: unknown): value is ExcalidrawElement {
  return isRecord(value) && typeof value.type === 'string'
}

/** Deleted elements are the library's undo history, not the drawing: they are not persisted. */
function visibleElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.filter((element) => element.isDeleted !== true)
}

function pickAppState(source: unknown): ExcalidrawSceneAppState {
  if (!isRecord(source)) return {}
  const picked: ExcalidrawSceneAppState = {}
  for (const key of APP_STATE_KEYS) {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') picked[key] = value
  }
  return picked
}

/** The app state worth keeping, whatever shape it is read from (a file, the live canvas). */
export function sceneAppState(source: unknown): ExcalidrawSceneAppState {
  return pickAppState(source)
}

function pickFiles(source: unknown): BinaryFiles {
  if (!isRecord(source)) return {}
  const files: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(source)) {
    if (isRecord(value) && typeof value.mimeType === 'string' && typeof value.dataURL === 'string') files[id] = value
  }
  return files as BinaryFiles
}

/**
 * Reads a fence body as a scene. An empty body is a blank board — the block a user
 * inserts and starts drawing in — and a bare array is read as elements, which is the
 * shape a hand-written scene most often takes. Anything else has to say which fields
 * it came with, because a body that parses into nothing would be written back as
 * nothing and the drawing would be gone.
 */
export function parseExcalidrawScene(body: string): ExcalidrawParseResult {
  const text = body.trim()
  if (!text) return { ok: true, scene: emptyScene() }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const raw = Array.isArray(parsed) ? { elements: parsed } : parsed
  if (!isRecord(raw)) return { ok: false, error: 'a scene needs a JSON object, or an array of elements' }
  const elements = raw.elements ?? []
  if (!Array.isArray(elements)) return { ok: false, error: '"elements" has to be an array' }
  if (!elements.every(isElement)) return { ok: false, error: 'every element has to carry a "type"' }
  return {
    ok: true,
    scene: {
      type: 'excalidraw',
      version: typeof raw.version === 'number' ? raw.version : SCENE_VERSION,
      source: typeof raw.source === 'string' ? raw.source : SCENE_SOURCE,
      elements: visibleElements(elements as ExcalidrawElement[]),
      appState: pickAppState(raw.appState),
      files: pickFiles(raw.files),
    },
  }
}

export function serializeExcalidrawScene(scene: ExcalidrawScene): string {
  return JSON.stringify(
    {
      type: scene.type,
      version: scene.version,
      source: scene.source,
      elements: visibleElements(scene.elements),
      appState: scene.appState,
      files: scene.files,
    },
    null,
    2,
  )
}

export function countExcalidrawElements(scene: ExcalidrawScene): number {
  return visibleElements(scene.elements).length
}

/** Puts a serialized scene into the fence it came from, or null when the fence moved. */
export function applyExcalidrawBodyAtFence(
  content: string,
  target: ExcalidrawFenceRef,
  nextBody: string,
): string | null {
  return applyBodyAtFence(content, target, nextBody, EXCALIDRAW_LANGUAGES)
}
