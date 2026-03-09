import { useState, useRef } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { MapPin, Loader, Camera, X } from 'lucide-react'
import type { Category } from '@/types'
import type { CreateEventData } from '@/api/events'
import EventMap from '@/components/map/EventMap'
import ClientOnly from '@/components/ClientOnly'
import IosDatePicker from '@/components/ui/IosDatePicker'

interface Props {
  defaultValues?: Partial<CreateEventData>
  defaultImageUrl?: string
  categories: Category[]
  onSubmit: (data: CreateEventData, imageFile?: File) => Promise<void>
  submitLabel: string
}

export default function EventForm({ defaultValues, defaultImageUrl, categories, onSubmit, submitLabel }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, getValues, control } = useForm<CreateEventData>({
    defaultValues: defaultValues || { capacity: 10 },
  })

  const isCatalog = useWatch({ control, name: 'is_tour' })
  const dateValue = useWatch({ control, name: 'date' })
  const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  const dayOfWeek = dateValue ? DAYS[new Date(dateValue).getDay()] : ''

  const [mapPin, setMapPin] = useState<[number, number] | null>(
    defaultValues?.latitude && defaultValues?.longitude
      ? [defaultValues.latitude, defaultValues.longitude]
      : null
  )
  const [geocoding, setGeocoding] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(defaultImageUrl || null)
  const [imageError, setImageError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { onChange: rhfAddressOnChange, ...addressRest } = register('address', { required: 'Обязательное поле' })

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageError(false)
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
    if (!value || value.length < 3) { setSuggestions([]); return }
    suggestTimer.current = setTimeout(async () => {
      try {
        const results = await nominatimSearch(value)
        setSuggestions(results.map((r) => r.display_name))
      } catch { setSuggestions([]) }
    }, 400)
  }

  const selectSuggestion = (s: string) => {
    setValue('address', s)
    setSuggestions([])
    geocodeAddressValue(s)
  }

  const setPin = (lat: number, lon: number) => {
    setValue('latitude', lat, { shouldValidate: true })
    setValue('longitude', lon)
    setMapPin([lat, lon])
  }

  const geocodeAddressValue = async (addr: string) => {
    if (!addr) return
    setGeocoding(true)
    try {
      const results = await nominatimSearch(addr, 1)
      if (results.length > 0) setPin(parseFloat(results[0].lat), parseFloat(results[0].lon))
    } catch { /* silent */ } finally { setGeocoding(false) }
  }

  const geocodeAddress = () => {
    setSuggestions([])
    geocodeAddressValue(getValues('address'))
  }

  const handleMapClick = async (lat: number, lng: number) => {
    setPin(lat, lng)
    setSuggestions([])
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json', 'accept-language': 'ru' })
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        headers: { 'User-Agent': 'communicate-site/1.0' },
      })
      const data = await resp.json()
      if (data.display_name) setValue('address', data.display_name)
    } catch { /* silent */ }
  }

  const handleFormSubmit = handleSubmit((data) => {
    if (!imagePreview) { setImageError(true); return }
    return onSubmit(data, imageFile ?? undefined)
  })

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">

      {/* Catalog toggle — first, drives the rest of the form */}
      <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer border border-gray-200">
        <span className="text-2xl">🗂️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Добавить в каталог</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isCatalog
              ? <><span className="font-medium text-blue-700">Каталог</span> — постоянное предложение (тур, секция, клуб). Без конкретной даты.</>
              : <><span className="font-medium text-gray-700">Мероприятие</span> — разовое событие с датой в общей ленте.</>
            }
          </p>
        </div>
        <input type="checkbox" {...register('is_tour')} className="w-4 h-4 accent-blue-700" />
      </label>

      {/* Image picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Обложка <span className="text-red-500">*</span>
        </label>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden border border-gray-200" style={{ height: '180px' }}>
            <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/50 hover:bg-black/70 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />Изменить
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { fileInputRef.current?.click(); setImageError(false) }}
            className={`w-full h-32 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 ${
              imageError
                ? 'border-red-400 bg-red-50 text-red-400'
                : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-700'
            }`}
          >
            <Camera className="w-6 h-6" />
            <span className="text-sm font-medium">Добавить обложку</span>
            <span className="text-xs">JPG, PNG до 5 МБ</span>
          </button>
        )}
        {imageError && <p className="text-xs text-red-500 mt-1">Добавьте обложку мероприятия</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Название <span className="text-red-500">*</span></label>
        <input {...register('title', { required: 'Обязательное поле' })} className="input" placeholder="Например: Волейбол в парке" />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание <span className="text-red-500">*</span></label>
        <textarea
          {...register('description', { required: 'Обязательное поле' })}
          className="input resize-none"
          rows={4}
          placeholder="Расскажите о мероприятии..."
        />
        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Date — only for regular events */}
        {!isCatalog && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата и время <span className="text-red-500">*</span></label>
            <Controller
              name="date"
              control={control}
              rules={{ required: 'Обязательное поле' }}
              render={({ field }) => (
                <IosDatePicker value={field.value || ''} onChange={field.onChange} error={!!errors.date} />
              )}
            />
            {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
            {dayOfWeek && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-xs text-gray-500">День недели:</span>
                <span className="text-xs font-semibold text-blue-700">{dayOfWeek}</span>
              </div>
            )}
          </div>
        )}

        <div className={isCatalog ? 'sm:col-span-2 sm:max-w-[calc(50%-8px)]' : ''}>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Макс. участников <span className="text-red-500">*</span></label>
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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Категория <span className="text-red-500">*</span></label>
        <select {...register('category_id', { required: 'Выберите категорию', valueAsNumber: true })} className="input">
          <option value="">Выберите категорию</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        {errors.category_id && <p className="text-xs text-red-500 mt-1">{errors.category_id.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Адрес <span className="text-red-500">*</span></label>
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
                    className="px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0 leading-tight"
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

      {/* Hidden latitude — drives map pin validation */}
      <input type="hidden" {...register('latitude', { required: true })} />

      <div
        className={`rounded-xl overflow-hidden border transition-colors ${errors.latitude && !mapPin ? 'border-red-400' : 'border-gray-200'}`}
        style={{ height: '260px' }}
      >
        <ClientOnly>
          <EventMap
            center={mapPin || [47.2357, 39.7015]}
            zoom={mapPin ? 15 : 12}
            height="260px"
            onMapClick={handleMapClick}
            selectedPin={mapPin}
          />
        </ClientOnly>
      </div>
      {errors.latitude && !mapPin && (
        <p className="text-xs text-red-500 -mt-3">Укажите точку на карте — нажмите «Найти» или кликните на карту</p>
      )}

      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? <><Loader className="w-4 h-4 animate-spin" />Сохранение...</> : submitLabel}
      </button>
    </form>
  )
}
