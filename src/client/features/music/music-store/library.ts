import type { MusicBatchAction } from '../../../lib/api'
import {
  clearSearchHistory, clearSelection, commitQuery, closeTrackMenu, invertSelection, loadLibrary, openTrackMenu, prepareRomanization,
  recordSearchQuery, removeSearchHistory,
  selectAll, setDefaultViewMode, setLyricSource, setQuery, setScope, setShowSourceBadge, setSort, setSortDirection, setSourceFilter, setViewMode, showMoreMatches, toggleSelect,
} from './library-load'
import {
  batchTracks, deleteTrack, ensureTrackLyric, forgetPlayHistory, patchTrack, refreshTrackMetadata, toggleFavorite, togglePin, trashTracks,
} from './library-tracks'
import { matchMissingCovers } from './library-covers'
import { searchTrackLyric } from './library-lyrics'
import {
  cancelDownloads, dismissDownload, dismissLibraryJob, downloadTracks, retryDownload, retryFailedDownloads,
  setTransfersOpen, setUploadTarget,
} from './transfers'
import { setTracksOffline, syncOfflineTracks, toggleTrackOffline } from './offline'
import {
  addSelectionToPlaylist, addToPlaylist, createPlaylist, createPlaylistWithTracks, createTag, deletePlaylist, deleteTag, dismissUpload,
  movePlaylistItem, movePlaylistItemToIndex, moveSelectionToTag, patchTag, removeFromPlaylist, renamePlaylist,
  setPlaylistCover, sharePlaylist, unsharePlaylist, uploadFiles,
} from './library-collections'
import { browseWebdav, deleteWebdavObjects, importTrackFromUrl, importWebdavFolder, importWebdavTrack } from './webdav'
import { closeTrash, openTrash, purgeTrashEntry, restoreFromTrash } from './trash'
import { browseAlist, createAlistServer, deleteAlistServer, importAlistFolder, importAlistTrack, loadAlistServers, patchAlistServer, searchAlist } from './alist'
import {
  clearServerSearch, createServerSource, deleteServerSource, importServerHit, importServerHits,
  loadServerSources, patchServerSource, probeServerSource, searchServerSource, selectServerSourceForSearch,
} from './servers'
import { closePodcastEpisodes, createPodcastFeed, deletePodcastFeed, importPodcastOpml, loadPodcastEpisodes, loadPodcastFeeds, playPodcastEpisode, renamePodcastFeed } from './podcast'
import {
  closeHealthScan, openHealthScan, repairDeadReference, scanReferences, trashDeadReferences,
} from './health'
import {
  acceptProviderNotice, addProviderTrack, addProviderTracks, closeSourceSwitch, openSourceSwitch, playProviderTrack,
  searchProviders, setProviderAutoSwap, setProviderEnabled, setProviderQuality, setProviderScope, switchTrackSource,
} from './providers'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

