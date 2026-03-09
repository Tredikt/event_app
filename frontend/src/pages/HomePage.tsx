import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Map, List, Search } from 'lucide-react'
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
type Tab = 'events' | 'catalog'

export default function HomePage() {
  const initial = getServerData()
  const [events, setEvents] = useState<EventList[]>(initial.events ?? [])
  const [categories, setCategories] = useState<Category[]>(initial.categories ?? [])
  const [loading, setLoading] = useState(!initial.events)
  const [view, setView] = useState<View>('grid')
  const [tab, setTab] = useState<Tab>('events')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [onlyAvailable] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

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
        is_tour: tab === 'catalog',
      })
      setEvents(data)
    } catch {
      toast.error('Не удалось загрузить мероприятия')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, search, onlyAvailable, tab])

  useEffect(() => {
    setSelectedCategory(null)
  }, [tab])

  useEffect(() => {
    const timer = setTimeout(fetchEvents, 300)
    return () => clearTimeout(timer)
  }, [fetchEvents])

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
              onClick={() => setTab('catalog')}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                tab === 'catalog' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              )}
            >
              Каталог
            </button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white px-4 pt-2 pb-2 border-b border-gray-100">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
            placeholder={tab === 'catalog' ? 'Поиск в каталоге...' : 'Поиск мероприятий...'}
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="bg-white border-b border-gray-100">
        <div className="flex flex-wrap gap-2 px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              selectedCategory === null
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <span className="text-base leading-none">{tab === 'catalog' ? '🗂️' : '🎯'}</span>
            {tab === 'catalog' ? 'Весь каталог' : 'Все'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                selectedCategory === cat.id
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <span className="text-base leading-none">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Events grid */}
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
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">{tab === 'catalog' ? '🗂️' : '🔍'}</div>
            <p className="font-semibold text-gray-500">
              {tab === 'catalog' ? 'В каталоге ничего не найдено' : 'Мероприятий не найдено'}
            </p>
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
        )}
      </div>

      {/* Map toggle FAB */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={() => setView('map')}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 active:bg-black text-white px-5 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
        >
          <Map className="w-4 h-4" />
          На карте
        </button>
      </div>
    </div>
  )
}
