import { useEffect, useState } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../../lib/api'
import { useLocale } from '../../../lib/i18n'
import { useBlogStore } from '../blog-store'

export function useBlogDashboardView() {
    const locale = useLocale()
    const stats = useBlogStore((s) => s.stats)
    const posts = useBlogStore((s) => s.posts)
    const comments = useBlogStore((s) => s.comments)
    const settings = useBlogStore((s) => s.settings)
    const loadAll = useBlogStore((s) => s.loadAll)
    const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)

    const [range, setRange] = useState<ShareTimelineRange>('7d')
    const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
    const [excludeBots, setExcludeBots] = useState<boolean>(true)
    const [analytics, setAnalytics] = useState<BlogGlobalAnalytics | null>(null)
    const [loading, setLoading] = useState<boolean>(true)

    const frontendBase = (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')
    const pendingComments = comments.filter((c) => c.status === 'pending')

    const loadData = (selectedRange = range, selectedExcludeBots = excludeBots) => loadAnalytics(selectedRange, selectedExcludeBots, setLoading, setAnalytics)

    const handleRefresh = async () => {
        await Promise.all([loadData(range, excludeBots), loadAll()])
    }

    useEffect(() => {
        void loadData(range, excludeBots)
    }, [range, excludeBots])

    const timelinePoints = analytics?.timeline || []
    const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))
    const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0

    return {
        stats, posts, comments, settings, loadAll, updateCommentStatus, locale,
        range, setRange, metricMode, setMetricMode,
        excludeBots, setExcludeBots, analytics, loading,
        frontendBase, pendingComments, chartValues, timelinePoints, filteredBots,
        handleRefresh,
    }
}

async function loadAnalytics(
    selectedRange: ShareTimelineRange,
    selectedExcludeBots: boolean,
    setLoading: (v: boolean) => void,
    setAnalytics: (v: BlogGlobalAnalytics | null) => void,
): Promise<void> {
    setLoading(true)
    try {
        const res = await api.blog.analytics(selectedRange, {
            excludeBots: selectedExcludeBots,
        })
        setAnalytics(res.analytics)
    } catch (err) {
        console.error('Failed to load blog analytics:', err)
    } finally {
        setLoading(false)
    }
}