import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Search,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCurrentLocale } from '../lib/i18n/use-current-locale'
import { DEFAULT_WEATHER_CITY, WEATHER_CITY_SEARCH_DEBOUNCE_MS } from '../lib/constants'
import { t, type BlogLocale, type MessageKey } from '../lib/i18n'
import {
  loadSavedCity,
  parseForecast,
  parseGeocodeResults,
  saveCity,
  weatherConditionKey,
  type WeatherCity,
  type WeatherForecast,
  type WeatherConditionKey,
  type WeatherGeocodeResult,
  type WeatherDay,
} from '../lib/weather'

interface WeatherWidgetProps {
  initialLocale?: BlogLocale
}

const CONDITION_ICONS: Record<WeatherConditionKey, LucideIcon> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
  unknown: Cloud,
}

const CONDITION_KEYS: Record<WeatherConditionKey, MessageKey> = {
  clear: 'weather.cond_clear',
  partly_cloudy: 'weather.cond_partly_cloudy',
  cloudy: 'weather.cond_cloudy',
  fog: 'weather.cond_fog',
  drizzle: 'weather.cond_drizzle',
  rain: 'weather.cond_rain',
  snow: 'weather.cond_snow',
  thunder: 'weather.cond_thunder',
  unknown: 'weather.cond_unknown',
}

function initialCityOf(locale: BlogLocale): WeatherCity {
  const saved = loadSavedCity()
  if (saved) return saved
  return {
    name: locale === 'en-US' ? DEFAULT_WEATHER_CITY.nameEn : DEFAULT_WEATHER_CITY.nameZh,
    latitude: DEFAULT_WEATHER_CITY.latitude,
    longitude: DEFAULT_WEATHER_CITY.longitude,
  }
}

function dayLabel(date: string, index: number, locale: BlogLocale): string {
  if (index === 0) return t('weather.today', {}, locale)
  if (index === 1) return t('weather.tomorrow', {}, locale)
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short' })
}

function useForecast(city: WeatherCity | null) {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [forecastError, setForecastError] = useState(false)
  const seqRef = useRef(0)

  const load = useCallback(async (target: WeatherCity) => {
    const seq = ++seqRef.current
    setForecastError(false)
    setForecast(null)
    try {
      const res = await fetch(`/api/weather/forecast?lat=${target.latitude}&lon=${target.longitude}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = parseForecast(await res.json())
      if (seq !== seqRef.current) return
      if (!data) throw new Error('malformed forecast payload')
      setForecast(data)
    } catch (err) {
      console.warn('Failed to load weather forecast:', err)
      if (seq === seqRef.current) setForecastError(true)
    }
  }, [])

  useEffect(() => {
    if (city) void load(city)
  }, [city, load])

  return { forecast, forecastError, reload: () => { if (city) void load(city) } }
}

// 城市搜索：防抖 + 计时器清理天然丢弃过期查询的结果
function useCitySearch(active: boolean, locale: BlogLocale) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherGeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!active || !q) {
      setResults([])
      setSearchError(false)
      setSearching(false)
      return undefined
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const lang = locale === 'en-US' ? 'en' : 'zh'
        const res = await fetch(`/api/weather/geocode?q=${encodeURIComponent(q)}&language=${lang}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setResults(parseGeocodeResults(await res.json()))
        setSearchError(false)
      } catch (err) {
        console.warn('Failed to search weather city:', err)
        setResults([])
        setSearchError(true)
      } finally {
        setSearching(false)
      }
    }, WEATHER_CITY_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, active, locale])

  return { query, setQuery, results, searching, error: searchError, clear: () => { setQuery(''); setResults([]) } }
}

function selectCityOf(result: WeatherGeocodeResult): WeatherCity {
  return {
    name: result.name,
    admin1: result.admin1,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
  }
}

