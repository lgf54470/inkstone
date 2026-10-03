/**
 * Where a folder sits, said the way a reader says it: `Work/Notes`, not `Notes`. A nested vault can hold
 * two folders that end with the same word, and both the `path:` filter line and the legend row name a
 * folder, so the name they use has to be the whole way down or the two collapse into one (G-48).
 *
 * The worker and the demo backend filter on this, and the graph panel labels with it, so one folder's
 * name is worked out in exactly one place.
 */
export const GRAPH_FOLDER_PATH_SEPARATOR = '/'

export interface FolderPathSource {
  id: string
  parentId: string | null
  name: string
}

export function folderPathsById(folders: readonly FolderPathSource[]): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const paths = new Map<string, string>()
  for (const folder of folders) {
    const chain: string[] = []
    const visited = new Set<string>()
    let cursor: FolderPathSource | undefined = folder
    // A parent that points back into the chain would walk forever; the cycle is cut where it closes and
    // the folder is named by the part of the path that was reachable.
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      chain.unshift(cursor.name)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    paths.set(folder.id, chain.join(GRAPH_FOLDER_PATH_SEPARATOR))
  }
  return paths
}

/**
 * The folders a `path:` term names. The term is a case-insensitive piece of the path, which is what it
 * always was of the folder name — a reader writing `work` still gets the Work branch and everything
 * under it, and one writing `work/notes` now gets that folder rather than nothing.
 */
export function folderIdsMatchingPath(term: string, paths: Map<string, string>): string[] {
  const needle = term.toLocaleLowerCase()
  return [...paths]
    .filter(([, path]) => path.toLocaleLowerCase().includes(needle))
    .map(([id]) => id)
    .sort()
}
