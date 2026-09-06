import { describe, expect, it } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import AppearanceDrawer from '../src/components/AppearanceDrawer'
import SearchModal from '../src/components/SearchModal'
import DegradedBanner from '../src/components/DegradedBanner'
import CalendarWidget from '../src/components/CalendarWidget'
import CommentsSection from '../src/components/CommentsSection'
import type { CalendarDayPost } from '../src/lib/types'

function render(component: ReactElement): string {
  return renderToString(component)
}

describe('component server-render smoke', () => {
  it('AppearanceDrawer renders its five option sections', () => {
    const html = render(createElement(AppearanceDrawer))
    expect(html).toContain('外观偏好设置')
    expect(html).toContain('主题模式')
    expect(html).toContain('强调色盘')
    expect(html).toContain('底色风格')
    expect(html).toContain('排版密度')
    expect(html).toContain('界面语言')
    expect(html).toContain('恢复默认')
  })

  it('DegradedBanner renders nothing while API health is normal', () => {
    expect(render(createElement(DegradedBanner))).toBe('')
  })

  it('SearchModal renders closed overlay with search hint and footer', () => {
    const html = render(createElement(SearchModal))
    expect(html).toContain('搜索文章标题')
    expect(html).toContain('输入关键字进行全站极速搜索')
    expect(html).toContain('退出: ESC')
    expect(html).toContain('invisible pointer-events-none')
  })

  it('CalendarWidget renders header, week row and current month grid', () => {
    const today = new Date()
    const days: CalendarDayPost[] = [
      {
        date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
          today.getDate()
        ).padStart(2, '0')}`,
        count: 1,
        posts: [{ title: '今日文章', slug: 'today-post' }],
      },
    ]
    const html = render(createElement(CalendarWidget, { initialDays: days }))
    // SSR inserts comment nodes between text and expression children; ignore them.
    const text = html.replace(/<!--[\s\S]*?-->/g, '')
    expect(text).toContain(`${today.getFullYear()}年 ${today.getMonth() + 1}月`)
    for (const header of ['日', '一', '二', '三', '四', '五', '六']) {
      expect(text).toContain(`>${header}<`)
    }
    expect(text).toContain('>今<')
  })

  it('CommentsSection renders form and loading state', () => {
    const html = render(createElement(CommentsSection, { postId: 'p1' }))
    expect(html).toContain('评论与讨论')
    expect(html).toContain('发表看法')
    expect(html).toContain('加载评论中')
    expect(html).toContain('称呼')
    expect(html).toContain('邮箱')
    expect(html).toContain('评论内容')
  })

  it('CommentsSection renders disabled notice when allowComments is false', () => {
    const html = render(createElement(CommentsSection, { postId: 'p1', allowComments: false }))
    expect(html).toContain('博主已关闭此文章的评论功能')
    expect(html).not.toContain('发表看法')
  })
})
