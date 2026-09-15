/**
 * Whiteboard libraries as the API hands them around: an account owns a set of *named*
 * libraries — the same shape the public directory lists — and each one is a single
 * `.excalidrawlib` document stored as its own object. Boards draw from the one the user
 * selected (`preview.boardLibrary`), so every note sees the same items.
 */
export interface BoardLibrarySummary {
  name: string
  size: number
  updatedAt: number
}

export interface BoardLibraryList {
  libraries: BoardLibrarySummary[]
}

export interface BoardLibrarySnapshot {
  name: string
  /**
   * The library's items as JSON text: an `.excalidrawlib` body (the format is JSON, not an
   * archive), kept verbatim so a file round-trips with excalidraw.com. Null before the
   * first save, which the boards read as an empty library.
   */
  items: string | null
  updatedAt: number
}
