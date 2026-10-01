import { getBlogSettings } from './settings'

/**
 * Telling subscribers that the blog changed (FEA-08). WebSub splits this in two halves: the feed
 * advertises a hub (`<atom:link rel="hub">`, which the front end renders when this setting is filled
 * in), and the publisher posts `hub.mode=publish` there after a write. Delivery is best-effort like
 * the comment webhook: the write is stored and answered whether or not the hub answers, and a miss is
 * logged rather than retried.
 */

/** Delivery is bounded: a slow hub must not hold the request's context open. */
export const WEBSUB_PING_TIMEOUT_MS = 5000

/**
 * A post reaches the feed only while it is published and its moment has passed; a scheduled post is
 * invisible to readers, so pinging for one would tell subscribers to refetch the same bytes.
 */
export function postVisibleInFeed(isPublished: boolean, publishedAt: number, now: number): boolean {
  return isPublished && publishedAt <= now
}

/** The body a WebSub hub reads: `hub.mode` names the action, `hub.url` the feed that changed. */
export function webSubPingBody(feedUrl: string): string {
  return new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': feedUrl }).toString()
}

export function pingWebSubHub(hubUrl: string, feedUrl: string): Promise<void> {
  return fetch(hubUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: webSubPingBody(feedUrl),
    signal: AbortSignal.timeout(WEBSUB_PING_TIMEOUT_MS),
  })
    .then(() => undefined)
    .catch((error) => {
      // Best-effort by design: the post is stored, and a third-party hub being down must not fail the
      // author's write. The miss is reported here so it is not invisible.
      console.warn('[blog] WebSub ping failed:', error instanceof Error ? error.message : error)
    })
}

/**
 * The blog's own feed address, derived from the front-end URL its settings carry. A blog that has not
 * said where its front end lives cannot point a hub at a feed, so the ping is skipped rather than sent
 * to a guessed address.
 */
export function blogFeedUrl(frontendUrl: string): string | null {
  const base = frontendUrl.trim().replace(/\/+$/, '')
  return base ? `${base}/feed.xml` : null
}

/**
 * Reads the blog's hub settings and pings them. Never throws, so a write path can fire and forget: the
 * settings read failing is a reason to stay quiet, not to fail the write that already succeeded.
 */
export async function pingBlogFeed(
  db: D1Database,
  userId: string,
  waitUntil: ((task: Promise<void>) => void) | undefined,
): Promise<void> {
  try {
    const settings = await getBlogSettings(db, userId)
    if (!settings.websubHubUrl) return
    const feedUrl = blogFeedUrl(settings.frontendUrl)
    if (!feedUrl) {
      console.warn('[blog] WebSub hub is set but the front-end URL is empty, so there is no feed address to ping with')
      return
    }
    const task = pingWebSubHub(settings.websubHubUrl, feedUrl)
    if (waitUntil) waitUntil(task)
    await task
  } catch (error) {
    console.warn('[blog] WebSub ping not sent:', error instanceof Error ? error.message : error)
  }
}
