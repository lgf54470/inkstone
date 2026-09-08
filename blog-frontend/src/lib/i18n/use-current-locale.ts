import { useState, useEffect } from 'react'
import { DEFAULT_LOCALE, isSupportedLocale, type BlogLocale } from './types'

// 组件通过 props 收到 SSR 确定的 locale；未传时跟随 <html lang> 与
// inkstone-locale-change 事件（外观抽屉切换语言后组件即时换文案）。
export function useCurrentLocale(propLocale?: BlogLocale): BlogLocale {
  const [locale, setLocale] = useState<BlogLocale>(() => {
    if (propLocale) return propLocale
    if (typeof document !== 'undefined') {
      const docLang = document.documentElement.getAttribute('lang')
      if (isSupportedLocale(docLang)) return docLang
    }
    return DEFAULT_LOCALE
  })

  useEffect(() => {
    const handleLocaleChange = (e: Event) => {
      const custom = e as CustomEvent<BlogLocale>
      if (isSupportedLocale(custom.detail)) setLocale(custom.detail)
    }
    window.addEventListener('inkstone-locale-change', handleLocaleChange)
    return () => window.removeEventListener('inkstone-locale-change', handleLocaleChange)
  }, [])

  return propLocale || locale
}