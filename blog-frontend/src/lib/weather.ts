import { asArray, asRecord } from './normalize'

export interface WeatherCity {
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
}

export interface WeatherGeocodeResult extends WeatherCity {
  id: number
}

export interface WeatherDay {
  date: string
  weatherCode: number
  max: number
  min: number
}

export interface WeatherForecast {
  current: {
    temperature: number
    weatherCode: number
    humidity: number
    windSpeed: number
  }
  days: WeatherDay[]
}

export type WeatherConditionKey =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'unknown'

export const WEATHER_CITY_STORAGE_KEY = 'inkstone-blog-weather-city'

// WMO 天气代码（https://open-meteo.com/en/docs 附录）归并为展示条件键
export function weatherConditionKey(code: number): WeatherConditionKey {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly_cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return 'drizzle'
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81 || code === 82) return 'rain'
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow'
  if (code === 95 || code === 96 || code === 99) return 'thunder'
  return 'unknown'
}

// 响应经过同源代理与 CDN 缓存，但结构仍需防御式归一化（上游字段可能缺失/变形）
export function parseGeocodeResults(raw: unknown): WeatherGeocodeResult[] {
  const data = asRecord(raw)
  return asArray(data.results)
    .map((item) => {
      const r = asRecord(item)
      return {
        id: typeof r.id === 'number' ? r.id : 0,
        name: String(r.name ?? ''),
        admin1: r.admin1 === undefined ? undefined : String(r.admin1),
        country: r.country === undefined ? undefined : String(r.country),
        latitude: typeof r.latitude === 'number' ? r.latitude : Number.NaN,
        longitude: typeof r.longitude === 'number' ? r.longitude : Number.NaN,
      }
    })
    .filter((r) => r.name !== '' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
}

export function parseForecast(raw: unknown): WeatherForecast | null {
  const data = asRecord(raw)
  const current = asRecord(data.current)
  const daily = asRecord(data.daily)
  const times = asArray(daily.time)
  if (typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number' || times.length === 0) {
    return null
  }
  const codes = asArray(daily.weather_code)
  const maxs = asArray(daily.temperature_2m_max)
  const mins = asArray(daily.temperature_2m_min)
  const days: WeatherDay[] = times.map((time, i) => ({
    date: String(time),
    weatherCode: typeof codes[i] === 'number' ? (codes[i] as number) : 0,
    max: typeof maxs[i] === 'number' ? (maxs[i] as number) : 0,
    min: typeof mins[i] === 'number' ? (mins[i] as number) : 0,
  }))
  return {
    current: {
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0,
      windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
    },
    days,
  }
}

export function loadSavedCity(): WeatherCity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WEATHER_CITY_STORAGE_KEY)
    if (!raw) return null
    const parsed = asRecord(JSON.parse(raw))
    const name = String(parsed.name ?? '')
    const latitude = Number(parsed.latitude)
    const longitude = Number(parsed.longitude)
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return {
      name,
      admin1: parsed.admin1 === undefined ? undefined : String(parsed.admin1),
      country: parsed.country === undefined ? undefined : String(parsed.country),
      latitude,
      longitude,
    }
  } catch {
    // 本地存储损坏/被禁用（隐私模式）时回退默认城市，属可选的尽力而为
    return null
  }
}

export function saveCity(city: WeatherCity): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WEATHER_CITY_STORAGE_KEY, JSON.stringify(city))
  } catch {
    // 存储满/被禁用时静默放弃：天气仍能展示，只是下次回默认城市
  }
}