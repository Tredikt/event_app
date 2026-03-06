import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { eventsApi } from '@/api/events'
import type { EventList } from '@/types'
import EventCard from '@/components/events/EventCard'

type Tab = 'organized' | 'joined'

export default function MyEventsPage() {
  const [tab, setTab] = useState<Tab>('joined')
  const [organized, setOrganized] = useState<EventList[]>([])
  const [joined, setJoined] = useState<EventList[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([eventsApi.myOrganized(), eventsApi.myJoined()])
      .then(([org, joined]) => {
        setOrganized(org.data)
        setJoined(joined.data)
      })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [])

  const events = tab === 'organized' ? organized : joined

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Мои события</h1>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button
          onClick={() => setTab('joined')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'joined' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Записан ({joined.length})
        </button>
        <button
          onClick={() => setTab('organized')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'organized' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Calendar className="w-4 h-4 inline mr-1.5" />
          Организую ({organized.length})
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-64 animate-pulse bg-gray-100" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">{tab === 'organized' ? '📋' : '🎯'}</div>
          <p className="font-medium text-gray-600">
            {tab === 'organized' ? 'Вы ещё не создавали мероприятий' : 'Вы ещё не записаны ни на одно мероприятие'}
          </p>
          <p className="text-sm mt-1">
            {tab === 'organized'
              ? <Link to="/events/new" className="text-blue-700 hover:underline">Создайте первое мероприятие</Link>
              : <Link to="/" className="text-blue-700 hover:underline">Найдите что-нибудь интересное</Link>}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  )
}
