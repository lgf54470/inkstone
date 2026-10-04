import type { APIRoute } from 'astro'
import { getMapGeometry } from '../lib/map-geometry.ts'

/**
 * The chart outlines, served from this origin so a post's map draws without relaxing the page's own
 * `connect-src` and without a reader's request ever going to a third party. The rules — which hosts may
 * be read, how big an answer may be, what counts as GeoJSON — are in `src/lib/map-geometry.ts`, where
 * they are testable without a network.
 */
export const GET: APIRoute = ({ url }) => getMapGeometry(url.searchParams)
