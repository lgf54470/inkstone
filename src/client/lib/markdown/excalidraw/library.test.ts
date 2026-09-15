import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import { initI18n } from '../../i18n'

const session = vi.hoisted(() => ({ active: 'default' }))

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  handlers: [] as ((payload: { type: string; clientId: string }) => void)[],
}))

vi.mock('../../api', () => ({
  CLIENT_ID: 'this-client',
  api: {
    boardLibrary: {
      get: mocks.get,
      save: mocks.save,
      list: mocks.list,
      remove: mocks.remove,
    },
  },
}))

vi.mock('../../db', () => ({
  createBroadcast: (onMessage: (payload: { type: string; clientId: string }) => void) => {
    mocks.handlers.push(onMessage)
    return { post: () => {}, close: () => {} }
  },
}))

/** The library-side file helpers, stubbed: parsing real files is the library's own job. */
const vendor = vi.hoisted(() => ({
  parseLibrary: vi.fn(async () => [] as unknown[]),
  serializeLibrary: vi.fn(() => '{"type":"excalidrawlib","version":2,"libraryItems":[]}'),
}))

vi.mock('./loader', () => ({ loadExcalidrawVendor: async () => vendor }))

/** The settings the boards read their library from; switching writes back into this. */
vi.mock('../../../store/session', () => ({
  useSession: {
    getState: () => ({
      settings: { preview: { boardLibrary: session.active } },
      updateSettings: (patch: { preview?: { boardLibrary?: string } }) => {
        session.active = patch.preview?.boardLibrary ?? session.active
      },
    }),
  },
}))

/** Delivers a payload the way another tab's channel would, to every listener in this one. */
function receive(payload: { type: string; clientId: string }): void {
  for (const handler of mocks.handlers) handler(payload)
}

/** A library as the endpoint hands it back. */
const stored = [{ id: 'stored', status: 'unpublished', elements: [], created: 1 }] as unknown as LibraryItems
const edited = [{ id: 'edited', status: 'unpublished', elements: [], created: 2 }] as unknown as LibraryItems
const elsewhere = [{ id: 'elsewhere', status: 'unpublished', elements: [], created: 3 }] as unknown as LibraryItems

function board() {
  const updateLibrary = vi.fn(async () => [] as unknown)
  return { api: { updateLibrary } as unknown as ExcalidrawImperativeAPI, updateLibrary }
}

function libraryAnswer(name: string, items: LibraryItems | null) {
  return { name, items: items === null ? null : JSON.stringify(items), updatedAt: 5 }
}

/**
 * Each case starts from a cold module: the store deliberately keeps its cache, its debounce
 * and its board set at module scope, so only a fresh import can prove the first read.
 */
async function store() {
  vi.resetModules()
  const library = await import('./library')
  const ui = await import('../../../store/ui')
  ui.useUi.setState({ toasts: [] })
  return { library, ui }
}

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  vi.clearAllMocks()
  session.active = 'default'
  mocks.handlers.length = 0
  mocks.get.mockImplementation(async (name: string) => libraryAnswer(name, null))
  mocks.save.mockImplementation(async (name: string, items: string) => ({ name, items, updatedAt: 9 }))
  mocks.list.mockResolvedValue({ libraries: [] })
  mocks.remove.mockResolvedValue({ removed: true })
})

describe('whiteboard library reads', () => {
  it('reads the selected library once and hands the items to every board', async () => {
    mocks.get.mockImplementation(async (name: string) => libraryAnswer(name, stored))
    const { library } = await store()
    const first = board()
    const second = board()

    const releaseFirst = library.registerBoardLibraryBoard(first.api)
    const releaseSecond = library.registerBoardLibraryBoard(second.api)

    await vi.waitFor(() => expect(library.boardLibraryItems()).toEqual(stored))
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith('default')
    expect(library.activeBoardLibraryName()).toBe('default')
    expect(first.updateLibrary).toHaveBeenCalledWith({ libraryItems: stored, merge: false })
    expect(second.updateLibrary).toHaveBeenCalledWith({ libraryItems: stored, merge: false })
    releaseFirst()
    releaseSecond()
  })
})

