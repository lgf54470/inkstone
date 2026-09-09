// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import WeatherWidget from './WeatherWidget'
import { WEATHER_CITY_STORAGE_KEY } from '../lib/weather'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FORECAST_FIXTURE = {
  current: { temperature_2m: 26.7, weather_code: 2, relative_humidity_2m: 59, wind_speed_10m: 16.4 },
  daily: {
    time: ['2026-09-08', '2026-09-09', '2026-09-10'],
    weather_code: [2, 3, 61],
    temperature_2m_max: [30.4, 29.1, 27.8],
    temperature_2m_min: [24.2, 23.5, 22.1],
  },
}

const GEOCODE_FIXTURE = {
  results: [
    { id: 1, name: '上海', latitude: 31.22, longitude: 121.46, admin1: '上海市', country: '中国' },
    { id: 2, name: '北京', latitude: 39.9, longitude: 116.4, admin1: '北京市', country: '中国' },
  ],
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// React 受控输入在实例上装了 value tracker，直接赋值会被记入 tracker 导致
// 后续 input 事件被 React 判定为“无变化”；用原型原生 setter 绕过它
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/weather/forecast')) return jsonResponse(FORECAST_FIXTURE)
    if (url.includes('/api/weather/geocode')) return jsonResponse(GEOCODE_FIXTURE)
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderWidget(): { container: HTMLDivElement } {
  const container = document.createElement('div')
  const root = createRoot(container)
  void act(() => {
    root.render(createElement(WeatherWidget, { initialLocale: 'zh-CN' }))
  })
  return { container }
}

async function waitFor(callback: () => void): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    try {
      callback()
      return
    } catch {
      if (Date.now() > deadline) throw new Error('waitFor timed out')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  vi.stubGlobal('fetch', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WeatherWidget forecast display', () => {
  it('loads the default city forecast and renders temperature, condition and 3 days', async () => {
    const fetchMock = stubFetch()
    const { container } = renderWidget()

    await waitFor(() => {
      expect(container.textContent).toContain('上海')
    })
    expect(container.textContent).toContain('27°C')
    expect(container.textContent).toContain('多云')
    expect(container.textContent).toContain('湿度 59%')
    expect(container.textContent).toContain('今天')
    expect(container.textContent).toContain('明天')
    expect(container.textContent).toContain('30° / 24°')

    const forecastCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/weather/forecast'))
    expect(String(forecastCall![0])).toContain('lat=31.22222')
    expect(String(forecastCall![0])).toContain('lon=121.45806')
  })

  it('uses the persisted city when present', async () => {
    stubFetch()
    window.localStorage.setItem(
      WEATHER_CITY_STORAGE_KEY,
      JSON.stringify({ name: '北京', latitude: 39.9, longitude: 116.4 }),
    )
    const { container } = renderWidget()

    await waitFor(() => {
      expect(container.textContent).toContain('北京')
    })
  })

  it('shows error state when the forecast request fails and recovers on retry', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL): Promise<Response> => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderWidget()

    await waitFor(() => {
      expect(container.textContent).toContain('天气服务暂不可用')
    })

    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes('/api/weather/forecast')) return jsonResponse(FORECAST_FIXTURE)
      throw new Error('unexpected')
    })

    const retryButton = [...container.querySelectorAll('button')].find((b) => b.textContent === '重试')!
    act(() => {
      retryButton.click()
    })
    await waitFor(() => {
      expect(container.textContent).toContain('27°C')
    })
  })
})

describe('WeatherWidget city search', () => {
  it('searches, selects a city and persists it', async () => {
    stubFetch()
    const { container } = renderWidget()
    await waitFor(() => {
      expect(container.textContent).toContain('上海')
    })

    const searchButton = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '切换城市')!
    act(() => {
      searchButton.click()
    })

    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, '北京')
    })

    await waitFor(() => {
      expect(container.textContent).toContain('北京市')
    })

    const cityButtons = [...container.querySelectorAll('button')].filter((b) => b.textContent?.includes('北京'))
    act(() => {
      cityButtons[0]!.click()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('27°C')
    })
    expect(container.textContent).toContain('北京')
    expect(JSON.parse(window.localStorage.getItem(WEATHER_CITY_STORAGE_KEY) || '{}')).toMatchObject({
      name: '北京',
      latitude: 39.9,
      longitude: 116.4,
    })
  })

  it('shows the clear button while typing and clears the query on click', async () => {
    stubFetch()
    const { container } = renderWidget()
    await waitFor(() => {
      expect(container.textContent).toContain('上海')
    })

    act(() => {
      ;[...container.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === '切换城市')!
        .click()
    })

    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, '北')
    })
    await waitFor(() => {
      expect(container.querySelector('input')!.value).toBe('北')
    })

    const clearButton = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除搜索')!
    expect(clearButton).toBeDefined()
    act(() => {
      clearButton.click()
    })
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('')
    expect(container.textContent).not.toContain('北京市')
  })

  it('shows an empty-state hint when no city matches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/weather/forecast')) return jsonResponse(FORECAST_FIXTURE)
      if (String(input).includes('/api/weather/geocode')) return jsonResponse({ results: [] })
      throw new Error('unexpected')
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderWidget()
    await waitFor(() => {
      expect(container.textContent).toContain('上海')
    })

    act(() => {
      ;[...container.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === '切换城市')!
        .click()
    })
    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, '不存在的城市')
    })

    await waitFor(() => {
      expect(container.textContent).toContain('未找到城市')
    })
  })
})