/** Full-sync paging and consolidation for the note store pull path. */
import type { SyncResponse } from '@shared/types'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'

type SyncNote = SyncResponse['notes'][number]
type SyncFolder = SyncResponse['folders'][number]
type SyncTag = SyncResponse['tags'][number]

interface SyncAccumulator {
  notes: Map<string, SyncNote>
  folders: Map<string, SyncFolder>
  tags: Map<string, SyncTag>
  cursor: number
  serverTime: number
  settingsChanged: boolean
  profileChanged: boolean | undefined
  siteChanged: boolean | undefined
}

export async function collectFullSync(first: SyncResponse): Promise<SyncResponse> {
  const notes = new Map(first.notes.map((note) => [note.id, note]))
  let page = first
  const requestedKeys = new Set<string>()
  while (page.hasMore) {
    if (page.nextKey === null)
      throw new Error(t('notes.full_sync_pagination_data_is_incomplete'))
    if (requestedKeys.has(page.nextKey))
      throw new Error(t('notes.full_sync_pagination_data_is_incomplete'))
    requestedKeys.add(page.nextKey)
    page = await api.sync(0, {
      after: page.nextKey,
      snapshot: first.cursor,
    })
    if (!page.full || page.cursor !== first.cursor) {
      throw new Error(t('notes.the_full_sync_snapshot_expired_try_again'))
    }
    for (const note of page.notes)
      notes.set(note.id, note)
  }
  return {
    ...first,
    notes: [...notes.values()],
    hasMore: false,
    nextKey: null,
    serverTime: page.serverTime,
  }
}

export function consolidateFullSync(snapshot: SyncResponse, increments: SyncResponse[]): SyncResponse {
  const acc: SyncAccumulator = {
    notes: new Map(snapshot.notes.map((note) => [note.id, note])),
    folders: new Map(snapshot.folders.map((folder) => [folder.id, folder])),
    tags: new Map(snapshot.tags.map((tag) => [tag.id, tag])),
    cursor: snapshot.cursor,
    serverTime: snapshot.serverTime,
    settingsChanged: snapshot.settingsChanged,
    profileChanged: snapshot.profileChanged,
    siteChanged: snapshot.siteChanged,
  }
  for (const update of increments)
    applyFullSyncIncrement(acc, update)
  return {
    ...snapshot,
    cursor: acc.cursor,
    hasMore: false,
    nextKey: null,
    facetsFull: true,
    settingsChanged: acc.settingsChanged,
    profileChanged: acc.profileChanged,
    siteChanged: acc.siteChanged,
    notes: [...acc.notes.values()],
    folders: [...acc.folders.values()],
    tags: [...acc.tags.values()],
    deletions: [],
    serverTime: acc.serverTime,
  }
}

function applyFullSyncIncrement(acc: SyncAccumulator, update: SyncResponse): void {
  acc.settingsChanged ||= update.settingsChanged
  acc.profileChanged ||= update.profileChanged
  acc.siteChanged ||= update.siteChanged
  for (const note of update.notes)
    acc.notes.set(note.id, note)
  if (update.facetsFull) {
    acc.folders = new Map(update.folders.map((folder) => [folder.id, folder]))
    acc.tags = new Map(update.tags.map((tag) => [tag.id, tag]))
  }
  else {
    for (const folder of update.folders)
      acc.folders.set(folder.id, folder)
    for (const tag of update.tags)
      acc.tags.set(tag.id, tag)
  }
  for (const deletion of update.deletions) {
    if (deletion.entity === 'note')
      acc.notes.delete(deletion.id)
    if (deletion.entity === 'folder')
      acc.folders.delete(deletion.id)
    if (deletion.entity === 'tag')
      acc.tags.delete(deletion.id)
  }
  acc.cursor = update.cursor
  acc.serverTime = update.serverTime
}