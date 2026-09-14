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
  applyEntryBody,
  attachMindmapToOverlay,
  captureMindmapFocus,
  destroyAllMindmaps,
  destroyMindmaps,
  detachMindmapFromOverlay,
  flushEntry,
  flushMindmaps,
  fitMindmapBlock,
  mindmapEntryForNode,
  mindmapEntryKey,
  mountMindmaps,
  retryMindmap,
  serializeEntry,
  serializeEntryAs,
  subscribeMindmaps,
  type MindmapBlockEntry,
  type MindmapMountOptions,
} from './registry'
export { openMindmapSession, type MindmapSession } from './session'
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
  MindmapVendor,
  MindmapVendorLoader,
  MindmapWriter,
  MindmapWriteResult,
} from './types'
