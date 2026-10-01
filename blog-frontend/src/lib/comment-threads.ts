import type { BlogComment } from './types'

export interface CommentThread {
  comment: BlogComment
  replies: BlogComment[]
}

/**
 * 把评论列表按 parent_id 收成「一条 + 它的回复」。回复一律挂在根评论下（只缩进一层）：博主可以
 * 回复另一条回复，深度不设上限时窄屏会被逐层挤没，所以展示只保留两层，顺序仍是讨论发生的顺序。
 * 指向不存在评论（或成环）的 parent_id 当作顶层评论——一条找不到父级的回复不该从页面上消失。
 */
export function buildCommentThreads(comments: BlogComment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  const rootOfReply = new Map<string, string>()
  const threadByRoot = new Map<string, CommentThread>()
  const threads: CommentThread[] = []

  for (const comment of comments) {
    const rootId = resolveRootId(comment, byId)
    if (rootId === comment.id) {
      const thread: CommentThread = { comment, replies: [] }
      threads.push(thread)
      threadByRoot.set(comment.id, thread)
    } else {
      rootOfReply.set(comment.id, rootId)
    }
  }

  for (const comment of comments) {
    const rootId = rootOfReply.get(comment.id)
    if (!rootId) continue
    const thread = threadByRoot.get(rootId)
    if (thread) thread.replies.push(comment)
  }

  return threads
}

/** 一条评论所属的根评论 id；没有可解析的父级（或遇到环）时就是它自己。 */
function resolveRootId(comment: BlogComment, byId: Map<string, BlogComment>): string {
  let current = comment
  const seen = new Set<string>([comment.id])
  while (current.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent || seen.has(parent.id)) return comment.id
    if (!parent.parentId) return parent.id
    seen.add(parent.id)
    current = parent
  }
  return comment.id
}
