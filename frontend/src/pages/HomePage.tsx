import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, Map, Plus } from 'lucide-react'
import { eventsApi } from '@/api/events'
import type { EventList, Category } from '@/types'
import EventCard from '@/components/events/EventCard'
import FilterBar from '@/components/events/FilterBar'
import EventMap from '@/components/map/EventMap'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type ViewMode = 'split' | 'list' | 'map'

export default function HomePage() {
  const [events, setEvents] = useState<EventList[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
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
      })
      setEvents(data)
    } catch {
      toast.error('Не удалось загрузить мероприятия')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, search, onlyAvailable])

  useEffect(() => {
    const timer = setTimeout(fetchEvents, 300)
    return () => clearTimeout(timer)
  }, [fetchEvents])

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Мероприятия рядом</h1>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {(['split', 'list', 'map'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {mode === 'split' ? '⊞' : mode === 'list' ? <List className="w-3.5 h-3.5 inline" /> : <Map className="w-3.5 h-3.5 inline" />}
                  {mode === 'split' ? ' Оба' : mode === 'list' ? ' Список' : ' Карта'}
                </button>
              ))}
            </div>
            {isAuthenticated && (
              <button onClick={() => navigate('/events/new')} className="btn-primary text-sm">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Создать</span>
              </button>
            )}
          </div>
          <FilterBar
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            search={search}
            onSearchChange={setSearch}
            onlyAvailable={onlyAvailable}
            onAvailableChange={setOnlyAvailable}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex gap-0">
          {(viewMode === 'list' || viewMode === 'split') && (
            <div className={clsx(
              'overflow-y-auto bg-gray-50',
              viewMode === 'split' ? 'w-full sm:w-[400px] flex-shrink-0 border-r border-gray-100' : 'w-full'
            )}>
              <div className={clsx(
                'p-3 grid gap-3',
                viewMode === 'list' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
              )}>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card overflow-hidden animate-pulse">
                      <div className="h-32 bg-gray-200" />
                      <div className="p-3 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                        <div className="h-1.5 bg-gray-100 rounded mt-3" />
                      </div>
                    </div>
                  ))
                ) : events.length === 0 ? (
                  <div className="col-span-full text-center py-16 text-gray-400">
                    <div className="text-5xl mb-3">🔍</div>
                    <p className="font-semibold text-gray-500">Мероприятий не найдено</p>
                    <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
                  </div>
                ) : (
                  events.map((event) => (
                    <EventCard key={event.id} event={event} compact={viewMode === 'split'} />
                  ))
                )}
              </div>
            </div>
          )}

          {(viewMode === 'map' || viewMode === 'split') && (
            <div className={clsx('flex-1 p-3', viewMode === 'split' && 'hidden sm:block')}>
              <EventMap events={events} height="100%" />
            </div>
          )}
        </div>
      </div>

      {/* Mobile FAB: show map */}
      {viewMode !== 'map' && (
        <button
          onClick={() => setViewMode('map')}
          className="sm:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white px-4 py-3 rounded-full shadow-lg transition-colors"
        >
          <Map className="w-5 h-5" />
          <span className="text-sm font-medium">Карта</span>
        </button>
      )}

      {/* Mobile FAB: back to list when on map */}
      {viewMode === 'map' && (
        <button
          onClick={() => setViewMode('list')}
          className="sm:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gray-800 hover:bg-gray-900 active:bg-black text-white px-4 py-3 rounded-full shadow-lg transition-colors"
        >
          <List className="w-5 h-5" />
          <span className="text-sm font-medium">Список</span>
        </button>
      )}
    </div>
  )
}