type LibrarySlice = Pick<MusicStoreState,
  | 'loadLibrary' | 'setScope' | 'setQuery' | 'commitQuery' | 'clearSearchHistory' | 'recordSearchQuery' | 'removeSearchHistory'
  | 'setSort' | 'setSortDirection' | 'prepareRomanization'
  | 'setViewMode' | 'setDefaultViewMode' | 'showMoreMatches' | 'openTrackMenu' | 'closeTrackMenu' | 'setSourceFilter' | 'browseWebdav' | 'importWebdavTrack' | 'importWebdavFolder' | 'deleteWebdavFiles'
  | 'setProviderQuality' | 'acceptProviderNotice' | 'setShowSourceBadge' | 'setLyricSource'
  | 'importTrackFromUrl'
  | 'openTrash' | 'closeTrash' | 'restoreFromTrash' | 'purgeTrashEntry'
  | 'loadAlistServers' | 'createAlistServer' | 'patchAlistServer' | 'deleteAlistServer'
  | 'browseAlist' | 'searchAlist' | 'importAlistTrack' | 'importAlistFolder'
  | 'loadServerSources' | 'createServerSource' | 'patchServerSource' | 'deleteServerSource'
  | 'probeServerSource' | 'selectServerSourceForSearch' | 'searchServerSource' | 'clearServerSearch'
  | 'importServerHit' | 'importServerHits'
  | 'loadPodcastFeeds' | 'createPodcastFeed' | 'renamePodcastFeed' | 'deletePodcastFeed'
  | 'loadPodcastEpisodes' | 'closePodcastEpisodes' | 'importPodcastOpml' | 'playPodcastEpisode'
  | 'setProviderEnabled' | 'setProviderScope' | 'searchProviders' | 'playProviderTrack' | 'addProviderTrack' | 'addProviderTracks'
  | 'setProviderAutoSwap' | 'openSourceSwitch' | 'closeSourceSwitch' | 'switchTrackSource'
  | 'openHealthScan' | 'closeHealthScan' | 'scanReferences' | 'repairDeadReference' | 'trashDeadReferences'
  | 'trashTracks' | 'forgetPlayHistory'
  | 'toggleSelect' | 'selectAll' | 'invertSelection' | 'clearSelection'
  | 'moveSelectionToTag' | 'addSelectionToPlaylist'
  | 'patchTrack' | 'ensureTrackLyric' | 'refreshTrackMetadata' | 'matchMissingCovers' | 'searchTrackLyric' | 'toggleFavorite' | 'togglePin' | 'deleteTrack' | 'batchTracks'
  | 'createTag' | 'patchTag' | 'deleteTag'
  | 'createPlaylist' | 'createPlaylistWithTracks' | 'renamePlaylist' | 'deletePlaylist' | 'sharePlaylist' | 'unsharePlaylist' | 'setPlaylistCover' | 'addToPlaylist' | 'removeFromPlaylist' | 'movePlaylistItem' | 'movePlaylistItemToIndex'
  | 'uploadFiles' | 'dismissUpload'
  | 'downloadTracks' | 'dismissDownload' | 'retryDownload' | 'retryFailedDownloads' | 'cancelDownloads'
  | 'dismissLibraryJob' | 'setTransfersOpen' | 'setUploadTarget'
  | 'syncOfflineTracks' | 'toggleTrackOffline' | 'setTracksOffline'>

