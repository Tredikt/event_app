import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Map, List, Search /*, Star */ } from 'lucide-react'  // RATING DISABLED
import { eventsApi } from '@/api/events'
import { usersApi, OrganizerProfile } from '@/api/users'
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
  const [organizers, setOrganizers] = useState<OrganizerProfile[]>([])
  const [loading, setLoading] = useState(!initial.events)
  const [view, setView] = useState<View>('grid')
  const [tab, setTab] = useState<Tab>('events')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [onlyAvailable] = useState(false)
  const [isFree, setIsFree] = useState<boolean | null>(null)
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
        is_free: isFree ?? undefined,
      })
      setEvents(data)
    } catch {
      toast.error('Не удалось загрузить мероприятия')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, search, onlyAvailable, isFree])

  const fetchOrganizers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await usersApi.listOrganizers({
        search: search || undefined,
        category_id: selectedCategory ?? undefined,
      })
      setOrganizers(data)
    } catch {
      toast.error('Не удалось загрузить организаторов')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    setSelectedCategory(null)
    setSearch('')
  }, [tab])

  useEffect(() => {
    if (tab === 'events') {
      const timer = setTimeout(fetchEvents, 300)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(fetchOrganizers, 300)
      return () => clearTimeout(timer)
    }
  }, [tab, fetchEvents, fetchOrganizers])

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

      {/* Search bar */}
      <div className="bg-white px-4 pt-2 pb-2 border-b border-gray-100">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
            placeholder="Поиск..."
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
            <span className="text-base leading-none">🎯</span>
            Все
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
        {tab === 'events' && (
          <div className="flex gap-2 px-4 pb-3 max-w-2xl mx-auto">
            {([null, true, false] as (boolean | null)[]).map((val) => {
              const label = val === null ? 'Все' : val ? '🆓 Бесплатно' : '💰 Платные'
              return (
                <button
                  key={String(val)}
                  onClick={() => setIsFree(val)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium transition-all',
                    isFree === val ? 'bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className={clsx(tab === 'organizers' ? 'space-y-3' : 'grid grid-cols-2 gap-3')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card overflow-hidden animate-pulse">
                <div className={clsx(tab === 'organizers' ? 'h-16' : 'h-36', 'bg-gray-200')} />
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
          organizers.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-3">👤</div>
              <p className="font-semibold text-gray-500">Организаторов не найдено</p>
            </div>
          ) : (
            <div className="space-y-3">
              {organizers.map((org) => (
                <Link
                  key={org.id}
                  to={`/users/${org.id}`}
                  className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
                >
                  {org.avatar_url ? (
                    <img src={org.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-lg flex-shrink-0">
                      {org.first_name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{org.first_name} {org.last_name}</p>
                    {org.city && <p className="text-xs text-gray-400 mt-0.5">{org.city}</p>}
                    <p className="text-xs text-gray-500 mt-0.5">{org.events_count} мероприятий</p>
                  </div>
                  {/* RATING DISABLED — star rating in organizer card commented out */}
                  {/* <div className="flex items-center gap-1 text-yellow-500 flex-shrink-0">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-medium text-gray-700">{org.rating.toFixed(1)}</span>
                  </div> */}
                </Link>
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
