// Public interface of the anonymous playlist-share module. Kept separate from
// the parent music module's index so the viewer stays a self-contained lazy
// chunk (app.tsx code-splits on this boundary and must not pull the library UI in).
export { MusicPlaylistSharePage } from './page'