export function librarySlice(set: MusicSet, get: MusicGet): LibrarySlice {
  return {
    loadLibrary: (force) => loadLibrary(set, get, force),
    setScope: (scope) => setScope(set, scope),
    setQuery: (query) => setQuery(set, get, query),
    commitQuery: (query) => commitQuery(set, get, query),
    clearSearchHistory: () => clearSearchHistory(set),
    recordSearchQuery: (query) => recordSearchQuery(set, get, query),
    removeSearchHistory: (entry) => removeSearchHistory(set, get, entry),
    setSort: (sort) => setSort(set, sort),
    setSortDirection: (direction) => setSortDirection(set, direction),
    setViewMode: (mode) => setViewMode(set, mode),
    setDefaultViewMode: (mode) => setDefaultViewMode(set, mode),
    showMoreMatches: () => showMoreMatches(set),
    openTrackMenu: (menu) => openTrackMenu(set, get, menu),
    closeTrackMenu: () => closeTrackMenu(set),
    setSourceFilter: (filter) => setSourceFilter(set, filter),
    setProviderQuality: (quality) => setProviderQuality(set, get, quality),
    acceptProviderNotice: () => acceptProviderNotice(set, get),
    setShowSourceBadge: (visible) => setShowSourceBadge(set, get, visible),
    setLyricSource: (source) => setLyricSource(set, get, source),
    prepareRomanization: () => prepareRomanization(set, get),
    toggleSelect: (id, additive) => toggleSelect(set, id, additive),
    selectAll: (ids) => selectAll(set, ids),
    invertSelection: (ids) => invertSelection(set, ids),
    clearSelection: () => clearSelection(set),
    moveSelectionToTag: (tagId) => moveSelectionToTag(set, get, tagId),
    addSelectionToPlaylist: (playlistId) => addSelectionToPlaylist(set, get, playlistId),
    patchTrack: (id, patch) => patchTrack(set, get, id, patch),
    ensureTrackLyric: (id) => ensureTrackLyric(set, get, id),
    refreshTrackMetadata: (ids, force) => refreshTrackMetadata(set, get, ids, force),
    matchMissingCovers: () => matchMissingCovers(set, get),
    searchTrackLyric: (id, source) => searchTrackLyric(set, get, id, source),
    toggleFavorite: (id) => toggleFavorite(set, get, id),
    togglePin: (id) => togglePin(set, get, id),
    deleteTrack: (id) => deleteTrack(set, get, id),
    batchTracks: (action) => batchTracks(set, get, action as MusicBatchAction),
    createTag: (name, color) => createTag(set, get, name, color),
    patchTag: (id, patch) => patchTag(set, id, patch),
    deleteTag: (id) => deleteTag(set, id),

    createPlaylist: (name, description) => createPlaylist(set, name, description),
    createPlaylistWithTracks: (name, trackIds) => createPlaylistWithTracks(set, name, trackIds),
    renamePlaylist: (id, name, description) => renamePlaylist(set, id, name, description),
    deletePlaylist: (id) => deletePlaylist(set, id),
    sharePlaylist: (id) => sharePlaylist(set, id),
    unsharePlaylist: (id) => unsharePlaylist(set, id),
    setPlaylistCover: (id, coverDataUrl) => setPlaylistCover(set, id, coverDataUrl),
    ...playlistActions(set, get),

    uploadFiles: (files, target) => uploadFiles(set, get, files, target),
    dismissUpload: (id) => dismissUpload(set, get, id),
    ...transferActions(set, get),
    browseWebdav: (path) => browseWebdav(set, path),
    importWebdavTrack: (entry) => importWebdavTrack(set, get, entry),
    importWebdavFolder: () => importWebdavFolder(set, get),
    deleteWebdavFiles: (paths) => deleteWebdavObjects(paths),
    importTrackFromUrl: (input) => importTrackFromUrl(set, get, input),
    openTrash: () => openTrash(set),
    closeTrash: () => closeTrash(set),
    restoreFromTrash: (id) => restoreFromTrash(set, get, id),
    purgeTrashEntry: (id) => purgeTrashEntry(set, id),
    loadAlistServers: () => loadAlistServers(set),
    createAlistServer: (input) => createAlistServer(set, input),
    patchAlistServer: (id, patch) => patchAlistServer(set, id, patch),
    deleteAlistServer: (id) => deleteAlistServer(set, id),
    browseAlist: (serverId, path) => browseAlist(set, serverId, path),
    searchAlist: (serverId, keywords) => searchAlist(serverId, keywords),
    importAlistTrack: (serverId, entry) => importAlistTrack(set, serverId, entry),
    importAlistFolder: () => importAlistFolder(set, get),
    loadServerSources: () => loadServerSources(set),
    createServerSource: (input) => createServerSource(set, input),
    patchServerSource: (id, patch) => patchServerSource(set, id, patch),
    deleteServerSource: (id) => deleteServerSource(set, id),
    probeServerSource: (id) => probeServerSource(set, id),
    selectServerSourceForSearch: (serverId) => selectServerSourceForSearch(set, serverId),
    searchServerSource: (serverId, keywords) => searchServerSource(set, serverId, keywords),
    clearServerSearch: () => clearServerSearch(set),
    importServerHit: (serverId, hit) => importServerHit(set, serverId, hit),
    importServerHits: (serverId, hits) => importServerHits(set, serverId, hits),
    loadPodcastFeeds: () => loadPodcastFeeds(set),
    loadPodcastEpisodes: (feedId) => loadPodcastEpisodes(set, feedId),
    closePodcastEpisodes: () => closePodcastEpisodes(set),
    importPodcastOpml: (opml) => importPodcastOpml(set, opml),
    playPodcastEpisode: (feed, episode) => playPodcastEpisode(set, get, feed, episode),
    setProviderEnabled: (providerId, enabled) => setProviderEnabled(set, get, providerId, enabled),
    setProviderScope: (scope) => setProviderScope(set, get, scope),
    searchProviders: (keywords) => searchProviders(set, get, keywords),
    playProviderTrack: (hit) => playProviderTrack(set, get, hit),
    addProviderTrack: (hit) => addProviderTrack(set, hit),
    addProviderTracks: (hits) => addProviderTracks(set, hits),
    setProviderAutoSwap: (value) => setProviderAutoSwap(set, get, value),
    openSourceSwitch: (trackId) => openSourceSwitch(set, get, trackId),
    closeSourceSwitch: () => closeSourceSwitch(set),
    switchTrackSource: (hit) => switchTrackSource(set, get, hit),
    openHealthScan: () => openHealthScan(set, get),
    closeHealthScan: () => closeHealthScan(set),
    scanReferences: () => scanReferences(set, get),
    repairDeadReference: (id) => repairDeadReference(set, get, id),
    trashDeadReferences: (ids) => trashDeadReferences(set, get, ids),
    trashTracks: (ids) => trashTracks(set, get, ids),
    forgetPlayHistory: (ids) => forgetPlayHistory(set, ids),
    createPodcastFeed: (input) => createPodcastFeed(set, input),
    renamePodcastFeed: (id, patch) => renamePodcastFeed(set, id, patch),
    deletePodcastFeed: (id) => deletePodcastFeed(set, id),
  }
}
type PlaylistItemActions = Pick<MusicStoreState, 'addToPlaylist' | 'removeFromPlaylist' | 'movePlaylistItem' | 'movePlaylistItemToIndex'>

