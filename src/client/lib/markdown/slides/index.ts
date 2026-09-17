export {
  BENTO_SLIDES_LANGUAGES,
  detectSlidesMode,
  parseSlidesBody,
  serializeSlides,
  applySlidesBodyAtFence,
  slidesFenceRange,
} from './body'

export { parseSlidesOutline, serializeSlidesOutline } from './outline'

export { SLIDE_THEME_PRESETS, getAdaptiveSlideTheme } from './colors'

export {
  SLIDES_BLOCK_SELECTOR,
  SLIDES_PLACEHOLDER_SELECTOR,
  SLIDES_CANVAS_SELECTOR,
  SLIDES_CANVAS_CLASS,
  SLIDES_FULLSCREEN_CLASS,
  createSlidesCanvas,
  decorateSlidesControls,
  slidesBlocks,
  slidesBody,
  slidesIndex,
  slidesPlaceholder,
  slidesFenceRef,
  isSlidesWritableHere,
  markSlidesLoading,
  markSlidesReady,
  showSlidesError,
} from './view'

export {
  mountBentoSlides,
  updateSlidesData,
  subscribeSlides,
  flushBentoSlides,
  destroyBentoSlides,
  type SlidesMountOptions,
} from './registry'

export {
  openSlidesSession,
  type SlidesSession,
} from './session'

export { SlidesFullscreen, SlidesRoot, SlidesPresenter } from './ui'

export type {
  BentoDoc,
  Slide,
  SlideElement,
  SlideTransitionKind,
  SlidesFenceRef,
  SlidesMode,
  SlidesParseResult,
  SlidesTheme,
  SlidesWriteResult,
  SlidesWriter,
  TextElement,
  ShapeElement,
  ImageElement,
  TableElement,
  ChartElement,
  CodeElement,
} from './types'
