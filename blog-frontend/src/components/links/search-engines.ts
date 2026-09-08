import type { SearchEngine } from './types'

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'bing', name: 'Bing', url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'baidu', name: '百度', url: (q: string) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'github', name: 'GitHub', url: (q: string) => `https://github.com/search?q=${encodeURIComponent(q)}` },
  { id: 'bilibili', name: '哔哩哔哩', url: (q: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}` },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
]
