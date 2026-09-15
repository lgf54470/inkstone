/**
 * The only module that touches Excalidraw (MIT, official React component). It is
 * reached exclusively through a dynamic import (see ./loader), so the library, its
 * stylesheet and its fonts stay in an async chunk and never reach the first screen.
 *
 * Excalidraw is a React component rather than a command-driven library, so this file
 * gives each block its own React root: the root renders the board into the element the
 * registry owns, and later prop changes (theme, variant, read-only) are applied by
 * rendering into that same root — which reconciles the tree instead of remounting it,
 * so the camera, the selection and the undo stack survive. Everything above this file
 * sees only ./types: a handle with the operations a block needs.
 */
import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  getSceneVersion,
  loadLibraryFromBlob,
  restoreElements,
  serializeLibraryAsJSON,
} from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { AppLocale } from '@shared/types'
import { parseExcalidrawScene, sceneAppState, serializeExcalidrawScene } from './body'
import { boardLibraryItems, noticeBoardLibraryChange, registerBoardLibraryBoard } from './library'
import type {
  ExcalidrawCreateOptions,
  ExcalidrawHandle,
  ExcalidrawScene,
  ExcalidrawVendor,
} from './types'

const EXPORT_PADDING = 12

/** Canvas backgrounds for a still picture of a board that names none of its own. */
const LIGHT_BACKGROUND = '#ffffff'
const DARK_BACKGROUND = '#121212'

/** Everything the root renders from; mutated in place so a re-render keeps the board. */
interface BoardModel {
  scene: ExcalidrawScene
  dark: boolean
  locale: AppLocale
  editable: boolean
  variant: 'inline' | 'fullscreen'
  /** Fingerprint of the scene as last seen, so a look around does not count as a change. */
  seen: string
  destroyed: boolean
}

/**
 * Keyboard shortcuts stay bound to the board's own element (the library's default), so
 * a board inside a note never swallows the editor's keys — a pointer interaction hands
 * it the focus explicitly (see ./registry).
 */
function Board({ model, onApi, onChange }: {
  model: BoardModel
  onApi: (api: ExcalidrawImperativeAPI) => void
  onChange: (elements: readonly { version?: number }[], appState: unknown) => void
}) {
  // The library follows the account rather than the note (see ./library): the sidebar is
  // seeded from the shared cache, changes are reported back, and the board joins the set
  // the store pushes to when another board (or tab) saves. The library hands over its API
  // while its own tree is mounting, so the registration rides on that callback and is
  // released by the effect below.
  const library = useRef<{ release: (() => void) | null }>({ release: null })
  useEffect(() => () => library.current.release?.(), [])
  return (
    <Excalidraw
      initialData={{ elements: model.scene.elements, files: model.scene.files, appState: backgroundOf(model.scene), libraryItems: boardLibraryItems(), scrollToContent: true }}
      excalidrawAPI={(api) => {
        onApi(api)
        library.current.release = registerBoardLibraryBoard(api)
      }}
      onLibraryChange={(items) => noticeBoardLibraryChange(items)}
      onChange={(elements, appState) => onChange(elements, appState)}
      theme={model.dark ? 'dark' : 'light'}
      langCode={model.locale}
      viewModeEnabled={!model.editable}
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: model.editable,
          clearCanvas: model.editable,
          export: {},
          // Opening a file replaces the whole scene, so it stays out of the narrow
          // inline block where it is one stray click away.
          loadScene: model.editable && model.variant === 'fullscreen',
          saveToActiveFile: false,
          toggleTheme: false,
          saveAsImage: true,
        },
        tools: { image: model.editable },
      }}
    />
  )
}

/**
 * The canvas background is the one app state field handed back to the library: it is
 * plain `string`, so it needs no cast, while the toolbar's `currentItem*` unions (fill
 * style, arrowheads, alignment) cannot be validated here without duplicating the
 * library's own reader. Those are still persisted in the note, so a scene copied out to
 * excalidraw.com keeps them.
 */
function backgroundOf(scene: ExcalidrawScene): { viewBackgroundColor: string } | undefined {
  const background = scene.appState.viewBackgroundColor
  return typeof background === 'string' ? { viewBackgroundColor: background } : undefined
}

/** Panning, selecting and hovering must not look like a change worth writing to the note. */
function fingerprint(elements: readonly { version?: number }[], appState: unknown): string {
  return `${getSceneVersion(elements as never)}|${JSON.stringify(sceneAppState(appState))}`
}

function fileOf(api: ExcalidrawImperativeAPI): BinaryFiles {
  return api.getFiles()
}

function sceneOf(model: BoardModel, api: ExcalidrawImperativeAPI): ExcalidrawScene {
  return {
    type: model.scene.type,
    version: model.scene.version,
    source: model.scene.source,
    elements: [...api.getSceneElements()],
    appState: sceneAppState(api.getAppState()),
    files: api.getFiles(),
  }
}

