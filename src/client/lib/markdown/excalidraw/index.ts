/**
 * Whiteboard blocks (```excalidraw) drawn with Excalidraw.
 *
 * `body.ts` owns the note-facing format (scene JSON, fence surgery) and is
 * dependency-free; everything that needs the library goes through
 * `loadExcalidrawVendor`, which imports it dynamically so a note without a whiteboard
 * never downloads it.
 */
export {
  applyExcalidrawBodyAtFence,
  countExcalidrawElements,
  emptyScene,
  EXCALIDRAW_LANGUAGES,
  parseExcalidrawScene,
  sceneAppState,
  serializeExcalidrawScene,
} from './body'
export { loadExcalidrawVendor } from './loader'
export {
  captureExcalidrawContextMenu,
  captureExcalidrawFocus,
  destroyAllExcalidraws,
  destroyExcalidraws,
  excalidrawEntryForNode,
  fitExcalidrawBlock,
  flushExcalidraws,
  mountExcalidraws,
  retryExcalidraw,
  subscribeExcalidraws,
  type ExcalidrawBlockEntry,
  type ExcalidrawMountOptions,
} from './registry'
export { openExcalidrawSession, type ExcalidrawSession } from './session'
export { renderStaticExcalidraws, type StaticExcalidrawOptions } from './static'
export type {
  ExcalidrawCreateOptions,
  ExcalidrawFenceRef,
  ExcalidrawHandle,
  ExcalidrawParseResult,
  ExcalidrawScene,
  ExcalidrawSceneAppState,
  ExcalidrawVariant,
  ExcalidrawVendor,
  ExcalidrawVendorLoader,
  ExcalidrawWriteResult,
  ExcalidrawWriter,
} from './types'
export {
  EXCALIDRAW_BLOCK_SELECTOR,
  EXCALIDRAW_FULLSCREEN_CLASS,
  isExcalidrawSurface,
  isExcalidrawWritableHere,
  showExcalidrawSource,
  showExcalidrawSourceAll,
} from './view'
