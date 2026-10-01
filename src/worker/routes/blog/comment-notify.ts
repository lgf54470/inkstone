/**
 * Telling the author that a comment arrived (FEA-06). This is a Webhook because the instance has no
 * mail transport of its own: the author points it at their own service (which may forward to mail,
 * chat or anything else), the payload is JSON, and delivery is best-effort — a failing endpoint is
 * logged and never blocks or fails the reader's submission, which is already stored by then.
 */

/** Delivery is bounded: a slow endpoint must not hold the request's context open. */
export const COMMENT_WEBHOOK_TIMEOUT_MS = 5000

export interface CommentNotification {
  commentId: string
  postId: string
  postSlug: string
  postTitle: string
  authorName: string
  content: string
  status: string
  isOwner: boolean
  createdAt: number
  siteName: string
}

/**
 * Sends one notification. The reader's email and address are deliberately absent: the payload says
 * what was written and where, and anything an author needs beyond that is a click away in the
 * moderation list. A failure is logged with the reason and swallowed.
 */
export function notifyBlogComment(webhookUrl: string, notification: CommentNotification): Promise<void> {
  return fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Inkstone-Event': 'blog.comment.created',
    },
    body: JSON.stringify({ event: 'blog.comment.created', ...notification }),
    signal: AbortSignal.timeout(COMMENT_WEBHOOK_TIMEOUT_MS),
  })
    .then(() => undefined)
    .catch((error) => {
      // Best-effort by design: the comment is stored and the reader's submission must not fail
      // because a third-party endpoint is down. The miss is reported here so it is not invisible.
      console.warn('[blog] comment webhook failed:', error instanceof Error ? error.message : error)
    })
}

/**
 * Starts the send, and hands it to the runtime when it offers an execution context so a Worker
 * keeps the isolate alive until it lands. A context that is absent (Hono's `app.request` in tests)
 * changes nothing about the request itself — the send still starts.
 */
export function dispatchCommentNotification(
  webhookUrl: string,
  notification: CommentNotification,
  waitUntil: ((task: Promise<void>) => void) | undefined,
): void {
  if (!webhookUrl) return
  const task = notifyBlogComment(webhookUrl, notification)
  if (waitUntil) waitUntil(task)
}

