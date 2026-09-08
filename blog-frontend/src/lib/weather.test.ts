// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import {
  loadSavedCity,
  parseForecast,
  parseGeocodeResults,
  saveCity,
  weatherConditionKey,
  WEATHER_CITY_STORAGE_KEY,
} from './weather'

describe('weatherConditionKey', () => {
  it('maps WMO codes to display conditions', () => {
    expect(weatherConditionKey(0)).toBe('clear')
    expect(weatherConditionKey(1)).toBe('partly_cloudy')
    expect(weatherConditionKey(2)).toBe('partly_cloudy')
    expect(weatherConditionKey(3)).toBe('cloudy')
    expect(weatherConditionKey(45)).toBe('fog')
    expect(weatherConditionKey(48)).toBe('fog')
    expect(weatherConditionKey(51)).toBe('drizzle')
    expect(weatherConditionKey(57)).toBe('drizzle')
    expect(weatherConditionKey(61)).toBe('rain')
    expect(weatherConditionKey(82)).toBe('rain')
    expect(weatherConditionKey(71)).toBe('snow')
    expect(weatherConditionKey(86)).toBe('snow')
    expect(weatherConditionKey(95)).toBe('thunder')
    expect(weatherConditionKey(99)).toBe('thunder')
  })

  it('falls back to unknown for unmapped codes', () => {
    expect(weatherConditionKey(-1)).toBe('unknown')
    expect(weatherConditionKey(999)).toBe('unknown')
  })
})

describe('parseGeocodeResults', () => {
  it('parses and keeps valid city entries', () => {
    const results = parseGeocodeResults({
      results: [
        { id: 1, name: '上海', latitude: 31.22, longitude: 121.46, admin1: '上海市', country: '中国' },
        { id: 2, name: 'Beijing', latitude: 39.9, longitude: 116.4, country: 'China' },
      ],
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ id: 1, name: '上海', admin1: '上海市', country: '中国', latitude: 31.22, longitude: 121.46 })
    expect(results[1]!.admin1).toBeUndefined()
  })

  it('drops entries with missing names or non-numeric coordinates', () => {
    const results = parseGeocodeResults({
      results: [
        { id: 1, name: '', latitude: 31, longitude: 121 },
        { id: 2, name: '坏坐标', latitude: 'x', longitude: 121 },
        { id: 3, name: '正常', latitude: 30, longitude: 120 },
      ],
    })
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('正常')
  })

  it('returns empty array for empty or malformed payloads', () => {
    expect(parseGeocodeResults({ results: [] })).toEqual([])
    expect(parseGeocodeResults({})).toEqual([])
    expect(parseGeocodeResults(null)).toEqual([])
  })
})

describe('parseForecast', () => {
  const VALID = {
    current: { temperature_2m: 26.7, weather_code: 2, relative_humidity_2m: 59, wind_speed_10m: 16.4 },
    daily: {
      time: ['2026-09-08', '2026-09-09', '2026-09-10'],
      weather_code: [2, 3, 61],
      temperature_2m_max: [30.4, 29.1, 27.8],
      temperature_2m_min: [24.2, 23.5, 22.1],
    },
  }

  it('parses current weather and daily forecast', () => {
    const forecast = parseForecast(VALID)
    expect(forecast).not.toBeNull()
    expect(forecast!.current).toEqual({ temperature: 26.7, weatherCode: 2, humidity: 59, windSpeed: 16.4 })
    expect(forecast!.days).toHaveLength(3)
    expect(forecast!.days[0]).toEqual({ date: '2026-09-08', weatherCode: 2, max: 30.4, min: 24.2 })
  })

  it('returns null when current temperature or day list is missing', () => {
    expect(parseForecast({ current: {}, daily: { time: ['2026-09-08'] } })).toBeNull()
    expect(parseForecast({ current: { temperature_2m: 26.7, weather_code: 2 }, daily: {} })).toBeNull()
    expect(parseForecast(null)).toBeNull()
  })

  it('tolerates partially missing daily fields', () => {
    const forecast = parseForecast({
      current: { temperature_2m: 26.7, weather_code: 2 },
      daily: { time: ['2026-09-08'], weather_code: [3] },
    })
    expect(forecast!.days[0]).toEqual({ date: '2026-09-08', weatherCode: 3, max: 0, min: 0 })
  })
})

describe('city persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips a saved city', () => {
    const city = { name: '北京', admin1: '北京市', country: '中国', latitude: 39.9, longitude: 116.4 }
    saveCity(city)
    expect(loadSavedCity()).toEqual(city)
  })

  it('returns null when nothing is saved', () => {
    expect(loadSavedCity()).toBeNull()
  })

  it('returns null for corrupted storage', () => {
    window.localStorage.setItem(WEATHER_CITY_STORAGE_KEY, '{not json')
    expect(loadSavedCity()).toBeNull()
  })
})