/**
 * An account owns named whiteboard libraries, the way the public directory lists them:
 * each name is one JSON document of its own, and every board draws from the library the
 * user selected (`preview.boardLibrary`), so all notes show the same items.
 *
 * This module is the account side of that contract — the active library for the boards to
 * seed from, a debounced save on change, a cache so the boards of one client agree, and
 * the list the header's picker shows. Excalidraw hands a board's library to the host:
 * `initialData.libraryItems` seeds the sidebar and `onLibraryChange` reports edits (see
 * ./vendor).
 *
 * A failed read blocks writes on purpose: with an empty cache, the first edit would
 * replace a stored library with the one or two items this session happened to add.
 */
import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import { BOARD_LIBRARY_DEFAULT_NAME } from '@shared/constants'
import type { BoardLibrarySummary } from '@shared/types'
import { CLIENT_ID, api } from '../../api'
import { createBroadcast } from '../../db'
import { t } from '../../i18n'
import { loadExcalidrawVendor } from './loader'
import { useSession } from '../../../store/session'
import { useUi } from '../../../store/ui'

/** Long enough to batch a burst of edits, short enough to survive closing the tab. */
const SAVE_DELAY_MS = 600

/** One toast per window, so a broken endpoint does not queue one per drag. */
const FAILURE_TOAST_INTERVAL_MS = 4000

const boards = new Set<ExcalidrawImperativeAPI>()

let cache: LibraryItems | null = null
/** The library `cache` holds; the picker can point the boards elsewhere at any time. */
let loadedFor = ''
let cachedJson = ''
let loading: { name: string; promise: Promise<LibraryItems> } | null = null
let reloadQueued = false
let readFailed = false
let pending: { name: string; items: LibraryItems } | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let stopBroadcast: (() => void) | null = null
let watchesVisibility = false
let lastFailureAt = 0

/** The library the boards open, as the settings hold it. */
export function activeBoardLibraryName(): string {
  return useSession.getState().settings.preview.boardLibrary || BOARD_LIBRARY_DEFAULT_NAME
}

/** What a board seeds its sidebar with; empty until the active library has been read. */
export function boardLibraryItems(): LibraryItems {
  return loadedFor === activeBoardLibraryName() ? cache ?? [] : []
}

function reportFailure(key: 'load' | 'save'): void {
  const now = Date.now()
  if (now - lastFailureAt < FAILURE_TOAST_INTERVAL_MS) return
  lastFailureAt = now
  useUi.getState().toast({
    title: t(key === 'load' ? 'preview.excalidraw_library_load_failed' : 'preview.excalidraw_library_save_failed'),
    tone: 'danger',
  })
}

/** Hands the active library's items to every board but the one that reported them. */
function publish(name: string, items: LibraryItems, origin: ExcalidrawImperativeAPI | null): void {
  cache = items
  loadedFor = name
  cachedJson = JSON.stringify(items)
  readFailed = false
  if (name !== activeBoardLibraryName()) return
  for (const board of boards) {
    if (board === origin) continue
    board.updateLibrary({ libraryItems: items, merge: false }).catch((error: unknown) => {
      console.warn('[inkstone] whiteboard library push failed', error)
    })
  }
}

/**
 * Reads one library. A read already on its way answers for both callers, but a forced one
 * (another tab saved, the picker switched) has to happen again afterwards: the answer in
 * flight was composed before that, and showing it would leave the boards behind.
 */
async function readAccount(name: string, force: boolean): Promise<LibraryItems> {
  if (loading && loading.name === name) {
    if (force) reloadQueued = true
    return loading.promise
  }
  if (!force && cache && loadedFor === name) return cache
  const promise = api.boardLibrary
    .get(name)
    .then((snapshot) => {
      const items = snapshot.items ? (JSON.parse(snapshot.items) as LibraryItems) : []
      publish(name, items, null)
      return items
    })
    .catch((error: unknown) => {
      console.warn('[inkstone] whiteboard library load failed', error)
      // Only a read that never produced a library blocks the writes (see the header):
      // a failed refresh still has the items this client already knows.
      if (!cache) {
        readFailed = true
        reportFailure('load')
      }
      return cache ?? []
    })
    .finally(() => {
      loading = null
      if (reloadQueued) {
        reloadQueued = false
        void readAccount(activeBoardLibraryName(), true)
      }
    })
  loading = { name, promise }
  return promise
}

/**
 * Reported by every board on a library change. The library fires this for its own pushes
 * too, so identical content is dropped here instead of at the API.
 */
export function noticeBoardLibraryChange(items: LibraryItems): void {
  // Nothing is written before the active library has been read: a mounting board reports
  // its own (empty) state, and saving that over a stored library would erase it.
  const name = activeBoardLibraryName()
  if (readFailed || cache === null || loadedFor !== name || JSON.stringify(items) === cachedJson) return
  pending = { name, items }
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => {
    void flushBoardLibrary()
  }, SAVE_DELAY_MS)
}

