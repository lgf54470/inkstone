import { lazy } from 'react'

/**
 * The publish form (title, slug availability check, tags, cover, summary) is opened from a note
 * row's blog submenu, so the note list — which imports the blog barrel for the store and the
 * submenu — must not carry it. Same rule as the hub: exported as a lazy component, rendered inside a
 * Suspense by every caller.
 */
export const BlogPublishModal = lazy(() => import('./blog-publish-modal').then((m) => ({ default: m.BlogPublishModal })))
