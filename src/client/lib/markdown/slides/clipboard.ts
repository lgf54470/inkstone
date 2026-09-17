import { secureRandomId } from '../../id'
import type { Slide, SlideElement } from './types'

/** The marker that says the clipboard text carries deck elements rather than prose. */
export const SLIDES_CLIP_MARK = 'inkstone/slides-clip'
/** The payload shape this build writes and reads; a version it does not know is not read. */
export const SLIDES_CLIP_VERSION = 1
/** A slide's worth of elements is far below this. Anything larger is not a copy of one. */
const MAX_CLIP_TEXT = 4 * 1024 * 1024
const MAX_CLIP_ELEMENTS = 200
const MAX_CLIP_SLIDES = 50
/** A paste lands nudged, so it is visible rather than exactly under what it was copied from. */
export const PASTE_OFFSET = 20
/** What this build can carry. A kind it does not know is dropped rather than pasted blind. */
const CLIP_ELEMENT_TYPES = new Set([
  'text',
  'shape',
  'image',
  'media',
  'embed',
  'table',
  'chart',
  'code',
  'svg',
])

export interface SlidesClip {
  elements: SlideElement[]
  /** The bytes those elements point at, so a paste into another deck brings the pixels along. */
  assets: Record<string, string>
}

export interface SlidesPagesClip {
  slides: Slide[]
  assets: Record<string, string>
}

/**
 * Elements as clipboard text. Plain text rather than a private flavour on purpose: the
 * clipboard is the one place two decks can meet — another note, another tab, another window —
 * and a payload that survives the trip has to be something the OS clipboard carries.
 */
export function clipElements(elements: SlideElement[], assets?: Record<string, string>): string {
  return JSON.stringify({
    mark: SLIDES_CLIP_MARK,
    version: SLIDES_CLIP_VERSION,
    kind: 'elements',
    elements,
    assets: collectClipAssets(elements, assets),
  })
}

/**
 * The asset entries these elements use. Only the keys the elements point at travel, so a copy
 * of one picture does not drag the whole deck's table along — and a key the document does not
 * have simply does not travel.
 */
export function collectClipAssets(
  elements: SlideElement[],
  assets?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const element of elements) {
    for (const key of assetKeysOf(element)) {
      const value = assets?.[key]
      if (typeof value === 'string') out[key] = value
    }
  }
  return out
}

/**
 * Read a payload off the system clipboard. The clipboard is public: text sitting on it need not
 * have come from this app, so nothing here is trusted — a payload is rebuilt from the parts that
 * match the shape this build writes (a known marker, known element kinds, geometry that is a
 * number), and whatever does not match is dropped rather than repaired. A payload that says
 * nothing this build can paste returns null, which is what lets the caller fall through to its
 * plain-text branch.
 */
export function readClip(text: string): SlidesClip | null {
  const raw = readPayload(text, 'elements')
  if (!raw) return null
  const listed = Array.isArray(raw.elements) ? raw.elements.slice(0, MAX_CLIP_ELEMENTS) : []
  const elements = listed.filter(isClipElement)
  if (elements.length === 0) return null
  return { elements, assets: readAssetTable(raw.assets) }
}

/**
 * Pages as clipboard text, the other half of the same channel: a copy of a page has to bring
 * everything the page is — its elements, its background, its notes — or pasting it would produce
 * a page that only looks like the one it came from.
 */
export function clipSlides(slides: Slide[], assets?: Record<string, string>): string {
  return JSON.stringify({
    mark: SLIDES_CLIP_MARK,
    version: SLIDES_CLIP_VERSION,
    kind: 'slides',
    slides,
    assets: collectClipAssets(
      slides.flatMap((slide) => slide.elements),
      assets,
    ),
  })
}

export function readSlidesClip(text: string): SlidesPagesClip | null {
  const raw = readPayload(text, 'slides')
  if (!raw) return null
  const listed = Array.isArray(raw.slides) ? raw.slides.slice(0, MAX_CLIP_SLIDES) : []
  const slides = listed.map(readSlide).filter((slide): slide is Slide => slide !== null)
  if (slides.length === 0) return null
  return { slides, assets: readAssetTable(raw.assets) }
}

/**
 * The pasted pages: fresh slide and element ids (a pasted page is a new page), no `stateOf` — a
 * state becomes a normal page outside the deck it belonged to, where the page it continued does
 * not exist — and the asset table merged underneath, with references repointed.
 */
export function pasteSlides(
  clip: SlidesPagesClip,
  existingAssets?: Record<string, string>,
): { slides: Slide[]; assets: Record<string, string> } {
  const { assets, remap } = mergeClipAssets(existingAssets, clip.assets)
  const slides = clip.slides.map((slide) => {
    const copy = structuredClone(slide)
    if (copy.stateOf) delete copy.stateOf
    return {
      ...copy,
      id: `slide-${secureRandomId()}`,
      elements: rewriteAssetRefs(
        copy.elements.map((element) => ({ ...element, id: `${element.type}-${secureRandomId()}` })),
        remap,
      ),
    }
  })
  return { slides, assets }
}

