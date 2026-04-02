import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Map, List, Search, SlidersHorizontal, X } from 'lucide-react'
import { eventsApi } from '@/api/events'
import type { EventList, Category } from '@/types'
import EventCard from '@/components/events/EventCard'
import EventMap from '@/components/map/EventMap'
import ClientOnly from '@/components/ClientOnly'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { getServerData } from '@/serverData'

type View = 'grid' | 'map'
type Tab = 'events' | 'organizers'

export default function HomePage() {
  const initial = getServerData()
  const [events, setEvents] = useState<EventList[]>(initial.events ?? [])
  const [categories, setCategories] = useState<Category[]>(initial.categories ?? [])
  const [formats, setFormats] = useState<EventList[]>([])
  const [loading, setLoading] = useState(!initial.events)
  const [view, setView] = useState<View>('grid')
  const [tab, setTab] = useState<Tab>('events')
  // Applied filters (trigger fetch)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [isFree, setIsFree] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')
  const [onlyAvailable] = useState(false)
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  // Draft filters (inside modal, not yet applied)
  const [draftCategory, setDraftCategory] = useState<number | null>(null)
  const [draftIsFree, setDraftIsFree] = useState<boolean | null>(null)
  const [draftCity, setDraftCity] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()

  const activeFilterCount = (selectedCategory !== null ? 1 : 0) + (isFree !== null ? 1 : 0) + (selectedCity !== null ? 1 : 0)

  const openFilters = () => {
    setDraftCategory(selectedCategory)
    setDraftIsFree(isFree)
    setDraftCity(selectedCity)
    setFilterOpen(true)
  }

  const applyFilters = () => {
    setSelectedCategory(draftCategory)
    setIsFree(draftIsFree)
    setSelectedCity(draftCity)
    setFilterOpen(false)
  }

  const resetFilters = () => {
    setDraftCategory(null)
    setDraftIsFree(null)
    setDraftCity(null)
  }

  useEffect(() => {
    eventsApi.getCategories().then((r) => setCategories(r.data))
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await eventsApi.list({
        category_id: selectedCategory ?? undefined,
        search: search || undefined,
        only_available: onlyAvailable,
        is_free: isFree ?? undefined,
        city: selectedCity ?? user?.city ?? undefined,
      })
      setEvents(data)
    } catch {
      toast.error('Не удалось загрузить мероприятия')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, search, onlyAvailable, isFree, selectedCity, user?.city])

  const fetchFormats = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await eventsApi.list({
        is_tour: true,
        search: search || undefined,
        category_id: selectedCategory ?? undefined,
        is_free: isFree ?? undefined,
      })
      setFormats(data)
    } catch {
      toast.error('Не удалось загрузить типы мероприятий')
    } finally {
      setLoading(false)
    }
  }, [search, selectedCategory, isFree])

  useEffect(() => {
    setSelectedCategory(null)
    setSearch('')
  }, [tab])

  useEffect(() => {
    if (tab === 'events') {
      const timer = setTimeout(fetchEvents, 300)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(fetchFormats, 300)
      return () => clearTimeout(timer)
    }
  }, [tab, fetchEvents, fetchFormats])

  if (view === 'map') {
    return (
      <div className="flex flex-col bg-gray-50" style={{ height: 'calc(100dvh - 64px)' }}>
        <div className="flex-1 overflow-hidden">
          <ClientOnly><EventMap events={events} height="100%" /></ClientOnly>
        </div>
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setView('grid')}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 active:bg-black text-white px-5 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
          >
            <List className="w-4 h-4" />
            Список
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 pb-24">
      {/* Hero banner */}
      <div className="px-3 pt-3">
        <div
          className="relative w-full rounded-2xl overflow-hidden cursor-pointer max-w-2xl mx-auto"
          style={{ height: '160px' }}
          onClick={() => navigate('/events/new')}
        >
          <img src="/banner.jpg" alt="banner" className="absolute inset-0 w-full h-full object-cover" />
        </div>
      </div>

      {/* Tab toggle */}
      <div className="bg-white px-4 pt-3 pb-0 mt-3 border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
            <button
              onClick={() => setTab('events')}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                tab === 'events' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              )}
            >
              Мероприятия
            </button>
            <button
              onClick={() => setTab('organizers')}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                tab === 'organizers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              )}
            >
              Организаторы
            </button>
          </div>
        </div>
      </div>

      {/* Search bar + filter button */}
      <div className="bg-white px-4 pt-2 pb-2 border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
              placeholder="Поиск..."
            />
          </div>
          <button
              onClick={openFilters}
              className={clsx(
                'relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex-shrink-0',
                activeFilterCount > 0 ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Фильтры
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
        </div>
      </div>

      {/* Filter bottom sheet */}
      {filterOpen && (
        <div className="fixed inset-x-0 top-0 bottom-14 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterOpen(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-semibold text-gray-900">Фильтры</h2>
              <button onClick={() => setFilterOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Город */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Город</p>
                <div className="flex flex-wrap gap-2">
                  {[null, 'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Красноярск', 'Самара', 'Уфа', 'Ростов-на-Дону', 'Омск', 'Краснодар', 'Воронеж', 'Пермь', 'Волгоград', 'Саратов', 'Тюмень', 'Тольятти', 'Ижевск', 'Барнаул', 'Ульяновск', 'Иркутск', 'Хабаровск', 'Владивосток', 'Ярославль', 'Махачкала', 'Томск', 'Оренбург', 'Кемерово', 'Новокузнецк', 'Рязань', 'Астрахань', 'Набережные Челны', 'Пенза', 'Липецк', 'Тула', 'Киров', 'Чебоксары', 'Калининград', 'Брянск', 'Курск', 'Иваново', 'Магнитогорск', 'Тверь', 'Архангельск', 'Сочи', 'Сургут', 'Белгород', 'Владимир'].map((city) => (
                    <button
                      key={String(city)}
                      onClick={() => setDraftCity(city)}
                      className={clsx(
                        'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                        draftCity === city ? 'bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {city ?? 'Все города'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Цена */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Стоимость</p>
                <div className="grid grid-cols-3 gap-2">
                  {([null, true, false] as (boolean | null)[]).map((val) => {
                    const label = val === null ? 'Все' : val ? '🆓 Бесплатно' : '💰 Платные'
                    return (
                      <button
                        key={String(val)}
                        onClick={() => setDraftIsFree(val)}
                        className={clsx(
                          'py-2 rounded-xl text-sm font-medium transition-all',
                          draftIsFree === val ? 'bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Категория */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Категория</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDraftCategory(null)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                      draftCategory === null ? 'bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    <span className="text-base leading-none">🎯</span>Все
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setDraftCategory(draftCategory === cat.id ? null : cat.id)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                        draftCategory === cat.id ? 'bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      <span className="text-base leading-none">{cat.icon}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions — always visible at bottom */}
            <div className="px-5 pb-4 pt-3 flex gap-3 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={resetFilters}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Сбросить
              </button>
              <button
                onClick={applyFilters}
                className="flex-1 py-3 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card overflow-hidden animate-pulse">
                <div className="h-36 bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'events' ? (
          events.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-3">🔍</div>
              <p className="font-semibold text-gray-500">Мероприятий не найдено</p>
              <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
              {!isAuthenticated && (
                <button onClick={() => navigate('/register')} className="mt-4 btn-primary text-sm">
                  Зарегистрироваться
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )
        ) : (
          formats.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-3">🗂️</div>
              <p className="font-semibold text-gray-500">Типов мероприятий не найдено</p>
              <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {formats.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Map toggle FAB — only for events tab */}
      {tab === 'events' && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setView('map')}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 active:bg-black text-white px-5 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
          >
            <Map className="w-4 h-4" />
            На карте
          </button>
        </div>
      )}
    </div>
  )
}
