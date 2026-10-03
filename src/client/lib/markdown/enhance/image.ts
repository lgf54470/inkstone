import { t } from '../../i18n'

// Images a widget drew for itself, or that are already inside a link or an example's
// own preview, keep their own semantics: wrapping them would either nest a control
// inside a control or break the widget.
const NOT_PROSE_IMAGES = '[data-image-zoom], a[href], pre, [data-mindmap], [data-chart], [data-mermaid], .markdown-example-preview'

// The button, not the image, is the box in flow, so these two have to be on it for the
// prose sheet to size and place a wrapped image the same way it does a bare one.
const PROPAGATED_ATTRS = ['data-image-align', 'data-image-width'] as const

/**
 * Makes a prose image an actual control: the lightbox opens on Enter or Space the way
 * it opens on a click, and Escape hands focus back to something that can hold it. The
 * image stays where it was — this only puts a button around it, so `img` styles and the
 * markdown it came from are untouched. The button takes no box of its own (content.css),
 * which is what keeps an image the size and position the stylesheet already gave it.
 */
export function wrapZoomableImages(root: HTMLElement): void {
  for (const image of [...root.querySelectorAll<HTMLImageElement>('img')]) {
    if (image.closest(NOT_PROSE_IMAGES)) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'image-zoom'
    button.dataset.imageZoom = '1'
    button.setAttribute('aria-label', t('preview.image_adjust'))
    for (const name of PROPAGATED_ATTRS) {
      const value = image.getAttribute(name)
      if (value !== null) button.setAttribute(name, value)
    }
    applyExplicitHeight(image)
    image.replaceWith(button)
    button.appendChild(image)
  }
}

/**
 * An explicit height is the one image size CSS cannot reach: the prose sheet's blanket
 * `height: auto` beats the presentational attribute, and no rule can read a length back
 * out of an attribute. So the value is applied here, at runtime, from a digit string the
 * renderer wrote — a hand-written `data-image-height` in raw HTML is ignored, not parsed.
 */
function applyExplicitHeight(image: HTMLImageElement): void {
  const height = image.dataset.imageHeight
  if (height && /^\d+$/.test(height)) image.style.height = `${height}px`
}