function create(options: ExcalidrawCreateOptions): ExcalidrawHandle {
  const root: Root = createRoot(options.el)
  const holder: { api: ExcalidrawImperativeAPI | null } = { api: null }
  const model: BoardModel = {
    scene: options.scene,
    dark: options.dark,
    locale: options.locale,
    editable: options.editable,
    variant: options.variant,
    seen: fingerprint(options.scene.elements, options.scene.appState),
    destroyed: false,
  }
  const render = (): void => {
    root.render(
      <Board
        model={model}
        onApi={(api) => {
          holder.api = api
        }}
        onChange={(elements, appState) => {
          const next = fingerprint(elements, appState)
          if (next === model.seen) return
          model.seen = next
          options.onChange()
        }}
      />,
    )
  }
  render()
  return handleFor({ options, root, holder, model, render })
}

interface HandleParts {
  options: ExcalidrawCreateOptions
  root: Root
  holder: { api: ExcalidrawImperativeAPI | null }
  model: BoardModel
  render: () => void
}

/**
 * A prop change is rendered on the next microtask, not inside the call that asked for
 * it: those calls arrive while the app is committing (a theme switch, the move into the
 * full screen overlay), and rendering the board's own root from inside another tree's
 * commit is the nested update React rejects.
 */
function rerender(parts: HandleParts): void {
  queueMicrotask(() => {
    if (!parts.model.destroyed) parts.render()
  })
}

function handleFor(parts: HandleParts): ExcalidrawHandle {
  return {
    ...sceneActions(parts),
    ...exportActions(parts),
    setTheme: (dark) => {
      parts.model.dark = dark
      rerender(parts)
    },
    setVariant: (variant) => {
      parts.model.variant = variant
      rerender(parts)
    },
    destroy: () => {
      parts.model.destroyed = true
      parts.root.unmount()
    },
  }
}

function sceneActions({ options, holder, model }: HandleParts): Pick<ExcalidrawHandle, 'getScene' | 'updateScene' | 'scrollToContent' | 'zoomToFit' | 'refresh' | 'focus'> {
  const withApi = (work: (api: ExcalidrawImperativeAPI) => void): void => {
    if (holder.api) work(holder.api)
  }
  return {
    getScene: () => (holder.api ? sceneOf(model, holder.api) : model.scene),
    updateScene: (scene) => {
      model.scene = scene
      model.seen = fingerprint(scene.elements, scene.appState)
      withApi((api) => {
        api.updateScene({
          elements: restoreElements(scene.elements, null),
          ...(backgroundOf(scene) ? { appState: backgroundOf(scene) } : {}),
        })
      })
    },
    scrollToContent: () => withApi((api) => api.scrollToContent(undefined, { fitToContent: true })),
    zoomToFit: () => withApi((api) => api.scrollToContent(undefined, { fitToContent: true })),
    refresh: () => withApi((api) => api.refresh()),
    focus: () => {
      options.el.querySelector<HTMLElement>('.excalidraw')?.focus()
    },
  }
}

function exportActions({ holder, model }: HandleParts): Pick<ExcalidrawHandle, 'exportSvg' | 'exportPng'> {
  const appStateFor = (api: ExcalidrawImperativeAPI) => ({
    ...api.getAppState(),
    exportBackground: true,
    exportWithDarkMode: model.dark,
  })
  return {
    exportSvg: async () => {
      const api = holder.api
      if (!api) return null
      const svg = await exportToSvg({
        elements: api.getSceneElements(),
        appState: appStateFor(api),
        files: fileOf(api),
        exportPadding: EXPORT_PADDING,
      })
      return new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    },
    exportPng: async () => {
      const api = holder.api
      if (!api) return null
      return exportToBlob({
        elements: api.getSceneElements(),
        appState: appStateFor(api),
        files: fileOf(api),
        mimeType: 'image/png',
        exportPadding: EXPORT_PADDING,
      })
    },
  }
}

/**
 * A still picture of a scene, drawn without mounting a board. Only the background and
 * the export flags are handed to the library here: they are plain values, so the call
 * needs no cast, and the stored element geometry is kept as the note last wrote it.
 */
async function renderStaticSvg(scene: ExcalidrawScene, dark: boolean): Promise<string | null> {
  const declared = scene.appState.viewBackgroundColor
  const viewBackgroundColor = typeof declared === 'string' ? declared : dark ? DARK_BACKGROUND : LIGHT_BACKGROUND
  try {
    const svg = await exportToSvg({
      elements: restoreElements(scene.elements, null),
      appState: { exportBackground: true, exportWithDarkMode: dark, viewBackgroundColor },
      files: scene.files,
      exportPadding: EXPORT_PADDING,
    })
    return svg.outerHTML
  }
  catch (err) {
    console.warn('[inkstone] whiteboard snapshot failed', err)
    return null
  }
}

/** Entry point of the dynamic import; wired up by ./loader. */
export function createExcalidrawVendor(): ExcalidrawVendor {
  return {
    create,
    parse: parseExcalidrawScene,
    serialize: serializeExcalidrawScene,
    renderStaticSvg,
    parseLibrary: (file) => loadLibraryFromBlob(file),
    serializeLibrary: (items) => serializeLibraryAsJSON(items),
  }
}
