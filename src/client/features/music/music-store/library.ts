import type { MusicBatchAction } from '../../../lib/api'
import {
  clearSearchHistory, clearSelection, commitQuery, loadLibrary, prepareRomanization,
  selectAll, setQuery, setScope, setSort, setSourceFilter, setViewMode, toggleSelect,
} from './library-load'
import { batchTracks, deleteTrack, patchTrack, refreshTrackMetadata, setTrackTags, toggleFavorite, togglePin } from './library-tracks'
import { matchMissingCovers } from './library-covers'
import { dismissDownload, downloadTracks, setTransfersOpen, setUploadTarget } from './transfers'
import {
  addToPlaylist, createPlaylist, createTag, deletePlaylist, deleteTag, dismissUpload,
  patchTag, removeFromPlaylist, renamePlaylist, uploadFiles,
} from './library-collections'
import { browseWebdav, deleteWebdavObjects, importWebdavFolder, importWebdavTrack } from './webdav'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

type LibrarySlice = Pick<MusicStoreState,
  | 'loadLibrary' | 'setScope' | 'setQuery' | 'commitQuery' | 'clearSearchHistory' | 'setSort' | 'prepareRomanization'
  | 'setViewMode' | 'setSourceFilter' | 'browseWebdav' | 'importWebdavTrack' | 'importWebdavFolder' | 'deleteWebdavFiles'
  | 'toggleSelect' | 'selectAll' | 'clearSelection'
  | 'patchTrack' | 'refreshTrackMetadata' | 'matchMissingCovers' | 'toggleFavorite' | 'togglePin' | 'deleteTrack' | 'batchTracks' | 'setTrackTags'
  | 'createTag' | 'patchTag' | 'deleteTag'
  | 'createPlaylist' | 'renamePlaylist' | 'deletePlaylist' | 'addToPlaylist' | 'removeFromPlaylist'
  | 'uploadFiles' | 'dismissUpload'
  | 'downloadTracks' | 'dismissDownload' | 'setTransfersOpen' | 'setUploadTarget'>

export function librarySlice(set: MusicSet, get: MusicGet): LibrarySlice {
  return {
    loadLibrary: () => loadLibrary(set),
    setScope: (scope) => setScope(set, scope),
    setQuery: (query) => setQuery(set, get, query),
    commitQuery: (query) => commitQuery(set, get, query),
    clearSearchHistory: () => clearSearchHistory(set),
    setSort: (sort) => setSort(set, sort),
    setViewMode: (mode) => setViewMode(set, mode),
    setSourceFilter: (filter) => setSourceFilter(set, filter),
    prepareRomanization: () => prepareRomanization(set, get),
    toggleSelect: (id, additive) => toggleSelect(set, id, additive),
    selectAll: (ids) => selectAll(set, ids),
    clearSelection: () => clearSelection(set),

    patchTrack: (id, patch) => patchTrack(set, get, id, patch),
    refreshTrackMetadata: (ids) => refreshTrackMetadata(set, get, ids),
    matchMissingCovers: () => matchMissingCovers(set, get),
    toggleFavorite: (id) => toggleFavorite(set, get, id),
    togglePin: (id) => togglePin(set, get, id),
    deleteTrack: (id) => deleteTrack(set, get, id),
    batchTracks: (action) => batchTracks(set, get, action as MusicBatchAction),
    setTrackTags: (id, tagIds) => setTrackTags(set, id, tagIds),

    createTag: (name, color) => createTag(set, get, name, color),
    patchTag: (id, patch) => patchTag(set, id, patch),
    deleteTag: (id) => deleteTag(set, id),

    createPlaylist: (name) => createPlaylist(set, get, name),
    renamePlaylist: (id, name) => renamePlaylist(set, get, id, name),
    deletePlaylist: (id) => deletePlaylist(set, get, id),
    addToPlaylist: (playlistId, trackId) => addToPlaylist(get, playlistId, trackId),
    removeFromPlaylist: (playlistId, itemId) => removeFromPlaylist(get, playlistId, itemId),

    uploadFiles: (files, target) => uploadFiles(set, get, files, target),
    browseWebdav: (path) => browseWebdav(set, path),
    importWebdavTrack: (entry) => importWebdavTrack(set, get, entry),
    importWebdavFolder: () => importWebdavFolder(set, get),
    deleteWebdavFiles: (paths) => deleteWebdavObjects(paths),
    dismissUpload: (id) => dismissUpload(set, id),
    downloadTracks: (ids) => downloadTracks(set, get, ids),
    dismissDownload: (id) => dismissDownload(set, id),
    setTransfersOpen: (open) => setTransfersOpen(set, open),
    setUploadTarget: (target) => setUploadTarget(set, target),
  }
}