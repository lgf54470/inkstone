import { t } from '../../lib/i18n'
import { IMAGE_WIDTH_SNAP_STEPS, isImageAlign, type ImageAttrs } from '../../lib/markdown/renderer'
import { imageRefOf } from './image-source'
import { writeImageAttrs } from './image-sync'

export interface ImageEditorApi {
  noteId: () => string | null
  preview: (src: string, alt: string) => void
  toast: (options: { title: string, tone?: 'default' | 'success' | 'warning' | 'danger' }) => void
}

const TOP_OF_SCALE = IMAGE_WIDTH_SNAP_STEPS[IMAGE_WIDTH_SNAP_STEPS.length - 1]

const ALIGNMENTS = [
  ['left', 'preview.image_align_left'],
  ['center', 'preview.image_align_center'],
  ['right', 'preview.image_align_right'],
  ['float-left', 'preview.image_align_float_left'],
  ['float-right', 'preview.image_align_float_right'],
] as const

type ImageFlag = 'border' | 'shadow' | 'radius' | 'bare'

const FLAGS = [
  ['border', 'preview.image_border'],
  ['shadow', 'preview.image_shadow'],
  ['radius', 'preview.image_radius'],
  ['bare', 'preview.image_bare_frame'],
] as const

interface Selection {
  key: string
  host: HTMLElement
  image: HTMLElement
  api: ImageEditorApi
}

let selection: Selection | null = null

// A write replaces the rendered node, and the browser reports that as a focus loss with nowhere to
// go — the very event a click elsewhere produces. The one focusout after our own write is ignored,
// until the re-render has had its chance to put the controls back; the timer covers the write that
// changed nothing and therefore never re-rendered anything.
const REMOUNT_WINDOW_MS = 1500

let awaitingRemount: ReturnType<typeof setTimeout> | null = null

// Escape means "put the controls away", and focus is what brings them up — so the image that was
// just dismissed has to be remembered until the pointer or the tab order asks for it again.
let dismissedKey: string | null = null

const editorApis = new WeakMap<Element, ImageEditorApi>()

export function registerImageEditorApi(root: HTMLElement, api: ImageEditorApi): void {
  editorApis.set(root, api)
}

function apiFor(image: HTMLElement): ImageEditorApi | null {
  const root = image.closest('.ink-prose')
  return root ? editorApis.get(root) ?? null : null
}

function keyOf(image: HTMLElement): string | null {
  const ref = imageRefOf(image)
  return ref ? `${ref.line}:${ref.index}:${ref.src}` : null
}

/**
 * The state as the note carries it, read back off the rendered image. The renderer is the only
 * writer of these attributes, so a value outside them is not a state the editor should offer.
 */
export function imageAttrsOf(node: HTMLElement): ImageAttrs {
  const attrs: ImageAttrs = {}
  const percent = Number(node.dataset.imageWidth)
  const pixels = Number(node.getAttribute('width'))
  const height = Number(node.dataset.imageHeight)
  if (Number.isInteger(percent) && percent > 0) attrs.widthPct = percent
  if (Number.isInteger(pixels) && pixels > 0) attrs.widthPx = pixels
  if (Number.isInteger(height) && height > 0) attrs.heightPx = height
  const align = node.dataset.imageAlign ?? ''
  if (isImageAlign(align)) attrs.align = align
  for (const [flag] of FLAGS) {
    if (flag === 'bare') attrs.bare = node.dataset.imageFrame === 'none' || undefined
    else if (node.dataset[`image${flag[0]!.toUpperCase()}${flag.slice(1)}` as 'imageBorder']) attrs[flag] = true
  }
  return attrs
}

function button(label: string, action: string, pressed: boolean): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = 'image-editor-btn'
  node.dataset.imageAction = action
  node.textContent = label
  node.setAttribute('aria-pressed', String(pressed))
  return node
}

function separator(): HTMLElement {
  const line = document.createElement('span')
  line.className = 'image-editor-sep'
  line.setAttribute('aria-hidden', 'true')
  return line
}