function playlistActions(set: MusicSet, get: MusicGet): PlaylistItemActions {
  return {
    addToPlaylist: (playlistId, trackId) => addToPlaylist(set, get, playlistId, trackId),
    removeFromPlaylist: (playlistId, itemId) => removeFromPlaylist(set, playlistId, itemId),
    movePlaylistItem: (playlistId, itemId, delta) => movePlaylistItem(set, get, playlistId, itemId, delta),
    movePlaylistItemToIndex: (playlistId, itemId, toIndex) => movePlaylistItemToIndex(set, get, playlistId, itemId, toIndex),
  }
}

type TransferActions = Pick<MusicStoreState,
  | 'downloadTracks' | 'dismissDownload' | 'retryDownload' | 'retryFailedDownloads' | 'cancelDownloads'
  | 'syncOfflineTracks' | 'toggleTrackOffline' | 'setTracksOffline'
  | 'dismissLibraryJob' | 'setTransfersOpen' | 'setUploadTarget'>

function transferActions(set: MusicSet, get: MusicGet): TransferActions {
  return {
    downloadTracks: (ids) => downloadTracks(set, get, ids),
    dismissDownload: (id) => dismissDownload(set, get, id),
    retryDownload: (id) => retryDownload(set, get, id),
    retryFailedDownloads: () => retryFailedDownloads(set, get),
    cancelDownloads: () => cancelDownloads(set, get),
    syncOfflineTracks: () => syncOfflineTracks(set),
    toggleTrackOffline: (id) => toggleTrackOffline(set, get, id),
    setTracksOffline: (ids, enabled) => setTracksOffline(set, get, ids, enabled),
    dismissLibraryJob: (kind) => dismissLibraryJob(set, kind),
    setTransfersOpen: (open) => setTransfersOpen(set, open),
    setUploadTarget: (target) => setUploadTarget(set, target),
  }
}
