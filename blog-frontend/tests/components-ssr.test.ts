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
  it('AppearanceDrawer renders all option sections including the language picker', () => {
    const html = render(createElement(AppearanceDrawer, { initialLocale: 'zh-CN' }))
    expect(html).toContain('外观偏好设置')
    expect(html).toContain('主题模式')
    expect(html).toContain('强调色盘')
    expect(html).toContain('底色风格')
    expect(html).toContain('排版密度')
    expect(html).toContain('界面语言')
    expect(html).toContain('简体中文')
    expect(html).toContain('繁體中文')
    expect(html).toContain('English')
    expect(html).toContain('恢复默认')
  })

  it('AppearanceDrawer renders English labels when initialLocale is en-US', () => {
    const html = render(createElement(AppearanceDrawer, { initialLocale: 'en-US' }))
    expect(html).toContain('Appearance Preferences')
    expect(html).toContain('Theme Mode')
    expect(html).toContain('Accent Palette')
    expect(html).toContain('Canvas Background')
    expect(html).toContain('Layout Density')
    expect(html).toContain('Language')
    expect(html).toContain('Reset Defaults')
  })

  it('AppearanceDrawer renders Traditional Chinese labels when initialLocale is zh-TW', () => {
    const html = render(createElement(AppearanceDrawer, { initialLocale: 'zh-TW' }))
    expect(html).toContain('外觀偏好設定')
    expect(html).toContain('主題模式')
    expect(html).toContain('強調色盤')
    expect(html).toContain('底色風格')
    expect(html).toContain('排版密度')
    expect(html).toContain('介面語言')
    expect(html).toContain('恢復預設')
  })

  it('DegradedBanner renders nothing while API health is normal', () => {
    expect(render(createElement(DegradedBanner))).toBe('')
  })

  it('SearchModal renders closed overlay with search hint and footer', () => {
    const html = render(createElement(SearchModal))
    expect(html).toContain('搜索文章标题')
    expect(html).toContain('输入关键字进行全站搜索')
    expect(html).toContain('支持全站文章搜索')
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

  it('SearchModal renders English labels when initialLocale is en-US', () => {
    const html = render(createElement(SearchModal, { initialLocale: 'en-US' }))
    expect(html).toContain('Search posts by title, excerpt, tag...')
    expect(html).toContain('Type keywords to search across all posts')
    expect(html).toContain('Exit: ESC')
  })

  it('CalendarWidget renders English weekday headers when initialLocale is en-US', () => {
    const html = render(createElement(CalendarWidget, { initialLocale: 'en-US' }))
    const text = html.replace(/<!--[\s\S]*?-->/g, '')
    for (const header of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(text).toContain(`>${header}<`)
    }
  })

  it('CommentsSection renders English labels when initialLocale is en-US', () => {
    const html = render(createElement(CommentsSection, { postId: 'p1', initialLocale: 'en-US' }))
    expect(html).toContain('Comments &amp; Discussions')
    expect(html).toContain('Leave a Comment')
    expect(html).toContain('Loading comments...')
  })
})