function buildToolbar(attrs: ImageAttrs): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'image-editor'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', t('preview.image_controls'))
  for (const [align, key] of ALIGNMENTS) bar.append(button(t(key), `align:${align}`, attrs.align === align))
  bar.append(separator())
  for (const [flag, key] of FLAGS) bar.append(button(t(key), `flag:${flag}`, attrs[flag] === true))
  bar.append(separator())
  bar.append(button(t('preview.image_preview'), 'preview', false))
  bar.append(button(t('preview.image_reset_width'), 'reset', false))
  return bar
}

function buildHandle(attrs: ImageAttrs): HTMLElement {
  const handle = document.createElement('div')
  handle.className = 'image-resize-handle'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-label', t('preview.image_resize_width'))
  handle.setAttribute('aria-orientation', 'horizontal')
  handle.setAttribute('tabindex', '0')
  applyHandleValue(handle, attrs)
  return handle
}

function applyHandleValue(handle: HTMLElement, attrs: ImageAttrs): void {
  const percent = widthPercent(attrs)
  handle.setAttribute('aria-valuenow', String(percent))
  handle.setAttribute('aria-valuemin', String(IMAGE_WIDTH_SNAP_STEPS[0]))
  handle.setAttribute('aria-valuemax', String(TOP_OF_SCALE))
  handle.setAttribute('aria-valuetext', `${percent}%`)
}

/** An image with no recorded width fills its column, which is the top of the scale. */
function widthPercent(attrs: ImageAttrs): number {
  return attrs.widthPct ?? TOP_OF_SCALE
}

function nearestStep(percent: number): number {
  return IMAGE_WIDTH_SNAP_STEPS.reduce((best, step) =>
    Math.abs(step - percent) < Math.abs(best - percent) ? step : best, IMAGE_WIDTH_SNAP_STEPS[0])
}

/** The column the image is sized against: the box it sits in, not the image itself. */
function columnWidthOf(image: HTMLElement): number {
  return image.closest<HTMLElement>('p, li, td')?.clientWidth || image.offsetWidth
}

function stepWidth(image: HTMLElement, percent: number): void {
  const width = `${percent}%`
  image.style.width = width
  image.style.maxWidth = 'none'
  image.closest<HTMLElement>('.image-zoom')?.style.setProperty('width', width)
}

function clearSteppedWidth(image: HTMLElement): void {
  image.style.removeProperty('width')
  image.style.removeProperty('max-width')
  image.closest<HTMLElement>('.image-zoom')?.style.removeProperty('width')
}

function write(image: HTMLElement, api: ImageEditorApi, attrs: ImageAttrs): void {
  const ref = imageRefOf(image)
  if (!ref) return
  if (writeImageAttrs(api.noteId(), ref, () => attrs) === 'written') expectRemount()
  else api.toast({ title: t('preview.image_source_moved'), tone: 'warning' })
}

function expectRemount(): void {
  if (awaitingRemount !== null) clearTimeout(awaitingRemount)
  awaitingRemount = setTimeout(() => { awaitingRemount = null }, REMOUNT_WINDOW_MS)
}

function handleToolbarClick(image: HTMLElement, api: ImageEditorApi, event: Event): void {
  const trigger = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-image-action]')
  if (!trigger) return
  const [kind, value] = trigger.dataset.imageAction!.split(':')
  const attrs = imageAttrsOf(image)
  if (kind === 'preview') {
    // The lightbox hands focus back to whatever held it when it opened. That should be the picture
    // the reader was on, not this button, which the next write tears down.
    focusableOf(image).focus()
    api.preview(image.getAttribute('src') ?? '', image.getAttribute('alt') ?? '')
  }
  else if (kind === 'reset') write(image, api, { ...attrs, widthPct: undefined, widthPx: undefined })
  else if (kind === 'align') write(image, api, { ...attrs, align: attrs.align === value ? undefined : value as ImageAttrs['align'] })
  else write(image, api, { ...attrs, [value as ImageFlag]: attrs[value as ImageFlag] === true ? undefined : true })
}

