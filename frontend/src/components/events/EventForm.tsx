import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { MapPin, Loader } from 'lucide-react'
import type { Category } from '@/types'
import type { CreateEventData } from '@/api/events'
import EventMap from '@/components/map/EventMap'

interface Props {
  defaultValues?: Partial<CreateEventData>
  categories: Category[]
  onSubmit: (data: CreateEventData) => Promise<void>
  submitLabel: string
}

export default function EventForm({ defaultValues, categories, onSubmit, submitLabel }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, getValues } = useForm<CreateEventData>({
    defaultValues: defaultValues || { capacity: 10 },
  })

  const [mapPin, setMapPin] = useState<[number, number] | null>(
    defaultValues?.latitude && defaultValues?.longitude
      ? [defaultValues.latitude, defaultValues.longitude]
      : null
  )
  const [geocoding, setGeocoding] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Split register to merge onChange without losing RHF tracking
  const { onChange: rhfAddressOnChange, ...addressRest } = register('address', { required: 'Обязательное поле' })

  const nominatimSearch = async (query: string, limit = 5): Promise<Array<{ display_name: string; lat: string; lon: string }>> => {
    const params = new URLSearchParams({ q: query, format: 'json', limit: String(limit), 'accept-language': 'ru' })
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'communicate-site/1.0' },
    })
    return resp.json()
  }

  const handleAddressInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    rhfAddressOnChange(e)
    const value = e.target.value
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!value || value.length < 3) {
      setSuggestions([])
      return
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const results = await nominatimSearch(value)
        setSuggestions(results.map((r) => r.display_name))
      } catch {
        setSuggestions([])
      }
    }, 400)
  }

  const selectSuggestion = (s: string) => {
    setValue('address', s)
    setSuggestions([])
    geocodeAddressValue(s)
  }

  const geocodeAddressValue = async (addr: string) => {
    if (!addr) return
    setGeocoding(true)
    try {
      const results = await nominatimSearch(addr, 1)
      if (results.length > 0) {
        const lat = parseFloat(results[0].lat)
        const lon = parseFloat(results[0].lon)
        setValue('latitude', lat)
        setValue('longitude', lon)
        setMapPin([lat, lon])
      }
    } catch {
      // silent
    } finally {
      setGeocoding(false)
    }
  }

  const geocodeAddress = () => {
    setSuggestions([])
    geocodeAddressValue(getValues('address'))
  }

  const handleMapClick = (lat: number, lng: number) => {
    setValue('latitude', lat)
    setValue('longitude', lng)
    setMapPin([lat, lng])
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Название *</label>
        <input {...register('title', { required: 'Обязательное поле' })} className="input" placeholder="Например: Волейбол в парке" />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание *</label>
        <textarea
          {...register('description', { required: 'Обязательное поле' })}
          className="input resize-none"
          rows={4}
          placeholder="Расскажите о мероприятии..."
        />
        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
      </div>

      {/* Stack on mobile, side-by-side on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата и время *</label>
          <input
            type="datetime-local"
            {...register('date', { required: 'Обязательное поле' })}
            className="input w-full"
          />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Макс. участников *</label>
          <input
            type="number"
            min={2}
            max={10000}
            {...register('capacity', { required: 'Обязательное поле', valueAsNumber: true, min: { value: 2, message: 'Минимум 2' } })}
            className="input"
          />
          {errors.capacity && <p className="text-xs text-red-500 mt-1">{errors.capacity.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Категория *</label>
        <select {...register('category_id', { required: 'Выберите категорию', valueAsNumber: true })} className="input">
          <option value="">Выберите категорию</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        {errors.category_id && <p className="text-xs text-red-500 mt-1">{errors.category_id.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Адрес *</label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              {...addressRest}
              onChange={handleAddressInput}
              className="input w-full"
              placeholder="Город, улица, дом"
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="px-3 py-2.5 text-sm cursor-pointer hover:bg-sky-50 border-b border-gray-100 last:border-0 leading-tight"
                    onMouseDown={() => selectSuggestion(s)}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={geocodeAddress}
            disabled={geocoding}
            title="Найти на карте"
            className="btn-secondary flex-shrink-0 w-10 h-10 flex items-center justify-center p-0"
          >
            {geocoding ? <Loader className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          </button>
        </div>
        {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>}
        <p className="text-xs text-gray-400 mt-1">Нажмите «Найти» или кликните на карте для выбора точки</p>
      </div>

      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '260px' }}>
        <EventMap
          center={mapPin || [47.2357, 39.7015]}
          zoom={mapPin ? 15 : 12}
          height="260px"
          onMapClick={handleMapClick}
          selectedPin={mapPin}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? <><Loader className="w-4 h-4 animate-spin" />Сохранение...</> : submitLabel}
      </button>
    </form>
  )
}
