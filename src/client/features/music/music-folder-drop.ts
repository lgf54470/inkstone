// FB2-F2: folders used to arrive through `<input webkitdirectory>`, and that attribute is what makes
// Chrome put up its own "upload these files to this site?" confirmation — a browser dialog the app
// cannot style, localize or test, in front of a gesture that was already an explicit choice. Walking
// the dropped entries here raises no dialog at all, and the same walk answers the standard directory
// picker where the browser has one.
//
// The two ceilings are not about trust: a dropped folder can be a home directory, and an unbounded
// walk would read it all before the reader sees a single upload row. What the ceilings leave out is
// counted and reported rather than dropped in silence.
export const FOLDER_DROP_MAX_DEPTH = 8
export const FOLDER_DROP_MAX_FILES = 500

/** The slice of the `FileSystemEntry` API this walk uses. Tests fake it; the browser is the source. */
export interface DroppedEntry {
  isFile: boolean
  isDirectory: boolean
  file?: (success: (file: File) => void, failure?: (error: unknown) => void) => void
  createReader?: () => {
    readEntries: (success: (entries: DroppedEntry[]) => void, failure?: (error: unknown) => void) => void
  }
}

/** The slice of the `FileSystemDirectoryHandle` API the picker path uses. */
export interface DirectoryHandleLike {
  kind: 'file' | 'directory'
  name: string
  values(): AsyncIterable<DirectoryHandleLike>
  getFile(): Promise<File>
}

export interface CollectedFiles {
  files: File[]
  /** Entries the ceilings or the browser left out, so a surface can say so instead of looking empty. */
  skipped: number
}

// A drag carries items of several kinds; only the file ones have a filesystem entry behind them, and
// dragged text has none at all. An empty answer means "no entry API here", which is the fallback.
function entriesFromDataTransfer(dataTransfer: DataTransfer | null): DroppedEntry[] | null {
  const items = dataTransfer?.items
  if (!items?.length) return null
  const entries: DroppedEntry[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  return entries.length ? entries : null
}

export async function filesFromDrop(dataTransfer: DataTransfer | null): Promise<CollectedFiles> {
  const entries = entriesFromDataTransfer(dataTransfer)
  if (entries) return collectEntryFiles(entries)
  return { files: [...(dataTransfer?.files ?? [])], skipped: 0 }
}

export async function collectEntryFiles(entries: readonly DroppedEntry[]): Promise<CollectedFiles> {
  const files: File[] = []
  let skipped = 0
  const visit = async (entry: DroppedEntry, depth: number): Promise<void> => {
    if (files.length >= FOLDER_DROP_MAX_FILES || depth > FOLDER_DROP_MAX_DEPTH) {
      skipped += 1
      return
    }
    if (entry.isFile) {
      const file = await readEntryFile(entry)
      if (file) files.push(file)
      else skipped += 1
      return
    }
    if (!entry.isDirectory) {
      skipped += 1
      return
    }
    for (const child of await readDirectory(entry)) await visit(child, depth + 1)
  }
  for (const entry of entries) await visit(entry, 0)
  return { files, skipped }
}

function readEntryFile(entry: DroppedEntry): Promise<File | null> {
  if (!entry.file) return Promise.resolve(null)
  return new Promise((resolve) => {
    // A file the browser will not hand over is skipped, never fatal.
    entry.file!((file) => resolve(file), () => resolve(null))
  })
}

// `readEntries` answers in batches — Chrome caps it at a hundred — so one call is not the whole
// directory and the loop is what makes the answer complete.
async function readDirectory(entry: DroppedEntry): Promise<DroppedEntry[]> {
  const reader = entry.createReader?.()
  if (!reader) return []
  const found: DroppedEntry[] = []
  while (found.length < FOLDER_DROP_MAX_FILES) {
    const batch = await new Promise<DroppedEntry[]>((resolve) => {
      reader.readEntries((entries) => resolve(entries), () => resolve([]))
    })
    if (!batch.length) break
    found.push(...batch)
  }
  return found
}

// The browser's own directory picker is not in the DOM types yet, so one narrow window type carries
// it rather than a cast at every use site.
type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }

export function supportsDirectoryPicker(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

// The picked handle is walked through the same ceilings as a drop, so a folder behaves the same
// however it arrives. A closed picker is the reader changing their mind, not a failure.
export async function filesFromDirectoryPicker(): Promise<CollectedFiles | null> {
  const pick = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!pick) return null
  try {
    return await collectEntryFiles([handleAsEntry(await pick())])
  } catch (error) {
    if (isAbort(error)) return null
    console.warn('[inkstone] music folder picker failed:', error)
    return null
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

// One traversal for both doors: the handle is adapted into the entry shape the walk already speaks,
// so the depth and count ceilings cannot drift between a drop and a pick.
function handleAsEntry(handle: DirectoryHandleLike): DroppedEntry {
  return {
    isFile: handle.kind === 'file',
    isDirectory: handle.kind === 'directory',
    file: (success, failure) => {
      handle.getFile().then(success, failure ?? (() => {}))
    },
    createReader: () => {
      let delivered = false
      return {
        readEntries: (success, failure) => {
          if (delivered) {
            success([])
            return
          }
          delivered = true
          readHandleEntries(handle).then(success, failure ?? (() => success([])))
        },
      }
    },
  }
}

async function readHandleEntries(handle: DirectoryHandleLike): Promise<DroppedEntry[]> {
  const entries: DroppedEntry[] = []
  for await (const child of handle.values()) {
    entries.push(handleAsEntry(child))
    if (entries.length >= FOLDER_DROP_MAX_FILES) break
  }
  return entries
}
