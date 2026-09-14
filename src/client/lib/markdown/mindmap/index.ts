/**
 * Mind map blocks (```mindmap) rendered with mind-elixir.
 *
 * `body.ts` owns the note-facing format (detection, fence surgery) and is
 * dependency-free; everything that needs the library goes through
 * `loadMindmapVendor`, which imports it dynamically so a note without a mind map
 * never downloads it.
 */
export { applyBodyAtFence, detectMindmapMode, MINDMAP_LANGUAGES, normalizeEol, type MindmapFence, type MindmapMode } from './body'
export { loadMindmapVendor } from './loader'
export {
  attachMindmapToOverlay,
  captureMindmapFocus,
  destroyAllMindmaps,
  destroyMindmaps,
  detachMindmapFromOverlay,
  flushMindmaps,
  fitMindmapBlock,
  mindmapEntryForNode,
  mindmapEntryKey,
  mountMindmaps,
  retryMindmap,
  subscribeMindmaps,
  type MindmapBlockEntry,
  type MindmapMountOptions,
} from './registry'
export { applyEntryBody, flushEntry, serializeEntry, serializeEntryAs } from './write'
export { openMindmapSession, type MindmapSession } from './session'
export {
  APP_THEME_CHOICE,
  MINDMAP_THEME_ATTR,
  fenceThemeChoice,
  readFenceAnnotation,
  readThemeChoice,
  resolveThemeChoice,
  withFenceAnnotation,
  type MindmapPalette,
  type MindmapThemeChoice,
} from './theme'
export { MINDMAP_IMAGE_CLASS, renderStaticMindmapBlocks, renderStaticMindmaps, type StaticMindmapOptions } from './static'
export {
  MINDMAP_NATIVE_FULLSCREEN_SELECTOR,
  disarmNativeFullscreen,
  isMindmapWritableHere,
  markMindmapLoading,
  markMindmapReady,
  mindmapBlocks,
  mindmapBody,
  mindmapIndex,
  mindmapThemeAnnotation,
  mindmapPlaceholder,
  resetMindmapNode,
  showMindmapError,
  showMindmapSource,
  showMindmapSourceAll,
} from './view'
export type {
  MindmapCreateOptions,
  MindmapFenceRef,
  MindmapHandle,
  MindmapParsedBody,
  MindmapThemeInput,
  MindmapVendor,
  MindmapVendorLoader,
  MindmapWriter,
  MindmapWriteResult,
} from './types'