/** Writes whatever is pending right now; the debounce and the hidden-tab path both land here. */
export async function flushBoardLibrary(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const writing = pending
  pending = null
  if (!writing || readFailed) return
  try {
    await api.boardLibrary.save(writing.name, JSON.stringify(writing.items))
    publish(writing.name, writing.items, null)
  } catch (error) {
    console.warn('[inkstone] whiteboard library save failed', error)
    reportFailure('save')
  }
}

/**
 * Adds items to the library the boards are showing, the way an import does. The library
 * merges by item id, so importing the same file twice leaves one copy of each shape, and
 * the change reaches the account through the same save path as any other edit.
 */
export function addBoardLibraryItems(items: LibraryItems): void {
  if (!items.length || cache === null) return
  for (const board of boards) {
    board.updateLibrary({ libraryItems: items, merge: true }).catch((error: unknown) => {
      console.warn('[inkstone] whiteboard library import failed', error)
      reportFailure('save')
    })
  }
}

/** The items of an `.excalidrawlib` file, read by the library's own parser (both versions). */
export async function readBoardLibraryFile(file: Blob): Promise<LibraryItems> {
  const vendor = await loadExcalidrawVendor()
  return vendor.parseLibrary(file)
}

/** The active library as a file: the text to save, and the name to save it under. */
export async function exportBoardLibraryFile(): Promise<{ filename: string; text: string }> {
  const vendor = await loadExcalidrawVendor()
  const name = activeBoardLibraryName()
  return {
    filename: `${name.replace(/[\\/:*?"<>|]/g, '-') || BOARD_LIBRARY_DEFAULT_NAME}.excalidrawlib`,
    text: vendor.serializeLibrary(boardLibraryItems()),
  }
}

/** Every library the account owns, for the picker. */
export async function listBoardLibraries(): Promise<BoardLibrarySummary[]> {
  try {
    const { libraries } = await api.boardLibrary.list()
    // The default library is always offered, saved or not: a board starts there, so the
    // picker has to be able to point back at it after switching away.
    if (libraries.some((library) => library.name === BOARD_LIBRARY_DEFAULT_NAME)) return libraries
    return [{ name: BOARD_LIBRARY_DEFAULT_NAME, size: 0, updatedAt: 0 }, ...libraries]
  } catch (error) {
    console.warn('[inkstone] whiteboard library list failed', error)
    reportFailure('load')
    return []
  }
}

/** Points the boards at another library, which is a settings change like any other. */
export async function selectBoardLibrary(name: string): Promise<void> {
  await flushBoardLibrary()
  useSession.getState().updateSettings({ preview: { boardLibrary: name } })
  await readAccount(name, true)
}

/** A new library starts empty; writing it now is what makes it show up in the picker. */
export async function createBoardLibrary(name: string): Promise<void> {
  await flushBoardLibrary()
  const snapshot = await api.boardLibrary.save(name, '[]')
  // The boards follow the active name, and publish() only pushes to them once the
  // settings point at what it is publishing — so the selection lands first, or the boards
  // would keep showing the library this one was created from.
  useSession.getState().updateSettings({ preview: { boardLibrary: snapshot.name } })
  publish(snapshot.name, [], null)
}

/** Drops a library; the boards fall back to the default one instead of an orphan name. */
export async function deleteBoardLibrary(name: string): Promise<boolean> {
  try {
    const { removed } = await api.boardLibrary.remove(name)
    if (removed && name === activeBoardLibraryName()) await selectBoardLibrary(BOARD_LIBRARY_DEFAULT_NAME)
    return removed
  } catch (error) {
    console.warn('[inkstone] whiteboard library delete failed', error)
    reportFailure('save')
    return false
  }
}

/**
 * Ties one live board to the account's libraries; the returned release runs when the
 * board's root goes away. Registering is also what triggers the first read, so a note with
 * a board never fetches a library until one is on screen.
 */
export function registerBoardLibraryBoard(target: ExcalidrawImperativeAPI): () => void {
  boards.add(target)
  watchBroadcast()
  watchVisibility()
  void readAccount(activeBoardLibraryName(), false)
  return () => {
    boards.delete(target)
  }
}

/** Another tab saved: re-read, so both tabs show the same items. */
function watchBroadcast(): void {
  stopBroadcast ??= createBroadcast((payload) => {
    if (payload.type !== 'board-library-changed' || payload.clientId === CLIENT_ID) return
    void readAccount(activeBoardLibraryName(), true)
  }).close
}

/** A tab being hidden may never come back, so the last edit is written while it can be. */
function watchVisibility(): void {
  if (watchesVisibility || typeof document === 'undefined') return
  watchesVisibility = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushBoardLibrary()
  })
}
