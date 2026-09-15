/**
 * The library picker the whiteboard block's header button (or the board's own corner
 * control) opens. An account owns named libraries (lib/markdown/excalidraw/library.ts), a
 * board draws from the selected one, and a library is also a file — so this is where the
 * boards are pointed somewhere else, where a library is created or dropped, and where one
 * is imported from or saved to an `.excalidrawlib` file.
 *
 * Both file actions go through our own picker and download rather than the library's,
 * whose file dialogs are native (File System Access) and therefore neither testable nor
 * available outside a secure context.
 *
 * It is a React overlay over the prose for the same reason the palette menu is: the
 * block's markup is re-rendered wholesale from the note, so the menu's own state has to
 * live outside it.
 */
import { useEffect, useMemo, useState } from 'react'
import { BOARD_LIBRARY_DEFAULT_NAME, LIMITS } from '@shared/constants'
import type { BoardLibrarySummary } from '@shared/types'
import { Menu, confirm, prompt, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import {
  activeBoardLibraryName,
  addBoardLibraryItems,
  createBoardLibrary,
  deleteBoardLibrary,
  exportBoardLibraryFile,
  listBoardLibraries,
  readBoardLibraryFile,
  selectBoardLibrary,
} from '../../lib/markdown/excalidraw'
import { useUi } from '../../store/ui'

/** Wide enough for a library name beside its check mark. */
const MENU_WIDTH_PX = 232

/** Long enough for the picker to be given the file the user chose. */
const LIBRARY_FILE_ACCEPT = '.excalidrawlib,application/json'

const LIBRARY_BUTTON_SELECTOR = '[data-excalidraw-library], .excalidraw-library-trigger'

/** The reserved name is shown as a label; every other name is the user's own. */
function libraryLabel(name: string): string {
  return name === BOARD_LIBRARY_DEFAULT_NAME ? t('preview.excalidraw_library_default') : name
}

export function ExcalidrawLibraryMenu({ node, onClose }: { node: HTMLElement; onClose: () => void }) {
  const [libraries, setLibraries] = useState<BoardLibrarySummary[] | null>(null)
  const active = activeBoardLibraryName()
  // The menu hangs off the control that opened it rather than off the block: the block is a
  // canvas hundreds of pixels tall, so anchoring to it would drop the menu below the
  // drawing area. The anchor is a ref-shaped object, memoized because it is rebuilt per
  // render otherwise.
  const anchor = useMemo(() => ({ current: node.querySelector<HTMLElement>(LIBRARY_BUTTON_SELECTOR) ?? node }), [node])

  useEffect(() => {
    let live = true
    void listBoardLibraries().then((list) => {
      if (live) setLibraries(list)
    })
    return () => {
      live = false
    }
  }, [])

  const items = useMemo<MenuItem[]>(
    () => libraryMenuItems(libraries, active, onClose, () => void importFromPicker()),
    [active, libraries, onClose],
  )

  return (
    <Menu
      anchor={anchor}
      open
      onClose={onClose}
      items={items}
      align='end'
      width={MENU_WIDTH_PX}
      label={t('preview.excalidraw_library')}
    />
  )
}

/** What the account owns, then what can be done to it. */
function libraryMenuItems(
  libraries: BoardLibrarySummary[] | null,
  active: string,
  onClose: () => void,
  onImport: () => void,
): MenuItem[] {
  if (!libraries) return [{ id: 'loading', label: t('preview.excalidraw_library_loading'), disabled: true }]
  return [
    ...libraries.map((library) => ({
      id: `library-${library.name}`,
      label: libraryLabel(library.name),
      checked: library.name === active,
      onSelect: () => {
        void selectBoardLibrary(library.name)
        onClose()
      },
    })),
    {
      id: 'library-import',
      label: t('preview.excalidraw_library_import'),
      separatorBefore: true,
      onSelect: onImport,
    },
    {
      id: 'library-export',
      label: t('preview.excalidraw_library_export'),
      onSelect: () => {
        void saveLibraryFile()
        onClose()
      },
    },
    {
      id: 'library-new',
      label: t('preview.excalidraw_library_new'),
      separatorBefore: true,
      onSelect: () => {
        void createFromPrompt()
        onClose()
      },
    },
    {
      id: 'library-delete',
      label: t('preview.excalidraw_library_delete'),
      tone: 'danger',
      onSelect: () => {
        void confirmDelete()
        onClose()
      },
    },
  ]
}

/**
 * A file picker created on demand and kept in the document until it answers. It cannot be
 * part of the menu: the menu closes on a pick, and an input that unmounts while the native
 * dialog is open never reports the file the user chose.
 */
function pickLibraryFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = LIBRARY_FILE_ACCEPT
    input.className = 'hidden'
    input.dataset.excalidrawLibraryFile = ''
    const settle = (file: File | null): void => {
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => settle(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => settle(null))
    document.body.append(input)
    input.click()
  })
}

/** Opens the picker, then imports whatever it answered with. */
async function importFromPicker(): Promise<void> {
  const file = await pickLibraryFile()
  if (file) await importLibraryFile(file)
}

/** Importing adds to what the boards show, which is how the library's own merge works. */
async function importLibraryFile(file: File): Promise<void> {
  try {
    const items = await readBoardLibraryFile(file)
    addBoardLibraryItems(items)
    useUi.getState().toast({
      title: t('preview.excalidraw_library_imported', { value0: items.length, value1: libraryLabel(activeBoardLibraryName()) }),
      tone: 'success',
    })
  } catch (error) {
    console.warn('[inkstone] whiteboard library import failed', error)
    useUi.getState().toast({ title: t('preview.excalidraw_library_import_failed'), tone: 'danger' })
  }
}

/** Saving is a blob download: no native dialog, and it works outside a secure context. */
async function saveLibraryFile(): Promise<void> {
  try {
    const { filename, text } = await exportBoardLibraryFile()
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('[inkstone] whiteboard library export failed', error)
    useUi.getState().toast({ title: t('preview.excalidraw_library_export_failed'), tone: 'danger' })
  }
}

/** Creation is a name to type, so it asks for one; a blank or unusable name changes nothing. */
async function createFromPrompt(): Promise<void> {
  const typed = await prompt({
    title: t('preview.excalidraw_library_new_title'),
    placeholder: t('preview.excalidraw_library_name_placeholder'),
    confirmLabel: t('preview.excalidraw_library_new_title'),
  })
  const name = typed?.trim()
  if (!name || name.length > LIMITS.boardLibraryNameMaxLength) return
  await createBoardLibrary(name)
}

async function confirmDelete(): Promise<void> {
  const name = activeBoardLibraryName()
  const agreed = await confirm({
    title: t('preview.excalidraw_library_delete_title'),
    description: t('preview.excalidraw_library_delete_message', { value0: libraryLabel(name) }),
    confirmLabel: t('preview.excalidraw_library_delete_title'),
    tone: 'danger',
  })
  if (agreed) await deleteBoardLibrary(name)
}