/**
 * The pasted elements: fresh ids (a copy of an element is another element, not the same one
 * twice) and a nudge, with the document's asset table merged underneath them. An asset key
 * already in the target deck with DIFFERENT bytes gets a new key and the pasted elements'
 * references are repointed, so a paste can never overwrite the pixels another element draws.
 */
export function pasteClip(
  clip: SlidesClip,
  existingAssets?: Record<string, string>,
  offset = PASTE_OFFSET,
): { elements: SlideElement[]; assets: Record<string, string> } {
  const { assets, remap } = mergeClipAssets(existingAssets, clip.assets)
  const elements = clip.elements.map((element) => {
    const copy = structuredClone(element)
    return {
      ...copy,
      id: `${element.type}-${secureRandomId()}`,
      x: element.x + offset,
      y: element.y + offset,
    }
  })
  return { elements: rewriteAssetRefs(elements, remap), assets }
}

function mergeClipAssets(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string>,
): { assets: Record<string, string>; remap: Map<string, string> } {
  const assets = { ...existing }
  const remap = new Map<string, string>()
  for (const [key, value] of Object.entries(incoming)) {
    if (assets[key] === undefined || assets[key] === value) {
      assets[key] = value
      continue
    }
    const fresh = `${key}-${secureRandomId()}`
    assets[fresh] = value
    remap.set(key, fresh)
  }
  return { assets, remap }
}

function rewriteAssetRefs(elements: SlideElement[], remap: Map<string, string>): SlideElement[] {
  if (remap.size === 0) return elements
  return elements.map((element) => {
    const next = structuredClone(element)
    if (next.type === 'image' || next.type === 'media') {
      next.src = repointAsset(next.src, remap)
      if (next.type === 'media') next.poster = next.poster ? repointAsset(next.poster, remap) : next.poster
    }
    if (next.type === 'svg' && next.asset) next.asset = remap.get(next.asset) ?? next.asset
    if (next.type === 'embed' && next.view) next.view = repointAsset(next.view, remap)
    return next
  })
}

function repointAsset(value: string, remap: Map<string, string>): string {
  if (!value.startsWith('asset:')) return value
  const key = value.slice('asset:'.length)
  const fresh = remap.get(key)
  return fresh ? `asset:${fresh}` : value
}

/** The asset keys one element refers to: a clip or picture source, its poster, or an svg's own table key. */
function assetKeysOf(element: SlideElement): string[] {
  const keys: string[] = []
  if (element.type === 'image' || element.type === 'media') keys.push(...assetKeyOf(element.src))
  if (element.type === 'media') keys.push(...assetKeyOf(element.poster))
  if (element.type === 'embed') keys.push(...assetKeyOf(element.view))
  if (element.type === 'svg' && typeof element.asset === 'string') keys.push(element.asset)
  return keys
}

function assetKeyOf(value: string | undefined): string[] {
  return typeof value === 'string' && value.startsWith('asset:') ? [value.slice('asset:'.length)] : []
}

function parseRecord(text: string): Record<string, unknown> | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

/** The envelope both halves share: size ceiling, marker, version, and which kind was written. */
function readPayload(text: string, kind: 'elements' | 'slides'): Record<string, unknown> | null {
  if (!text || text.length > MAX_CLIP_TEXT) return null
  const raw = parseRecord(text)
  if (!raw || raw.mark !== SLIDES_CLIP_MARK || raw.kind !== kind) return null
  return raw
}

/**
 * One page from a payload. A page without an identity, or one whose elements were all dropped,
 * is not a page this build can paste — but a page that was blank stays blank, because an empty
 * page is something an author makes on purpose.
 */
function readSlide(value: unknown): Slide | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!Array.isArray(raw.elements)) return null
  const listed = raw.elements.slice(0, MAX_CLIP_ELEMENTS)
  const elements = listed.filter(isClipElement)
  if (listed.length > 0 && elements.length === 0) return null
  return { ...raw, id: raw.id, elements } as Slide
}

function isClipElement(value: unknown): value is SlideElement {
  if (typeof value !== 'object' || value === null) return false
  const element = value as Record<string, unknown>
  if (typeof element.type !== 'string' || !CLIP_ELEMENT_TYPES.has(element.type)) return false
  if (typeof element.id !== 'string' || !element.id) return false
  if (!(Number.isFinite(element.x) && Number.isFinite(element.y))) return false
  return Number(element.w) > 0 && Number(element.h) > 0
}

function readAssetTable(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}
