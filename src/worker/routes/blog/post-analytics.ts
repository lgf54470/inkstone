import { Hono } from 'hono'
import type { BlogPostAnalytics } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { buildBucketedTimeline, computeDelta, toBreakdown } from '../../lib/share-analytics'
import {
  BLOG_VISIT_SOURCE,
  visitAggregateFromResults,
  visitAggregateStatements,
} from '../../lib/visit-aggregates'
import {
  blogAnalyticsContext,
  blogPrevVisitsStatement,
  blogRecentVisitsStatement,
  toBlogVisitLogs,
  type BlogRecentVisitRow,
} from './analytics-reads'

/**
 * One post's own slice of the dashboard's window (FEA-09). The author sees a post on the ranking and
 * asks the obvious next question — where did its readers come from, when did they arrive — and this
 * answers exactly that: the same range, the same traffic filters and the same shape of numbers as
 * the dashboard, scoped to one post. Only a live post of the account may be asked about; a post that
 * waits in the bin is not on the ranking that offers this view.
 */
export function registerBlogPostAnalyticsRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/analytics/posts/:postId', async (c) => {
    const userId = c.get('userId')!
    const postId = c.req.param('postId')
    const post = await c.env.DB
      .prepare(`SELECT id, title, slug FROM blog_posts WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`)
      .bind(postId, userId)
      .first<{ id: string; title: string; slug: string }>()
    if (!post) throw ApiError.notFound('Post not found')

    const ctx = await blogAnalyticsContext(c.env.DB, c, userId, postId)
    const [prevResult, recentResult, ...visitResults] = await c.env.DB.batch([
      blogPrevVisitsStatement(c.env.DB, userId, ctx.prevStartTs, ctx.startTs, ctx.clause, postId),
      blogRecentVisitsStatement(c.env.DB, userId, ctx.filters, postId),
      ...visitAggregateStatements(c.env.DB, BLOG_VISIT_SOURCE, { userId, targetId: postId }, ctx),
    ])
    const aggregate = visitAggregateFromResults(visitResults, ctx)
    const prev = firstRow<{ prev_views: number; prev_uv: number }>(prevResult)
    const views = aggregate.views

    const analytics: BlogPostAnalytics = {
      range: ctx.range,
      postId: post.id,
      title: post.title,
      slug: post.slug,
      totalViews: views,
      totalVisitors: aggregate.visitors,
      viewsDelta: computeDelta(views, prev?.prev_views ?? 0),
      visitorsDelta: computeDelta(aggregate.visitors, prev?.prev_uv ?? 0),
      timeline: buildBucketedTimeline(aggregate.buckets, ctx.range, ctx.startTs, ctx.duration),
      topCountries: toBreakdown(aggregate.countries, views),
      topReferrers: toBreakdown(aggregate.referrers, views),
      devices: toBreakdown(aggregate.devices, views),
      osList: toBreakdown(aggregate.osList, views),
      browsers: toBreakdown(aggregate.browsers, views),
      recentVisits: toBlogVisitLogs(rowsOf<BlogRecentVisitRow>(recentResult)),
    }
    return c.json({ analytics })
  })
}

interface D1ResultRows {
  results?: unknown[]
}

function firstRow<Row>(result: D1ResultRows | undefined): Row | null {
  return (result?.results?.[0] as Row | undefined) ?? null
}

function rowsOf<Row>(result: D1ResultRows | undefined): Row[] {
  return (result?.results ?? []) as Row[]
}
