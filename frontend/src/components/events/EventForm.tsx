import { useState, useRef, useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { MapPin, Loader, Camera, X, Plus } from 'lucide-react'
import type { Category } from '@/types'
import type { CreateEventData } from '@/api/events'
import EventMap from '@/components/map/EventMap'
import ClientOnly from '@/components/ClientOnly'
import IosDatePicker from '@/components/ui/IosDatePicker'
import ImageCropModal from '@/components/ui/ImageCropModal'

interface ExistingImage {
  id: number
  url: string
}

interface Props {
  defaultValues?: Partial<CreateEventData>
  defaultImages?: ExistingImage[]
  categories: Category[]
  onSubmit: (data: CreateEventData, newFiles: File[], removedIds: number[]) => Promise<void>
  submitLabel: string
}

export default function EventForm({ defaultValues, defaultImages = [], categories, onSubmit, submitLabel }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, getValues, control } = useForm<CreateEventData>({
    defaultValues: defaultValues || { capacity: 10 },
  })

  const isCatalog = useWatch({ control, name: 'is_tour' })
  const dateValue = useWatch({ control, name: 'date' })
  const priceValue = useWatch({ control, name: 'price' })
  const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  const dayOfWeek = dateValue ? DAYS[new Date(dateValue).getDay()] : ''

  useEffect(() => {
    if (isCatalog) setValue('date', '')
  }, [isCatalog, setValue])

  const [mapPin, setMapPin] = useState<[number, number] | null>(
    defaultValues?.latitude && defaultValues?.longitude
      ? [defaultValues.latitude, defaultValues.longitude]
      : null
  )
  const [geocoding, setGeocoding] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Multi-image state
  const [existingImages, setExistingImages] = useState<ExistingImage[]>(defaultImages)
  const [removedIds, setRemovedIds] = useState<number[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const [imageError, setImageError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [pendingOriginalName, setPendingOriginalName] = useState<string>('photo.jpg')

  const totalImages = existingImages.length + newFiles.length
  const hasImages = totalImages > 0

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { onChange: rhfAddressOnChange, ...addressRest } = register('address', { required: 'Обязательное поле' })

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    // Show crop modal for first selected file; queue rest if multiple selected
    const file = files[0]
    setPendingOriginalName(file.name || 'photo.jpg')
    setCropSrc(URL.createObjectURL(file))
    setImageError(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCropConfirm = (blob: Blob) => {
    const file = new File([blob], pendingOriginalName.replace(/\.[^.]+$/, '') + '_cropped.jpg', { type: 'image/jpeg' })
    setNewFiles((prev) => [...prev, file])
    setNewPreviews((prev) => [...prev, URL.createObjectURL(blob)])
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const removeExisting = (id: number) => {
    setExistingImages((prev) => prev.filter((img) => img.id !== id))
    setRemovedIds((prev) => [...prev, id])
  }

  const removeNew = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index))
    setNewPreviews((prev) => prev.filter((_, i) => i !== index))
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
    if (!hasImages) { setImageError(true); return }
    if (data.min_participants != null && isNaN(data.min_participants as number)) {
      data.min_participants = null
    }
    if (data.price != null && isNaN(data.price as number)) {
      data.price = null
    }
    if (!data.price || data.price <= 0) {
      data.price = null
      data.payment_details = null
    }
    // datetime-local gives local time without timezone — convert to UTC ISO string
    if (data.date) {
      data.date = new Date(data.date).toISOString()
    } else {
      delete (data as any).date
    }
    return onSubmit(data, newFiles, removedIds)
  })

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">

      {/* Event type selector */}
      <Controller
        name="is_tour"
        control={control}
        render={({ field }) => (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Тип мероприятия</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => field.onChange(false)}
                className={`flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all ${
                  !field.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">📅</span>
                <div>
                  <p className={`text-sm font-semibold ${!field.value ? 'text-blue-700' : 'text-gray-800'}`}>Мероприятие</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">Разовое событие с датой — появится в общей ленте</p>
                </div>
                <div className={`mt-auto w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 self-end ${!field.value ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                  {!field.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => field.onChange(true)}
                className={`flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all ${
                  field.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">🗂️</span>
                <div>
                  <p className={`text-sm font-semibold ${field.value ? 'text-blue-700' : 'text-gray-800'}`}>Тип мероприятия</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">Опишите событие без даты. Позже можно создавать конкретные мероприятия</p>
                </div>
                <div className={`mt-auto w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 self-end ${field.value ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                  {field.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          </div>
        )}
      />

      {/* Multi-image picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Фотографии <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">(первая станет обложкой)</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImagesChange}
        />

        {hasImages ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {existingImages.map((img) => (
                <div key={img.id} className="relative rounded-xl overflow-hidden border border-gray-200" style={{ paddingBottom: '75%' }}>
                  <img src={img.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExisting(img.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {existingImages[0]?.id === img.id && newFiles.length === 0 && (
                    <span className="absolute bottom-1 left-1 text-[10px] bg-blue-700 text-white px-1.5 py-0.5 rounded-md font-medium">обложка</span>
                  )}
                </div>
              ))}
              {newPreviews.map((src, i) => (
                <div key={`new-${i}`} className="relative rounded-xl overflow-hidden border border-gray-200" style={{ paddingBottom: '75%' }}>
                  <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeNew(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {existingImages.length === 0 && i === 0 && (
                    <span className="absolute bottom-1 left-1 text-[10px] bg-blue-700 text-white px-1.5 py-0.5 rounded-md font-medium">обложка</span>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => { fileInputRef.current?.click(); setImageError(false) }}
                className="rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-700 flex flex-col items-center justify-center gap-1 transition-colors"
                style={{ paddingBottom: '75%', position: 'relative' }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <Plus className="w-5 h-5" />
                  <span className="text-xs font-medium">Ещё</span>
                </div>
              </button>
            </div>
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
            <span className="text-sm font-medium">Добавить фотографии</span>
            <span className="text-xs">Можно выбрать несколько</span>
          </button>
        )}
        {imageError && <p className="text-xs text-red-500 mt-1">Добавьте хотя бы одно фото</p>}
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
            min={1}
            max={10000}
            {...register('capacity', { required: 'Обязательное поле', valueAsNumber: true, min: { value: 1, message: 'Минимум 1' } })}
            className="input"
          />
          {errors.capacity && <p className="text-xs text-red-500 mt-1">{errors.capacity.message}</p>}
        </div>
      </div>

      {!isCatalog && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Мин. участников для проведения</label>
          <input
            type="number"
            min={2}
            {...register('min_participants', { valueAsNumber: true, min: { value: 2, message: 'Минимум 2' } })}
            className="input"
            placeholder="Не задано"
          />
          {errors.min_participants && <p className="text-xs text-red-500 mt-1">{errors.min_participants.message}</p>}
          <p className="text-xs text-gray-400 mt-1">Если не наберётся, мероприятие отменится за 6 часов до начала</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Стоимость участия (₽)</label>
        <input
          type="number"
          min={0}
          step={1}
          {...register('price', { valueAsNumber: true, min: { value: 0, message: 'Минимум 0' } })}
          className="input"
          placeholder="0 — бесплатно"
        />
        {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
        <p className="text-xs text-gray-400 mt-1">Оставьте пустым или 0 для бесплатного мероприятия</p>
      </div>

      {priceValue != null && priceValue > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Реквизиты оплаты <span className="text-red-500">*</span></label>
          <textarea
            {...register('payment_details', {
              validate: (val) => {
                const price = Number((document.querySelector('input[name="price"]') as HTMLInputElement)?.value || 0)
                if (price > 0 && !val?.trim()) return 'Укажите реквизиты для перевода'
                return true
              }
            })}
            className="input resize-none"
            rows={3}
            placeholder="Например: СБП на номер +7 999 000 00 00 (Иван И.)"
          />
          {errors.payment_details && <p className="text-xs text-red-500 mt-1">{errors.payment_details.message}</p>}
          <p className="text-xs text-gray-400 mt-1">Участники увидят эти реквизиты при регистрации</p>
        </div>
      )}

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

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </form>
  )
}