function handleKeyDown(image: HTMLElement, api: ImageEditorApi, handle: HTMLElement, event: KeyboardEvent): void {
  const attrs = imageAttrsOf(image)
  const current = widthPercent(attrs)
  const step = (IMAGE_WIDTH_SNAP_STEPS as readonly number[]).indexOf(current)
  const next = keyToStep(event.key, step)
  if (next === null || next === current) return
  event.preventDefault()
  write(image, api, { ...attrs, widthPct: next, widthPx: undefined })
  applyHandleValue(handle, { widthPct: next })
}

function keyToStep(key: string, step: number): number | null {
  const last = IMAGE_WIDTH_SNAP_STEPS.length - 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return IMAGE_WIDTH_SNAP_STEPS[Math.min(step + 1, last)]
  if (key === 'ArrowLeft' || key === 'ArrowDown') return IMAGE_WIDTH_SNAP_STEPS[Math.max(step - 1, 0)]
  if (key === 'Home') return IMAGE_WIDTH_SNAP_STEPS[0]
  if (key === 'End') return IMAGE_WIDTH_SNAP_STEPS[last]
  return null
}

/**
 * A drag that cannot measure its column does not write: a percent of an unknown width is a guess
 * at the note's text, and the note is what the user reads.
 *
 * One drag, one write. The pointer path only moves the box on screen; the note is touched once,
 * when the pointer is released, so a drag costs one undo step rather than one per pixel.
 */
function beginDrag(image: HTMLElement, api: ImageEditorApi, handle: HTMLElement, event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0) return
  event.preventDefault()
  const column = columnWidthOf(image)
  if (!(column > 0)) return
  const drag = {
    start: image.getBoundingClientRect().width,
    column,
    attrs: imageAttrsOf(image),
    percent: widthPercent(imageAttrsOf(image)),
  }
  handle.setPointerCapture(event.pointerId)
  document.body.classList.add('image-resizing')
  const onMove = (move: PointerEvent) => {
    drag.percent = nearestStep(dragPercent(drag, move.clientX - event.clientX))
    stepWidth(image, drag.percent)
    applyHandleValue(handle, { widthPct: drag.percent })
  }
  const onUp = () => {
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      handle.removeEventListener(type, onUp)
    }
    handle.removeEventListener('pointermove', onMove)
    document.body.classList.remove('image-resizing')
    clearSteppedWidth(image)
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
    write(image, api, { ...drag.attrs, widthPct: drag.percent, widthPx: undefined })
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) handle.addEventListener(type, onUp)
  handle.addEventListener('pointermove', onMove)
}

/**
 * How wide the image would be, as a share of its column. A centered image grows twice as fast as
 * the pointer, because both of its edges move; a right-aligned one shrinks as the pointer goes right.
 */
function dragPercent(drag: { start: number; column: number; attrs: ImageAttrs }, delta: number): number {
  const align = drag.attrs.align
  const sign = align === 'right' || align === 'float-right' ? -1 : 1
  const factor = align === 'center' ? 2 : 1
  const wanted = drag.start + delta * sign * factor
  return Math.min(100, Math.max(5, (wanted / drag.column) * 100))
}

export function clearImageEditor(): void {
  for (const node of document.querySelectorAll('.image-editor, .image-resize-handle')) node.remove()
  document.querySelector('.image-editor-host')?.classList.remove('image-editor-host')
  selection = null
  dismissedKey = null
}

/** The focusable half of a rendered image: the zoom button when the note preview wrapped it. */
function focusableOf(image: HTMLElement): HTMLElement {
  return image.closest<HTMLElement>('[data-image-zoom]') ?? image
}

function attach(image: HTMLElement, host: HTMLElement, api: ImageEditorApi, focus: boolean): void {
  clearImageEditor()
  const attrs = imageAttrsOf(image)
  const toolbar = buildToolbar(attrs)
  const handle = buildHandle(attrs)
  selection = { key: keyOf(image) ?? '', host, image, api }
  host.classList.add('image-editor-host')
  host.append(toolbar, handle)
  position(image, toolbar, handle)
  toolbar.addEventListener('click', (event) => handleToolbarClick(image, api, event))
  handle.addEventListener('pointerdown', (event) => beginDrag(image, api, handle, event as PointerEvent))
  handle.addEventListener('keydown', (event) => handleKeyDown(image, api, handle, event))
  handle.addEventListener('dblclick', () => write(image, api, { ...attrs, widthPct: undefined, widthPx: undefined }))
  if (focus) focusableOf(image).focus({ preventScroll: true })
}

