import { lazy } from 'react'

/**
 * The hub is the heaviest surface of the feature — the links view under it alone carries the icon
 * picker, qrcode and the link checker — and it opens on demand. The barrel therefore re-exports this
 * wrapper instead of the modal: `features/blog/index.ts` is imported statically by the note list and
 * the sidebar for the blog store, and a direct re-export put the whole hub into their chunk, which
 * also made the shell's own `lazy(() => import('../blog'))` split nothing. Render it inside a
 * Suspense (the shell already does).
 */
export const BlogHubModal = lazy(() => import('./blog-hub-modal').then((m) => ({ default: m.BlogHubModal })))