function useWeatherCity(locale: BlogLocale) {
  const [city, setCity] = useState<WeatherCity | null>(() => initialCityOf(locale))
  const [searchOpen, setSearchOpen] = useState(false)
  const { forecast, forecastError, reload } = useForecast(city)
  const search = useCitySearch(searchOpen, locale)

  const selectCity = (result: WeatherGeocodeResult) => {
    saveCity(selectCityOf(result))
    setCity(selectCityOf(result))
    setSearchOpen(false)
    search.clear()
  }

  return { city, forecast, forecastError, searchOpen, search, selectCity, reload, toggleSearch: () => setSearchOpen((v) => !v) }
}

export default function WeatherWidget({ initialLocale }: WeatherWidgetProps): ReactElement {
  const locale = useCurrentLocale(initialLocale)
  const weather = useWeatherCity(locale)
  return (
    <div className='p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'>
      <div className='flex items-center justify-between mb-2.5'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5'>
          <CloudSun className='w-3.5 h-3.5 text-[var(--accent)]' aria-hidden='true' />
          <span>{t('weather.title', {}, locale)}</span>
        </h3>
        <button
          type='button'
          onClick={weather.toggleSearch}
          aria-label={t('weather.change_city', {}, locale)}
          className='p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer'
        >
          <Search className='w-3.5 h-3.5' aria-hidden='true' />
        </button>
      </div>

      <WeatherBody weather={weather} locale={locale} />
    </div>
  )
}

interface WeatherBodyProps {
  weather: ReturnType<typeof useWeatherCity>
  locale: BlogLocale
}

function WeatherBody({ weather, locale }: WeatherBodyProps): ReactElement {
  const { searchOpen, search, forecast, forecastError, city, selectCity, reload } = weather
  if (searchOpen) {
    return (
      <CitySearch
        query={search.query}
        results={search.results}
        searching={search.searching}
        error={search.error}
        locale={locale}
        onQueryChange={search.setQuery}
        onSelect={selectCity}
        onClear={search.clear}
      />
    )
  }
  if (forecastError) {
    return <WeatherError onRetry={reload} locale={locale} />
  }
  if (forecast === null) {
    return (
      <div className='flex items-center gap-2 py-2.5 text-xs text-[var(--text-tertiary)]'>
        <Loader2 className='w-3.5 h-3.5 animate-spin text-[var(--accent)]' aria-hidden='true' />
        <span>{t('weather.loading', {}, locale)}</span>
      </div>
    )
  }
  return <ForecastBody city={city!} forecast={forecast} locale={locale} />
}

function CitySearch({
  query,
  results,
  searching,
  error,
  locale,
  onQueryChange,
  onSelect,
  onClear,
}: {
  query: string
  results: WeatherGeocodeResult[]
  searching: boolean
  error: boolean
  locale: BlogLocale
  onQueryChange: (value: string) => void
  onSelect: (result: WeatherGeocodeResult) => void
  onClear: () => void
}): ReactElement {
  return (
    <div className='space-y-2'>
      <CitySearchInput
        query={query}
        locale={locale}
        onQueryChange={onQueryChange}
        onClear={onClear}
      />

      <SearchFeedback
        query={query}
        results={results}
        searching={searching}
        error={error}
        locale={locale}
        onSelect={onSelect}
      />
    </div>
  )
}

function CitySearchInput({
  query,
  locale,
  onQueryChange,
  onClear,
}: {
  query: string
  locale: BlogLocale
  onQueryChange: (value: string) => void
  onClear: () => void
}): ReactElement {
  return (
    <div className='relative'>
      <Search className='w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]' aria-hidden='true' />
      <input
        type='text'
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('weather.search_placeholder', {}, locale)}
        aria-label={t('weather.search_aria', {}, locale)}
        className='w-full pl-8 pr-8 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
      />
      {query !== '' && (
        <button
          type='button'
          onClick={onClear}
          aria-label={t('weather.clear_search', {}, locale)}
          className='absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer'
        >
          <X className='w-3.5 h-3.5' aria-hidden='true' />
        </button>
      )}
    </div>
  )
}

