import { t } from '../../i18n'

// Images a widget drew for itself, or that are already inside a link or an example's
// own preview, keep their own semantics: wrapping them would either nest a control
// inside a control or break the widget.
const NOT_PROSE_IMAGES = '[data-image-zoom], a[href], pre, [data-mindmap], [data-chart], [data-mermaid], .markdown-example-preview'

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
    button.setAttribute('aria-label', t('preview.image_preview'))
    image.replaceWith(button)
    button.appendChild(image)
  }
}
