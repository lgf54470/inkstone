import {
  applyEqPreset, clearLoopRange, connectAudio, currentTrack, cycleMode, markLoopEnd, markLoopStart, nudgeLyricOffset, playCollection,
  playNext, playPrevious, playQueueAt, playTrack, resetLyricOffset, seek, setEqBand, setEqEnabled,
  setFloatingPosition, setImmersive, setNormalizeEnabled, setPlaybackRate, setSleepAfterCurrentTrack, setSleepTimer, setVolume,
  toggleFloating, toggleFloatingCollapsed, toggleMute, togglePlay,
} from './player'
import { setCrossfadeEnabled } from './crossfade'
import { addManyToQueue, addToQueue, clearQueue, moveQueueItem, removeFromQueue } from './queue-ops'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

type PlayerSlice = Pick<MusicStoreState,
  | 'playTrack' | 'playCollection' | 'playQueueAt' | 'togglePlay' | 'playNext' | 'playPrevious'
  | 'seek' | 'setVolume' | 'toggleMute' | 'cycleMode' | 'setPlaybackRate' | 'setSleepTimer' | 'setSleepAfterCurrentTrack' | 'setImmersive'
  | 'setEqEnabled' | 'setEqBand' | 'applyEqPreset' | 'setNormalizeEnabled' | 'setCrossfadeEnabled'
  | 'nudgeLyricOffset' | 'resetLyricOffset' | 'markLoopStart' | 'markLoopEnd' | 'clearLoopRange'
  | 'addToQueue' | 'addManyToQueue' | 'removeFromQueue' | 'moveQueueItem' | 'clearQueue'
  | 'toggleFloating' | 'toggleFloatingCollapsed' | 'setFloatingPosition'>

export function playerSlice(set: MusicSet, get: MusicGet): PlayerSlice {
  connectAudio(set, get)
  return {
    playTrack: (id) => playTrack(set, get, id),
    playCollection: (ids, startIndex) => playCollection(set, get, ids, startIndex),
    playQueueAt: (index) => playQueueAt(set, get, index),
    togglePlay: () => togglePlay(set, get),
    playNext: () => playNext(set, get),
    playPrevious: () => playPrevious(set, get),
    seek: (ms) => seek(ms),
    setVolume: (volume) => setVolume(set, get, volume),
    toggleMute: () => toggleMute(set, get),
    cycleMode: () => cycleMode(set, get),
    setPlaybackRate: (rate) => setPlaybackRate(set, get, rate),
    setSleepTimer: (minutes) => setSleepTimer(set, get, minutes),
    setSleepAfterCurrentTrack: (enabled) => setSleepAfterCurrentTrack(set, get, enabled),
    markLoopStart: () => markLoopStart(set, get),
    markLoopEnd: () => markLoopEnd(set, get),
    clearLoopRange: () => clearLoopRange(set),
    nudgeLyricOffset: (trackId, deltaMs) => nudgeLyricOffset(set, get, trackId, deltaMs),
    resetLyricOffset: (trackId) => resetLyricOffset(set, get, trackId),
    setEqEnabled: (enabled) => setEqEnabled(set, get, enabled),
    setEqBand: (band, db) => setEqBand(set, get, band, db),
    applyEqPreset: (presetId) => applyEqPreset(set, get, presetId),
    setNormalizeEnabled: (enabled) => setNormalizeEnabled(set, get, enabled),
    setCrossfadeEnabled: (enabled) => setCrossfadeEnabled(set, get, enabled),
    setImmersive: (open) => setImmersive(set, open),
    addToQueue: (id, next) => addToQueue(set, get, id, next),
    addManyToQueue: (ids) => addManyToQueue(set, get, ids),
    removeFromQueue: (index) => removeFromQueue(set, get, index),
    moveQueueItem: (from, to) => moveQueueItem(set, get, from, to),
    clearQueue: () => clearQueue(set),
    toggleFloating: () => toggleFloating(set, get),
    toggleFloatingCollapsed: () => toggleFloatingCollapsed(set, get),
    setFloatingPosition: (position) => setFloatingPosition(set, get, position),
  }
}

export { currentTrack }