import { useShareStore } from './share-store'

export type ShareListViewBundle = ReturnType<typeof useShareListView>

/**
 * The list view's data: the rows behind every status category, the four states a caller has to paint
 * for them, and the selection the batch bar acts on.
 *
 * It reads the store rather than fetching, because the rows are shared: a category pick, a mutation
 * and the hub's own opening all reload the same list through it. What this hook buys is that the hub
 * shell does not know any of that — it picks a view and hands it its callbacks.
 */
export function useShareListView() {
  const viewMode = useShareStore((s) => s.viewMode)
  const shares = useShareStore((s) => s.shares)
  const loading = useShareStore((s) => s.loading)
  const error = useShareStore((s) => s.error)
  const truncated = useShareStore((s) => s.truncated)
  const selectedCount = useShareStore((s) => s.selectedNoteIds.size)
  const clearSelection = useShareStore((s) => s.clearSelection)
  const loadShares = useShareStore((s) => s.loadShares)
  return { viewMode, shares, loading, error, truncated, selectedCount, clearSelection, loadShares }
}
