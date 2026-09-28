import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectEntryFiles, filesFromDirectoryPicker, filesFromDrop, supportsDirectoryPicker,
  FOLDER_DROP_MAX_DEPTH, FOLDER_DROP_MAX_FILES, type DirectoryHandleLike, type DroppedEntry,
} from './music-folder-drop'

function fileEntry(name: string): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    file: (success) => success(new File(['x'], name)),
  }
}

// The browser refuses some entries (a device node, a file it will not read); the walk has to keep
// going and count it, because a folder that stops at its first unreadable file is worse than one
// that says how many it left out.
function brokenFileEntry(): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    file: (_success, failure) => failure?.(new Error('not readable')),
  }
}

// One batch per touch, so the walk only finishes if it keeps asking until the directory is spent —
// which is what the real API requires (Chrome answers at most a hundred entries at a time).
function dirEntry(children: DroppedEntry[], batchSize = 1): DroppedEntry {
  let offset = 0
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (success) => {
        const batch = children.slice(offset, offset + batchSize)
        offset += batch.length
        success(batch)
      },
    }),
  }
}

function nest(depth: number): DroppedEntry {
  let entry = fileEntry('deep.mp3')
  for (let index = 0; index < depth; index += 1) entry = dirEntry([entry])
  return entry
}

function handle(kind: 'file' | 'directory', name: string, children: DirectoryHandleLike[] = []): DirectoryHandleLike {
  return {
    kind,
    name,
    values: () => ({
      async *[Symbol.asyncIterator]() {
        for (const child of children) yield child
      },
    }),
    getFile: async () => new File(['x'], name),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('folder drop collection (FB2-F2)', () => {
  it('walks a nested folder and reads it in batches until the directory is spent', async () => {
    const tree = dirEntry([fileEntry('a.mp3'), dirEntry([fileEntry('b.flac'), fileEntry('c.m4a')])])
    const { files, skipped } = await collectEntryFiles([tree])
    expect(files.map((file) => file.name)).toEqual(['a.mp3', 'b.flac', 'c.m4a'])
    expect(skipped).toBe(0)
  })

  it('skips what the browser will not hand over instead of failing the drop', async () => {
    const { files, skipped } = await collectEntryFiles([brokenFileEntry(), fileEntry('ok.mp3')])
    expect(files.map((file) => file.name)).toEqual(['ok.mp3'])
    expect(skipped).toBe(1)
  })

  it('descends to the depth ceiling and stops counting only past it', async () => {
    const withinCeiling = await collectEntryFiles([nest(FOLDER_DROP_MAX_DEPTH - 1)])
    expect(withinCeiling.files.map((file) => file.name)).toEqual(['deep.mp3'])
    expect(withinCeiling.skipped).toBe(0)

    const pastCeiling = await collectEntryFiles([nest(FOLDER_DROP_MAX_DEPTH + 1)])
    expect(pastCeiling.files).toEqual([])
    expect(pastCeiling.skipped).toBe(1)
  })

  it('stops at the file ceiling and counts the rest', async () => {
    const many = Array.from({ length: FOLDER_DROP_MAX_FILES + 3 }, (_, index) => fileEntry(`s${index}.mp3`))
    const { files, skipped } = await collectEntryFiles([dirEntry(many, 16)])
    expect(files).toHaveLength(FOLDER_DROP_MAX_FILES)
    expect(skipped).toBe(3)
  })

  it('falls back to the plain file list when the browser has no entry API', async () => {
    const dropped = await filesFromDrop({ files: [new File(['x'], 'a.mp3')] } as unknown as DataTransfer)
    expect(dropped.files.map((file) => file.name)).toEqual(['a.mp3'])
    expect(dropped.skipped).toBe(0)
  })

  it('reads folders out of a drop and leaves dragged text alone', async () => {
    const dataTransfer = {
      files: [new File(['x'], 'a.mp3')],
      items: [
        { kind: 'string', webkitGetAsEntry: () => null },
        { kind: 'file', webkitGetAsEntry: () => dirEntry([fileEntry('inside.mp3')]) },
      ],
    } as unknown as DataTransfer
    const { files } = await filesFromDrop(dataTransfer)
    expect(files.map((file) => file.name)).toEqual(['inside.mp3'])
  })
})

describe('folder picker (FB2-F2)', () => {
  it('is offered only where the browser has one', () => {
    expect(supportsDirectoryPicker()).toBe(false)
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    expect(supportsDirectoryPicker()).toBe(true)
  })

  it('walks the picked handle under the same ceilings as a drop', async () => {
    const picked = handle('directory', 'Music', [
      handle('file', 'a.mp3'),
      handle('directory', 'Album', [handle('file', 'b.flac')]),
    ])
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => picked))
    const collected = await filesFromDirectoryPicker()
    expect(collected?.files.map((file) => file.name)).toEqual(['a.mp3', 'b.flac'])
  })

  it('treats a closed picker as nothing to upload rather than a failure', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }))
    expect(await filesFromDirectoryPicker()).toBeNull()
  })

  it('answers null instead of throwing when the picker itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => {
      throw new Error('no such folder')
    }))
    expect(await filesFromDirectoryPicker()).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