/** The overlay sits against the image's own box, in the coordinates of the block that holds it. */
function position(image: HTMLElement, toolbar: HTMLElement, handle: HTMLElement): void {
  let left = 0
  let top = 0
  for (let node: HTMLElement | null = image; node && node !== selection?.host; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft
    top += node.offsetTop
  }
  const below = `${top + image.offsetHeight}px`
  toolbar.style.left = `${left}px`
  toolbar.style.top = below
  handle.style.left = `${left + image.offsetWidth}px`
  handle.style.top = below
}

/** The image the editor can take, or null when the node is not one the note drew. */
function editableImage(node: EventTarget | null | undefined): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null
  const image = node.matches('img') ? node : node.querySelector('img')
  if (!image?.dataset.imageLine || !apiFor(image)) return null
  return image.closest('.note-embed-body') ? null : image
}

/**
 * Reveals the controls for an image. Focus is what triggers it — a pointer click and a Tab both
 * land there — so the keyboard path and the pointer path meet at the same control, and the image
 * itself keeps its own activation for the toolbar that opens.
 */
export function handleImageFocusIn(event: FocusEvent): void {
  const image = editableImage(event.target)
  const host = image?.closest<HTMLElement>('p, li, td')
  const api = image ? apiFor(image) : null
  if (!image || !host || !api) return
  const key = keyOf(image)
  if (selection?.key === key) {
    acceptFocusOut()
    return
  }
  // The focus that Escape hands back is the one dismissal this covers; the next ask is a real one.
  if (dismissedKey === key) {
    dismissedKey = null
    return
  }
  attach(image, host, api, false)
}

export function handleImageFocusOut(event: FocusEvent): void {
  if (!selection) return
  if (awaitingRemount !== null) return
  const next = event.relatedTarget
  if (next instanceof Node && selection.host.contains(next)) return
  clearImageEditor()
}

/**
 * A click on a prose image selects it instead of opening the lightbox: the toolbar carries the
 * preview, so the control that reveals the handles never gets in the way of reading the picture.
 */
export function selectImageFromClick(image: HTMLImageElement): boolean {
  acceptFocusOut()
  const api = apiFor(image)
  const host = image.closest<HTMLElement>('p, li, td')
  if (!api || !host || !image.dataset.imageLine) return false
  if (selection?.key !== keyOf(image)) attach(image, host, api, true)
  return true
}

/** A deliberate click or key press settles any pending re-render window: the next focusout is the user's. */
function acceptFocusOut(): void {
  if (awaitingRemount === null) return
  clearTimeout(awaitingRemount)
  awaitingRemount = null
}

/** Escape closes the image controls and hands focus back to the image they belong to. */
export function closeImageEditorFromEvent(target: HTMLElement): boolean {
  if (!selection || !selection.host.contains(target)) return false
  const { image, key } = selection
  clearImageEditor()
  dismissedKey = key
  focusableOf(image).focus({ preventScroll: true })
  return true
}

/**
 * Re-attaches the overlay after the preview re-rendered, which is what writing the image's own
 * attributes causes. The key is the line, the number on that line and the src — none of which a
 * style change touches — so the toolbar survives the edit that moved the note.
 */
export function mountImageEditor(root: HTMLElement): void {
  if (awaitingRemount !== null) {
    clearTimeout(awaitingRemount)
    awaitingRemount = null
  }
  // A note that redrew without a selection left behind has edited since the dismissal, which is a
  // new ask; the image the user pressed Escape on is no longer the one under their cursor.
  if (!selection) {
    dismissedKey = null
    return
  }
  const image = [...root.querySelectorAll<HTMLElement>('img[data-image-line]')].find((node) => keyOf(node) === selection?.key)
  const host = image?.closest<HTMLElement>('p, li, td')
  if (!image || !host) {
    clearImageEditor()
    return
  }
  // Focus fell out when the rendered node was replaced; it goes back to the image, not to the body.
  const lostFocus = document.activeElement === null || document.activeElement === document.body
  attach(image, host, selection.api, lostFocus)
}