describe('whiteboard library refresh', () => {
  it('re-reads when another tab saved, and ignores its own broadcast', async () => {
    mocks.get
      .mockImplementationOnce(async (name: string) => libraryAnswer(name, null))
      .mockImplementationOnce(async (name: string) => libraryAnswer(name, elsewhere))
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    receive({ type: 'board-library-changed', clientId: 'this-client' })
    await Promise.resolve()
    expect(mocks.get).toHaveBeenCalledTimes(1)

    receive({ type: 'board-library-changed', clientId: 'other-tab' })
    await vi.waitFor(() => expect(library.boardLibraryItems()).toEqual(elsewhere))
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
})

describe('whiteboard library writes', () => {
  it('writes an edit through the flush, and drops content it already has', async () => {
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledWith('default', JSON.stringify(edited))
    expect(library.boardLibraryItems()).toEqual(edited)

    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })

  it('writes nothing until the selected library has been read', async () => {
    let finish = () => {}
    mocks.get.mockReturnValue(new Promise((resolve) => { finish = () => resolve(libraryAnswer('default', null)) }))
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)

    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()
    expect(mocks.save).not.toHaveBeenCalled()

    finish()
    await vi.waitFor(() => expect(library.boardLibraryItems()).toEqual([]))
    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()
    expect(mocks.save).toHaveBeenCalledWith('default', JSON.stringify(edited))
  })
})

describe('whiteboard library propagation', () => {
  it('pushes a saved library to the board that did not report it', async () => {
    const { library } = await store()
    const origin = board()
    const other = board()
    library.registerBoardLibraryBoard(origin.api)
    library.registerBoardLibraryBoard(other.api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()

    await vi.waitFor(() => expect(other.updateLibrary).toHaveBeenLastCalledWith({ libraryItems: edited, merge: false }))
  })

  it('keeps writes off when the library could not be read', async () => {
    mocks.get.mockRejectedValue(new Error('offline'))
    const { library, ui } = await store()
    library.registerBoardLibraryBoard(board().api)

    await vi.waitFor(() => expect(ui.useUi.getState().toasts.length).toBe(1))
    expect(ui.useUi.getState().toasts.map((toast) => toast.tone)).toContain('danger')

    library.noticeBoardLibraryChange(edited)
    await library.flushBoardLibrary()
    expect(mocks.save).not.toHaveBeenCalled()
  })
})

describe('whiteboard library selection', () => {
  it('points the boards at another library when one is selected', async () => {
    mocks.get.mockImplementation(async (name: string) => libraryAnswer(name, name === 'architecture' ? elsewhere : stored))
    const { library } = await store()
    const target = board()
    library.registerBoardLibraryBoard(target.api)
    await vi.waitFor(() => expect(library.boardLibraryItems()).toEqual(stored))

    await library.selectBoardLibrary('architecture')

    expect(library.activeBoardLibraryName()).toBe('architecture')
    expect(library.boardLibraryItems()).toEqual(elsewhere)
    expect(target.updateLibrary).toHaveBeenLastCalledWith({ libraryItems: elsewhere, merge: false })
  })

  it('creates a library as an empty one and selects it', async () => {
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    await library.createBoardLibrary('software architecture')

    expect(mocks.save).toHaveBeenCalledWith('software architecture', '[]')
    expect(library.activeBoardLibraryName()).toBe('software architecture')
    expect(library.boardLibraryItems()).toEqual([])
  })

})

describe('whiteboard library files', () => {
  it('adds imported items to the boards, letting the library dedupe them', async () => {
    const { library } = await store()
    const target = board()
    library.registerBoardLibraryBoard(target.api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    library.addBoardLibraryItems(elsewhere)

    expect(target.updateLibrary).toHaveBeenLastCalledWith({ libraryItems: elsewhere, merge: true })
  })

  it('reads an .excalidrawlib file through the library parser', async () => {
    vendor.parseLibrary.mockResolvedValueOnce(elsewhere as unknown as never[])
    const { library } = await store()
    const file = new File(['{"type":"excalidrawlib"}'], 'themed.excalidrawlib', { type: 'application/json' })

    expect(await library.readBoardLibraryFile(file)).toEqual(elsewhere)
    expect(vendor.parseLibrary).toHaveBeenCalledWith(file)
  })

  it('saves the active library under a name a filesystem accepts', async () => {
    session.active = 'Architecture/Logos'
    mocks.get.mockImplementation(async (name: string) => libraryAnswer(name, stored))
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)
    await vi.waitFor(() => expect(library.boardLibraryItems()).toEqual(stored))

    const file = await library.exportBoardLibraryFile()

    expect(file.filename).toBe('Architecture-Logos.excalidrawlib')
    expect(vendor.serializeLibrary).toHaveBeenCalledWith(stored)
    expect(file.text).toContain('excalidrawlib')
  })
})

describe('whiteboard library housekeeping', () => {
  it('falls back to the default library when the selected one is deleted', async () => {
    session.active = 'architecture'
    const { library } = await store()
    library.registerBoardLibraryBoard(board().api)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))

    expect(await library.deleteBoardLibrary('architecture')).toBe(true)

    expect(mocks.remove).toHaveBeenCalledWith('architecture')
    expect(library.activeBoardLibraryName()).toBe('default')
  })

  it('lists what the picker shows, always including the default library', async () => {
    mocks.list.mockResolvedValue({ libraries: [{ name: 'architecture', size: 2, updatedAt: 1 }] })
    const { library } = await store()
    expect(await library.listBoardLibraries()).toEqual([
      { name: 'default', size: 0, updatedAt: 0 },
      { name: 'architecture', size: 2, updatedAt: 1 },
    ])
  })
})