function SearchFeedback({
  query,
  results,
  searching,
  error,
  locale,
  onSelect,
}: {
  query: string
  results: WeatherGeocodeResult[]
  searching: boolean
  error: boolean
  locale: BlogLocale
  onSelect: (result: WeatherGeocodeResult) => void
}): ReactElement {
  if (error) {
    return <p className='text-xs text-[var(--danger)]'>{t('weather.search_error', {}, locale)}</p>
  }
  if (searching) {
    return (
      <p className='flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]'>
        <Loader2 className='w-3 h-3 animate-spin' aria-hidden='true' />
        <span>{t('weather.searching', {}, locale)}</span>
      </p>
    )
  }
  if (results.length === 0 && query.trim() !== '') {
    return <p className='text-xs text-[var(--text-tertiary)]'>{t('weather.no_city', { query: query.trim() }, locale)}</p>
  }
  return (
    <ul className='space-y-0.5 max-h-44 overflow-y-auto'>
      {results.map((result) => (
        <li key={result.id}>
          <button
            type='button'
            onClick={() => onSelect(result)}
            className='w-full flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer'
          >
            <span className='truncate'>{result.name}</span>
            <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)] truncate shrink-0 text-right'>
              {[result.admin1, result.country].filter(Boolean).join(' · ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function WeatherError({ onRetry, locale }: { onRetry: () => void; locale: BlogLocale }): ReactElement {
  return (
    <div className='flex items-center justify-between gap-2 py-1'>
      <p className='text-xs text-[var(--danger)]'>{t('weather.error', {}, locale)}</p>
      <button
        type='button'
        onClick={onRetry}
        className='text-xs px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer'
      >
        {t('weather.retry', {}, locale)}
      </button>
    </div>
  )
}

function ForecastBody({
  city,
  forecast,
  locale,
}: {
  city: WeatherCity
  forecast: WeatherForecast
  locale: BlogLocale
}): ReactElement {
  const condition = weatherConditionKey(forecast.current.weatherCode)
  const Icon = CONDITION_ICONS[condition]
  return (
    <div className='space-y-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2.5 min-w-0'>
          <Icon className='w-8 h-8 text-[var(--accent)] shrink-0' aria-hidden='true' />
          <div className='min-w-0'>
            <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>{city.name}</p>
            <p className='text-[length:var(--text-10)] text-[var(--text-tertiary)] truncate'>
              {t(CONDITION_KEYS[condition], {}, locale)}
            </p>
          </div>
        </div>
        <p className='text-lg font-bold text-[var(--text-primary)] shrink-0'>
          {Math.round(forecast.current.temperature)}°C
        </p>
      </div>

      <p className='text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
        {t('weather.humidity', { value: forecast.current.humidity }, locale)}
        {' · '}
        {t('weather.wind', { value: forecast.current.windSpeed }, locale)}
      </p>

      <DailyForecastRow days={forecast.days.slice(0, 3)} locale={locale} />
    </div>
  )
}

function DailyForecastRow({ days, locale }: { days: WeatherDay[]; locale: BlogLocale }): ReactElement {
  return (
    <div className='grid grid-cols-3 gap-1.5 pt-2 border-t border-[var(--border-subtle)]'>
      {days.map((day, i) => {
        const DayIcon = CONDITION_ICONS[weatherConditionKey(day.weatherCode)]
        return (
          <div key={day.date} className='flex flex-col items-center gap-1 text-center'>
            <span className='text-[length:var(--text-10)] text-[var(--text-secondary)]'>
              {dayLabel(day.date, i, locale)}
            </span>
            <DayIcon className='w-4 h-4 text-[var(--accent)]' aria-hidden='true' />
            <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
              {Math.round(day.max)}° / {Math.round(day.min)}°
            </span>
          </div>
        )
      })}
    </div>
  )
}