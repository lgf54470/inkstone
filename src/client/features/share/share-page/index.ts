// Public interface of the share-page module. Kept separate from the parent
// share module's index so the share page stays a self-contained lazy chunk
// (app.tsx code-splits on this boundary and must not pull the editor in).
export { SharePage } from './page'
export type { ShareRenderBundle } from './use-share-page'
export { useShareLoad, useShareRendering } from './use-share-page'
